import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

interface RoadSegment {
  offsetY: number;
  canvas: HTMLCanvasElement;
}

interface OncomingCar {
  top: number;
  speedPxPerMs: number;
  braking: boolean;
  ownTravelledPx: number;
  brakeTravelPx: number;
}

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
  private static readonly carHeightPx = 96;
  private static readonly carWidthPx = 54;
  private static readonly carGapPx = 48;
  private static readonly carLengthMeters = 2.61;
  private static readonly carDistanceGapMeters = 1.5;
  private static readonly metersPerPixel =
    (RoadComponent.carLengthMeters + RoadComponent.carDistanceGapMeters) /
    (RoadComponent.carHeightPx + RoadComponent.carGapPx);
  private static readonly spawnOffsetPx = 120;
  private static readonly maxSpeedKph = 30;
  private static readonly maxSpeedPxPerMs =
    (RoadComponent.maxSpeedKph / 3.6) /
    (RoadComponent.metersPerPixel * 1000);
  private static readonly accelerationMs = 1500;
  private static readonly coastingDecelerationMs = 3000;
  private static readonly emergencyBrakingDecelMs2 = 8;
  private static readonly oncomingCarSpeedKph = 30;
  private static readonly oncomingCarSpeedPxPerMs =
    (RoadComponent.oncomingCarSpeedKph / 3.6) /
    (RoadComponent.metersPerPixel * 1000);
  private static readonly oncomingBrakeTravelRatio = 0.15;
  private static readonly targetFps = 26;
  private static readonly frameIntervalMs = 1000 / RoadComponent.targetFps;
  private static readonly dashOnPx = 12;
  private static readonly dashPatternPx = 24;

  private readonly destroyRef = inject(DestroyRef);
  private readonly roadCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('roadCanvas');
  private readonly laneHeight = signal(0);

  private ctx: CanvasRenderingContext2D | null = null;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private segments: RoadSegment[] = [];
  private queuedCarTops: number[] = [];
  private oncomingCarState: OncomingCar | null = null;
  private scrollOffset = 0;

  private travelledDistanceMeters = 0;
  private currentSpeedPxPerMs = 0;
  private isAccelerating = false;
  private isBrakingActive = false;
  private brakingDecelPxPerMs2 = 0;

  private oncomingVisible = false;
  private reactionStartMs: number | null = null;

  readonly running = input(false);
  readonly distanceMeters = output<number>();
  readonly speedKph = output<number>();
  readonly crashed = output<string | null>();
  readonly brakingComplete = output<void>();
  readonly avoidedCar = output<string | null>();
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
    effect((onCleanup) => {
      if (!this.running()) {
        this.indicatorLit.set(false);
        return;
      }
      const id = setInterval(() => this.indicatorLit.update(v => !v), 450);
      onCleanup(() => clearInterval(id));
    });

    effect((onCleanup) => {
      if (!this.running()) {
        this.travelledDistanceMeters = 0;
        this.currentSpeedPxPerMs = 0;
        this.isAccelerating = false;
        this.isBrakingActive = false;
        this.brakingDecelPxPerMs2 = 0;
        this.brakeLightsLit.set(false);
        this.scrollOffset = 0;
        this.distanceMeters.emit(0);
        this.speedKph.emit(0);
        this.oncomingCarState = null;
        this.gameOver.set(false);
        this.avoided.set(false);
        this.oncomingVisible = false;
        this.reactionStartMs = null;
        this.reactionTimeMs.set(null);
        return;
      }

      if (!this.laneHeight()) return;

      this.scrollOffset = 0;
      this.initSegments();
      this.initQueuedCars();

      const spawnDelayMs = 10_000 + Math.random() * 35_000;
      const spawnTimeoutId = setTimeout(() => {
        if (!this.running() || this.gameOver()) return;
        this.oncomingCarState = {
          top: -RoadComponent.carHeightPx,
          speedPxPerMs: RoadComponent.oncomingCarSpeedPxPerMs,
          braking: false,
          ownTravelledPx: 0,
          brakeTravelPx: this.laneHeight() * RoadComponent.oncomingBrakeTravelRatio,
        };
      }, spawnDelayMs);
      onCleanup(() => clearTimeout(spawnTimeoutId));

      let frameId = 0;
      let previousTimestamp = 0;

      const animate = (timestamp: number) => {
        if (this.gameOver()) return;

        const elapsed = previousTimestamp ? timestamp - previousTimestamp : 0;

        if (elapsed >= RoadComponent.frameIntervalMs || !previousTimestamp) {
          previousTimestamp = timestamp;

          if (elapsed > 0) {
            const deltaMs = Math.min(elapsed, RoadComponent.frameIntervalMs * 2);
            this.updatePhysics(deltaMs);

            let playerDeltaPx = 0;
            if (this.currentSpeedPxPerMs > 0) {
              playerDeltaPx = this.currentSpeedPxPerMs * deltaMs;
              this.scrollOffset += playerDeltaPx;
              this.recycleSegments(playerDeltaPx);
              this.advanceQueuedCars(playerDeltaPx);
              const speedMs = this.getCurrentSpeedMetersPerSecond();
              this.travelledDistanceMeters += speedMs * (deltaMs / 1000);
              this.distanceMeters.emit(this.travelledDistanceMeters);
            }

            this.updateOncomingCar(deltaMs, playerDeltaPx);
          }

          this.drawFrame();
        }

        frameId = requestAnimationFrame(animate);
      };

      frameId = requestAnimationFrame(animate);
      onCleanup(() => cancelAnimationFrame(frameId));
    });

    afterNextRender(() => {
      const canvasEl = this.roadCanvas().nativeElement;
      this.ctx = canvasEl.getContext('2d');

      const syncSize = () => {
        const w = canvasEl.clientWidth;
        const h = canvasEl.clientHeight;
        if (!w || !h || (w === this.canvasWidth && h === this.canvasHeight)) return;

        canvasEl.width = w;
        canvasEl.height = h;
        this.canvasWidth = w;
        this.canvasHeight = h;
        this.laneHeight.set(h);
        this.initSegments();
        this.initQueuedCars();
        this.drawFrame();
      };

      syncSize();

      const ro = new ResizeObserver(() => syncSize());
      ro.observe(canvasEl);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  // ── Segment management ────────────────────────────────────────────────────

  /**
   * Pre-renders an off-screen road segment (background + border lines).
   * Center-line dashes are drawn dynamically in drawFrame to remain seamless.
   */
  private prerenderSegment(offsetY: number): RoadSegment {
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d')!;

    const roadLeft = Math.round(w * 0.12);
    const roadRight = Math.round(w * 0.88);

    ctx.fillStyle = '#90c890';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(roadLeft, 0, roadRight - roadLeft, h);

    ctx.fillStyle = '#111111';
    ctx.fillRect(roadLeft, 0, 3, h);
    ctx.fillRect(roadRight - 3, 0, 3, h);

    return { offsetY, canvas: offscreen };
  }

  private initSegments(): void {
    this.segments = [
      this.prerenderSegment(-this.canvasHeight), // pre-rendered, above screen
      this.prerenderSegment(0),                  // visible
    ];
  }

  private recycleSegments(deltaPx: number): void {
    for (const seg of this.segments) {
      seg.offsetY += deltaPx;
    }
    this.terminateOffscreenSegments();
    this.ensurePrerenderedSegment();
  }

  /** Removes segments whose top edge has scrolled past the bottom of the canvas. */
  private terminateOffscreenSegments(): void {
    this.segments = this.segments.filter(seg => seg.offsetY < this.canvasHeight);
  }

  /** Ensures at least one fully pre-rendered segment sits above the visible area. */
  private ensurePrerenderedSegment(): void {
    while (!this.segments.length || this.segments[0].offsetY > -this.canvasHeight) {
      const topOffsetY = this.segments.length ? this.segments[0].offsetY : 0;
      this.segments.unshift(this.prerenderSegment(topOffsetY - this.canvasHeight));
    }
  }

  // ── Queued car management ─────────────────────────────────────────────────

  private initQueuedCars(): void {
    this.queuedCarTops = [];
    const spacing = RoadComponent.carHeightPx + RoadComponent.carGapPx;
    for (
      let top = -RoadComponent.spawnOffsetPx;
      top < this.canvasHeight + RoadComponent.carHeightPx;
      top += spacing
    ) {
      this.queuedCarTops.push(top);
    }
  }

  private advanceQueuedCars(deltaPx: number): void {
    const spacing = RoadComponent.carHeightPx + RoadComponent.carGapPx;
    this.queuedCarTops = this.queuedCarTops
      .map(top => top + deltaPx)
      .filter(top => top < this.canvasHeight + RoadComponent.carHeightPx);

    while (!this.queuedCarTops.length || this.queuedCarTops[0] > -RoadComponent.spawnOffsetPx) {
      const firstTop = this.queuedCarTops.length ? this.queuedCarTops[0] : 0;
      this.queuedCarTops.unshift(firstTop - spacing);
    }
  }

  // ── Physics ───────────────────────────────────────────────────────────────

  private updatePhysics(deltaMs: number): void {
    const maxSpeed = RoadComponent.maxSpeedPxPerMs;

    if (this.isAccelerating) {
      this.currentSpeedPxPerMs = Math.min(
        this.currentSpeedPxPerMs + maxSpeed * (deltaMs / RoadComponent.accelerationMs),
        maxSpeed
      );
    } else if (this.isBrakingActive) {
      this.currentSpeedPxPerMs = Math.max(
        this.currentSpeedPxPerMs - this.brakingDecelPxPerMs2 * deltaMs,
        0
      );
      if (this.currentSpeedPxPerMs === 0) {
        this.isBrakingActive = false;
        this.brakingDecelPxPerMs2 = 0;
        this.brakeLightsLit.set(false);
        this.brakingComplete.emit();
      }
    } else if (this.currentSpeedPxPerMs > 0) {
      this.currentSpeedPxPerMs = Math.max(
        this.currentSpeedPxPerMs - maxSpeed * (deltaMs / RoadComponent.coastingDecelerationMs),
        0
      );
    }

    this.speedKph.emit(this.getCurrentSpeedMetersPerSecond() * 3.6);
  }

  // ── Oncoming car ──────────────────────────────────────────────────────────

  private updateOncomingCar(deltaMs: number, playerDeltaPx: number): void {
    const oncoming = this.oncomingCarState;
    if (!oncoming) return;

    // Start reaction timer when front bumper first enters the screen
    if (!this.oncomingVisible && oncoming.top + RoadComponent.carHeightPx > 0) {
      this.oncomingVisible = true;
      this.reactionStartMs = Date.now();
    }

    const decelPxPerMs2 =
      RoadComponent.emergencyBrakingDecelMs2 / (RoadComponent.metersPerPixel * 1_000_000);

    let newSpeed = oncoming.speedPxPerMs;
    let braking = oncoming.braking;

    if (braking) {
      newSpeed = Math.max(0, oncoming.speedPxPerMs - decelPxPerMs2 * deltaMs);
    }

    const ownDelta = newSpeed * deltaMs;
    const newTop = oncoming.top + ownDelta + playerDeltaPx;
    const playerTopPx = this.laneHeight() - 16 - RoadComponent.carHeightPx;

    if (!this.avoided() && newTop + RoadComponent.carHeightPx >= playerTopPx) {
      if (this.reactionStartMs !== null && this.reactionTimeMs() === null) {
        this.reactionTimeMs.set(Date.now() - this.reactionStartMs);
      }
      this.gameOver.set(true);
      this.crashed.emit(this.reactionTimeFormatted());
      return;
    }

    if (newSpeed === 0) {
      this.oncomingCarState = {
        ...oncoming,
        top: newTop,
        speedPxPerMs: 0,
        braking: true,
        ownTravelledPx: oncoming.ownTravelledPx + ownDelta,
      };
      if (!this.avoided()) {
        this.avoided.set(true);
        this.avoidedCar.emit(this.reactionTimeFormatted());
      }
      return;
    }

    this.oncomingCarState = {
      ...oncoming,
      top: newTop,
      speedPxPerMs: newSpeed,
      braking,
      ownTravelledPx: oncoming.ownTravelledPx + ownDelta,
    };
  }

  // ── Canvas rendering ──────────────────────────────────────────────────────

  private drawFrame(): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvasWidth || !this.canvasHeight) return;

    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    for (const seg of this.segments) {
      ctx.drawImage(seg.canvas, 0, seg.offsetY);
    }

    this.drawCenterLine(ctx);

    const trafficCx = Math.round(this.canvasWidth * 0.69);
    for (const top of this.queuedCarTops) {
      this.drawCar(ctx, trafficCx, top, true, '#f4f4f4', true);
    }

    if (this.oncomingCarState) {
      const oncomingCx = Math.round(this.canvasWidth * 0.31);
      this.drawCar(ctx, oncomingCx, this.oncomingCarState.top, false, '#e8e0f0', true);
    }
  }

  private drawCenterLine(ctx: CanvasRenderingContext2D): void {
    const phase = this.scrollOffset % RoadComponent.dashPatternPx;
    const cx = Math.round(this.canvasWidth / 2);
    ctx.fillStyle = '#111111';
    for (
      let y = phase - RoadComponent.dashPatternPx;
      y < this.canvasHeight;
      y += RoadComponent.dashPatternPx
    ) {
      ctx.fillRect(cx - 1, y, 3, RoadComponent.dashOnPx);
    }
  }

  /**
   * Draws a car onto the canvas.
   * @param flip - when true, flips vertically so the rear (brake lights) face downward,
   *               matching queued cars in the same lane as the player.
   */
  private drawCar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    flip: boolean,
    bodyColor: string,
    rearLightsRed: boolean,
  ): void {
    const w = RoadComponent.carWidthPx;
    const h = RoadComponent.carHeightPx;
    const x = cx - w / 2;

    ctx.save();
    if (flip) {
      ctx.translate(cx, topY + h / 2);
      ctx.scale(1, -1);
      ctx.translate(-cx, -(topY + h / 2));
    }

    // Body
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, topY, w, h, 18);
    ctx.fill();
    ctx.stroke();

    // Window
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.roundRect(x + 9, topY + 12, 32, 34, 8);
    ctx.fill();
    ctx.stroke();

    // Rear lights (top: topY + 7, center y: topY + 12)
    ctx.fillStyle = rearLightsRed ? '#ff2626' : '#741818';
    ctx.beginPath();
    ctx.ellipse(x + 11.5, topY + 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w - 11.5, topY + 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front lights (bottom: topY + h - 7, center y: topY + h - 12)
    ctx.fillStyle = '#d8d8d8';
    ctx.beginPath();
    ctx.ellipse(x + 11.5, topY + h - 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w - 11.5, topY + h - 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wheels (6 × 18, radius 4)
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(x - 5, topY + 14, 6, 18, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + w - 1, topY + 14, 6, 18, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x - 5, topY + h - 34, 6, 18, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + w - 1, topY + h - 34, 6, 18, 4);
    ctx.fill();

    ctx.restore();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getCurrentSpeedMetersPerSecond(): number {
    return this.currentSpeedPxPerMs * RoadComponent.metersPerPixel * 1000;
  }

  protected onAccelerateStart(): void {
    if (this.isBrakingActive || !this.running()) return;
    this.isAccelerating = true;
  }

  protected onAccelerateEnd(): void {
    this.isAccelerating = false;
  }

  protected onBrakeStart(): void {
    if (this.isBrakingActive || !this.running() || this.currentSpeedPxPerMs <= 0) return;

    // Braking before oncoming car is visible (but car exists) = PERDU
    if (this.oncomingCarState && !this.oncomingVisible) {
      this.gameOver.set(true);
      this.crashed.emit(null);
      return;
    }

    // Stop reaction timer on first brake press
    if (this.oncomingVisible && this.reactionStartMs !== null && this.reactionTimeMs() === null) {
      this.reactionTimeMs.set(Date.now() - this.reactionStartMs);
    }

    this.brakingDecelPxPerMs2 =
      RoadComponent.emergencyBrakingDecelMs2 / (RoadComponent.metersPerPixel * 1_000_000);
    this.isBrakingActive = true;
    this.isAccelerating = false;
    this.brakeLightsLit.set(true);

    if (this.oncomingCarState && !this.oncomingCarState.braking) {
      this.oncomingCarState = { ...this.oncomingCarState, braking: true };
    }
  }

  protected onBrakeEnd(): void {
    // No-op: braking is committed until full stop
  }
}