import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  viewChild
} from '@angular/core';
import { AudioService } from '../../core/audio.service';
import { RoadSharedState } from './road-shared-state';
import { RoadPhysics, RoadPhysicsCallbacks } from './road-physics';
import { Road2dRenderer } from './road-2d-renderer';
import { RoadThreeScene } from './road-three';
import { initFerrari } from './road-ferrari';

@Component({
  selector: 'app-road',
  templateUrl: './road.component.html',
  styleUrl: './road.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.arrowup)': 'onAccelerateStart()',
    '(window:keyup.arrowup)': 'onAccelerateEnd()',
    '(window:keydown.arrowdown)': 'onBrakeStart()',
    '(window:keyup.arrowdown)': 'onBrakeEnd()',
  }
})
export class RoadComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly audioService = inject(AudioService);
  private readonly ngZone = inject(NgZone);
  private readonly roadCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('roadCanvas');
  private readonly scene3dCanvas = viewChild<ElementRef<HTMLCanvasElement>>('scene3dCanvas');
  private readonly laneHeight = signal(0);

  private readonly shared = new RoadSharedState();
  private readonly physics: RoadPhysics;
  private renderer2d!: Road2dRenderer;
  private scene3d!: RoadThreeScene;

  // Dedup check for ResizeObserver
  private canvasWidth = 0;
  private canvasHeight = 0;

  // ── Inputs / Outputs ────────────────────────────────────────────────────────
  readonly running = input(false);
  readonly roadBlur = input('');
  readonly distanceMeters = output<number>();
  readonly speedKph = output<number>();
  readonly crashed = output<string | null>();
  readonly brakingComplete = output<void>();
  readonly avoidedCar = output<string | null>();
  readonly brakedNeedlessly = output<void>();
  /** Normalized progress of the oncoming car: -1 = not spawned, 0–1 = approaching (1 = collision point). */
  readonly oncomingCarProgress = output<number>();
  readonly indicatorLit = signal(false);
  readonly brakeLightsLit = signal(false);
  readonly gameOver = signal(false);
  readonly avoided = signal(false);
  readonly reactionTimeMs = signal<number | null>(null);
  readonly reactionTimeFormatted = computed(() => {
    const ms = this.reactionTimeMs();
    if (ms === null) return null;
    return (ms / 1000).toFixed(2) + 's';
  });

  constructor() {
    const callbacks: RoadPhysicsCallbacks = {
      onCrash: (rt) => { this.gameOver.set(true); this.crashed.emit(rt); },
      onAvoided: (rt) => { this.avoided.set(true); this.avoidedCar.emit(rt); },
      onBrakedNeedlessly: () => { this.gameOver.set(true); this.brakedNeedlessly.emit(); },
      onBrakingComplete: () => this.brakingComplete.emit(),
      onSpeedChange: (kph) => this.speedKph.emit(kph),
      onDistanceChange: (m) => this.distanceMeters.emit(m),
      onOncomingProgress: (p) => this.oncomingCarProgress.emit(p),
      onBrakeLightsLit: (lit) => this.brakeLightsLit.set(lit),
      onReactionTime: (ms) => this.reactionTimeMs.set(ms),
    };
    this.physics = new RoadPhysics(
      this.shared,
      this.audioService,
      () => this.laneHeight(),
      () => this.running(),
      callbacks,
    );

    // Indicator blink while running
    effect((onCleanup) => {
      if (!this.running()) {
        this.indicatorLit.set(false);
        return;
      }
      const id = setInterval(() => this.indicatorLit.update(v => !v), 450);
      onCleanup(() => clearInterval(id));
    });

    // Main game loop (reset + run)
    effect((onCleanup) => {
      if (!this.running()) {
        this.physics.reset();
        this.brakeLightsLit.set(false);
        this.shared.scrollOffset = 0;
        this.distanceMeters.emit(0);
        this.speedKph.emit(0);
        this.gameOver.set(false);
        this.avoided.set(false);
        this.reactionTimeMs.set(null);
        this.scene3d?.resetQueueCars();
        return;
      }

      if (!this.laneHeight()) return;

      this.audioService.startEngine();

      this.shared.scrollOffset = 0;
      this.renderer2d.initSegments();
      this.renderer2d.initQueuedCars();

      const spawnDelayMs = 10_000 + Math.random() * 35_000;
      const spawnTimeoutId = setTimeout(() => {
        if (!this.running() || this.gameOver()) return;
        this.physics.spawnOncomingCar(this.laneHeight());
      }, spawnDelayMs);
      onCleanup(() => clearTimeout(spawnTimeoutId));

      let frameId = 0;
      let previousTimestamp = 0;

      const animate = (timestamp: number) => {
        if (this.gameOver()) return;

        const deltaMs = previousTimestamp ? Math.min(timestamp - previousTimestamp, 50) : 0;
        previousTimestamp = timestamp;

        if (deltaMs > 0) {
          this.physics.updatePhysics(deltaMs);

          let playerDeltaPx = 0;
          if (this.physics.currentSpeed > 0) {
            playerDeltaPx = this.physics.currentSpeed * deltaMs;
            this.shared.scrollOffset += playerDeltaPx;
            this.renderer2d.recycleSegments(playerDeltaPx);
            this.renderer2d.advanceQueuedCars(playerDeltaPx);
            this.physics.accumulateDistance(deltaMs);
          }

          this.physics.updateOncomingCar(deltaMs, playerDeltaPx);
        }

        this.renderer2d.drawFrame();
        frameId = requestAnimationFrame(animate);
      };

      frameId = requestAnimationFrame(animate);
      onCleanup(() => {
        cancelAnimationFrame(frameId);
        this.audioService.stopEngine();
      });
    });

    // Apply roadBlur CSS filter to the 3D canvas
    effect(() => {
      const blur = this.roadBlur();
      const canvasEl = this.scene3dCanvas()?.nativeElement;
      if (canvasEl) canvasEl.style.filter = blur;
    });

    // Canvas and THREE.js initialization (after first render)
    afterNextRender(() => {
      const canvas2d = this.roadCanvas().nativeElement;
      const canvas3d = this.scene3dCanvas()!.nativeElement;

      const ctx = canvas2d.getContext('2d')!;
      this.renderer2d = new Road2dRenderer(ctx, this.shared, () => this.physics.oncomingCarState);

      const syncSize = () => {
        const w = canvas2d.clientWidth;
        const h = canvas2d.clientHeight;
        if (!w || !h || (w === this.canvasWidth && h === this.canvasHeight)) return;

        canvas2d.width = w;
        canvas2d.height = h;
        this.canvasWidth = w;
        this.canvasHeight = h;
        this.shared.canvasWidth = w;
        this.shared.canvasHeight = h;
        this.laneHeight.set(h);
        this.renderer2d.initSegments();
        this.renderer2d.initQueuedCars();
        this.renderer2d.drawFrame();
      };

      syncSize();

      const ro = new ResizeObserver(() => syncSize());
      ro.observe(canvas2d);
      this.destroyRef.onDestroy(() => ro.disconnect());

      this.ngZone.runOutsideAngular(() => {
        this.scene3d = new RoadThreeScene(this.shared, () => this.running());
        this.scene3d.init(canvas3d);
        this.scene3d.startLoop();
        this.scene3d.setupResize(canvas3d);
        initFerrari(this.scene3d.scene, (ferrari, queue) => {
          this.scene3d.setFerrariGroups(ferrari, queue);
        });
      });
    });

    // THREE.js cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.scene3d?.dispose();
    });
  }

  protected onAccelerateStart(): void { this.physics.onAccelerateStart(); }
  protected onAccelerateEnd(): void { this.physics.onAccelerateEnd(); }
  protected onBrakeStart(): void { this.physics.onBrakeStart(); }
  protected onBrakeEnd(): void { this.physics.onBrakeEnd(); }
}
