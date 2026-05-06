import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

interface QueuedCar {
  id: number;
  top: number;
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
  private static readonly carGapPx = 48;
  private static readonly carLengthMeters = 2.61;
  private static readonly carDistanceGapMeters = 1.5;
  private static readonly metersPerPixel =
    (RoadComponent.carLengthMeters + RoadComponent.carDistanceGapMeters) /
    (RoadComponent.carHeightPx + RoadComponent.carGapPx);
  private static readonly queueScrollDurationMs = 430;
  private static readonly spawnOffsetPx = 120;
  private static readonly maxSpeedPxPerMs =
    (RoadComponent.carHeightPx + RoadComponent.carGapPx) / RoadComponent.queueScrollDurationMs;
  private static readonly accelerationMs = 1500;
  private static readonly decelerationMs = 1000;

  private readonly destroyRef = inject(DestroyRef);
  private readonly trafficLane = viewChild.required<ElementRef<HTMLDivElement>>('trafficLane');
  private readonly laneHeight = signal(0);

  private nextQueuedCarId = 0;
  private leftLaneReferencePx = 0;
  private travelledDistanceMeters = 0;
  private currentSpeedPxPerMs = 0;
  private isAccelerating = false;
  private isBraking = false;

  readonly running = input(false);
  readonly distanceMeters = output<number>();
  readonly queuedCars = signal<QueuedCar[]>([]);
  readonly indicatorLit = signal(false);

  constructor() {
    effect((onCleanup) => {
      if (!this.running()) {
        this.indicatorLit.set(false);
        return;
      }

      const blinkIntervalId = setInterval(() => {
        this.indicatorLit.update((isLit) => !isLit);
      }, 450);

      onCleanup(() => clearInterval(blinkIntervalId));
    });

    effect((onCleanup) => {
      if (!this.running()) {
        this.leftLaneReferencePx = 0;
        this.travelledDistanceMeters = 0;
        this.currentSpeedPxPerMs = 0;
        this.isAccelerating = false;
        this.isBraking = false;
        this.distanceMeters.emit(0);
        return;
      }

      if (!this.laneHeight()) {
        return;
      }

      let frameId = 0;
      let previousTimestamp = 0;

      const animate = (timestamp: number) => {
        if (previousTimestamp) {
          const deltaMs = timestamp - previousTimestamp;
          const maxSpeed = RoadComponent.maxSpeedPxPerMs;

          if (this.isAccelerating) {
            this.currentSpeedPxPerMs = Math.min(
              this.currentSpeedPxPerMs + maxSpeed * (deltaMs / RoadComponent.accelerationMs),
              maxSpeed
            );
          } else if (this.isBraking) {
            this.currentSpeedPxPerMs = Math.max(
              this.currentSpeedPxPerMs - maxSpeed * (deltaMs / RoadComponent.decelerationMs),
              0
            );
          }

          if (this.currentSpeedPxPerMs > 0) {
            const deltaPx = this.currentSpeedPxPerMs * deltaMs;
            this.leftLaneReferencePx += this.advanceQueuedCars(deltaPx);
            this.travelledDistanceMeters = this.leftLaneReferencePx * RoadComponent.metersPerPixel;
            this.distanceMeters.emit(this.travelledDistanceMeters);
          }
        }

        previousTimestamp = timestamp;
        frameId = requestAnimationFrame(animate);
      };

      frameId = requestAnimationFrame(animate);

      onCleanup(() => cancelAnimationFrame(frameId));
    });

    afterNextRender(() => {
      const trafficLaneElement = this.trafficLane().nativeElement;
      const syncLaneHeight = () => {
        const nextHeight = trafficLaneElement.clientHeight;

        if (!nextHeight || nextHeight === this.laneHeight()) {
          return;
        }

        this.laneHeight.set(nextHeight);
        this.queuedCars.update((cars) => this.fillQueuedCars(cars, nextHeight));
      };

      syncLaneHeight();

      const resizeObserver = new ResizeObserver(() => syncLaneHeight());
      resizeObserver.observe(trafficLaneElement);

      this.destroyRef.onDestroy(() => resizeObserver.disconnect());
    });
  }

  private createInitialQueuedCars(laneHeight: number): QueuedCar[] {
    const cars: QueuedCar[] = [];
    const spacing = this.getCarSpacingPx();

    for (
      let top = -RoadComponent.spawnOffsetPx;
      top < laneHeight + RoadComponent.carHeightPx;
      top += spacing
    ) {
      cars.push({ id: this.nextQueuedCarId++, top });
    }

    return cars;
  }

  private advanceQueuedCars(deltaPx: number): number {
    const laneHeight = this.laneHeight();
    if (!laneHeight) {
      return 0;
    }

    const removalThreshold = laneHeight + RoadComponent.carHeightPx;

    this.queuedCars.update((cars) => {
      const movedCars = cars
        .map((car) => ({ ...car, top: car.top + deltaPx }))
        .filter((car) => car.top < removalThreshold);

      return this.fillQueuedCars(movedCars, laneHeight);
    });

    return deltaPx;
  }

  private fillQueuedCars(cars: QueuedCar[], laneHeight: number): QueuedCar[] {
    if (!laneHeight) {
      return cars;
    }

    if (!cars.length) {
      return this.createInitialQueuedCars(laneHeight);
    }

    const spacing = this.getCarSpacingPx();
    const queuedCars = [...cars].sort((firstCar, secondCar) => firstCar.top - secondCar.top);

    while (queuedCars[0].top > -RoadComponent.spawnOffsetPx) {
      queuedCars.unshift({
        id: this.nextQueuedCarId++,
        top: queuedCars[0].top - spacing
      });
    }

    while (queuedCars[queuedCars.length - 1].top < laneHeight) {
      queuedCars.push({
        id: this.nextQueuedCarId++,
        top: queuedCars[queuedCars.length - 1].top + spacing
      });
    }

    return queuedCars;
  }

  private getCarSpacingPx(): number {
    return RoadComponent.carHeightPx + RoadComponent.carGapPx;
  }

  protected onAccelerateStart(): void {
    this.isAccelerating = true;
    this.isBraking = false;
  }

  protected onAccelerateEnd(): void {
    this.isAccelerating = false;
  }

  protected onBrakeStart(): void {
    this.isBraking = true;
    this.isAccelerating = false;
  }

  protected onBrakeEnd(): void {
    this.isBraking = false;
  }
}