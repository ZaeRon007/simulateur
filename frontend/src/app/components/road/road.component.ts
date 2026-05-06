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
  private static readonly centerLinePatternHeightPx = 24;
  private static readonly carLengthMeters = 2.61;
  private static readonly carDistanceGapMeters = 1.5;
  private static readonly metersPerPixel =
    (RoadComponent.carLengthMeters + RoadComponent.carDistanceGapMeters) /
    (RoadComponent.carHeightPx + RoadComponent.carGapPx);
  private static readonly spawnOffsetPx = 120;
  private static readonly maxSpeedKph = 50;
  private static readonly maxSpeedPxPerMs =
    (RoadComponent.maxSpeedKph / 3.6) /
    (RoadComponent.metersPerPixel * 1000);
  private static readonly accelerationMs = 1500;
  private static readonly coastingDecelerationMs = 3000;
  // Braking distances (m) at each integer km/h speed (index = km/h, 0–50)
  private static readonly BRAKING_DISTANCE_TABLE = [
    0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 7, 8, 9, 10, 10, 11, 12, 13,
    13, 14, 15, 16, 17, 17, 18, 19, 20, 21, 22, 23, 23, 24, 25, 26, 27,
    28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 42
  ];

  private readonly destroyRef = inject(DestroyRef);
  private readonly trafficLane = viewChild.required<ElementRef<HTMLDivElement>>('trafficLane');
  private readonly laneHeight = signal(0);

  private nextQueuedCarId = 0;
  private travelledDistanceMeters = 0;
  private currentSpeedPxPerMs = 0;
  private isAccelerating = false;
  private isBrakingActive = false;
  private brakingDecelPxPerMs2 = 0;

  readonly running = input(false);
  readonly distanceMeters = output<number>();
  readonly speedKph = output<number>();
  readonly queuedCars = signal<QueuedCar[]>([]);
  readonly indicatorLit = signal(false);
  readonly centerLineOffsetPx = signal(0);
  readonly brakeLightsLit = signal(false);

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
        this.travelledDistanceMeters = 0;
        this.currentSpeedPxPerMs = 0;
        this.isAccelerating = false;
        this.isBrakingActive = false;
        this.brakingDecelPxPerMs2 = 0;
        this.brakeLightsLit.set(false);
        this.centerLineOffsetPx.set(0);
        this.distanceMeters.emit(0);
        this.speedKph.emit(0);
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
          } else if (this.isBrakingActive) {
            this.currentSpeedPxPerMs = Math.max(
              this.currentSpeedPxPerMs - this.brakingDecelPxPerMs2 * deltaMs,
              0
            );
            if (this.currentSpeedPxPerMs === 0) {
              this.isBrakingActive = false;
              this.brakingDecelPxPerMs2 = 0;
              this.brakeLightsLit.set(false);
            }
          } else if (this.currentSpeedPxPerMs > 0) {
            this.currentSpeedPxPerMs = Math.max(
              this.currentSpeedPxPerMs - maxSpeed * (deltaMs / RoadComponent.coastingDecelerationMs),
              0
            );
          }

          const currentSpeedMetersPerSecond = this.getCurrentSpeedMetersPerSecond();
          this.speedKph.emit(currentSpeedMetersPerSecond * 3.6);

          if (this.currentSpeedPxPerMs > 0) {
            const deltaPx = this.currentSpeedPxPerMs * deltaMs;
            const travelledDeltaPx = this.advanceQueuedCars(deltaPx);
            this.centerLineOffsetPx.update(
              (offsetPx) => (offsetPx + travelledDeltaPx) % RoadComponent.centerLinePatternHeightPx
            );
            this.travelledDistanceMeters += currentSpeedMetersPerSecond * (deltaMs / 1000);
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

    const speedKph = Math.min(50, Math.round(this.getCurrentSpeedMetersPerSecond() * 3.6));
    const distanceMeters = RoadComponent.BRAKING_DISTANCE_TABLE[speedKph];

    if (distanceMeters <= 0) {
      this.currentSpeedPxPerMs = 0;
      this.speedKph.emit(0);
      return;
    }

    const distancePx = distanceMeters / RoadComponent.metersPerPixel;
    this.brakingDecelPxPerMs2 = (this.currentSpeedPxPerMs * this.currentSpeedPxPerMs) / (2 * distancePx);
    this.isBrakingActive = true;
    this.isAccelerating = false;
    this.brakeLightsLit.set(true);
  }

  protected onBrakeEnd(): void {
    // No-op: braking is committed until full stop
  }
}