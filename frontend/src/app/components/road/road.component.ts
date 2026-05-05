import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoadComponent {
  private static readonly carHeightPx = 96;
  private static readonly carGapPx = 48;
  private static readonly queueScrollDurationMs = 430;
  private static readonly spawnOffsetPx = 120;

  private readonly destroyRef = inject(DestroyRef);
  private readonly trafficLane = viewChild.required<ElementRef<HTMLDivElement>>('trafficLane');
  private readonly laneHeight = signal(0);

  private nextQueuedCarId = 0;

  readonly running = input(false);
  readonly queuedCars = signal<QueuedCar[]>([]);

  constructor() {
    effect((onCleanup) => {
      if (!this.running() || !this.laneHeight()) {
        return;
      }

      let frameId = 0;
      let previousTimestamp = 0;

      const animate = (timestamp: number) => {
        if (previousTimestamp) {
          this.advanceQueuedCars(timestamp - previousTimestamp);
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

  private advanceQueuedCars(deltaMs: number): void {
    const laneHeight = this.laneHeight();
    const deltaPx = (this.getCarSpacingPx() / RoadComponent.queueScrollDurationMs) * deltaMs;
    const removalThreshold = laneHeight + RoadComponent.carHeightPx;

    this.queuedCars.update((cars) => {
      const movedCars = cars
        .map((car) => ({ ...car, top: car.top + deltaPx }))
        .filter((car) => car.top < removalThreshold);

      return this.fillQueuedCars(movedCars, laneHeight);
    });
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
}