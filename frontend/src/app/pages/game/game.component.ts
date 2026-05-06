import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { HeaderComponent } from '../../components/header/header.component';
import { PhoneComponent } from '../../components/phone/phone.component';
import { RoadComponent } from '../../components/road/road.component';

@Component({
  selector: 'app-game',
  imports: [DecimalPipe, HeaderComponent, PhoneComponent, RoadComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.ArrowUp)': 'keyUpPressed.set(true)',
    '(window:keyup.ArrowUp)': 'keyUpPressed.set(false)',
    '(window:keydown.ArrowDown)': 'keyDownPressed.set(true)',
    '(window:keyup.ArrowDown)': 'keyDownPressed.set(false)',
  }
})
export class GameComponent {
  protected readonly isStarted = signal(false);
  protected readonly distanceMeters = signal(0);
  protected readonly speedKph = signal(0);
  protected readonly keyUpPressed = signal(false);
  protected readonly keyDownPressed = signal(false);
  protected readonly elapsedTimeMs = signal(0);

  protected readonly elapsedTimeFormatted = computed(() => {
    const totalSeconds = Math.floor(this.elapsedTimeMs() / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  private readonly destroyRef = inject(DestroyRef);
  private timerIntervalId: ReturnType<typeof setInterval> | null = null;
  private timerStartTime = 0;

  constructor() {
    effect(() => {
      if (this.isStarted() && this.keyUpPressed() && this.timerIntervalId === null) {
        this.timerStartTime = Date.now();
        this.timerIntervalId = setInterval(() => {
          this.elapsedTimeMs.set(Date.now() - this.timerStartTime);
        }, 500);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.timerIntervalId !== null) {
        clearInterval(this.timerIntervalId);
      }
    });
  }

  protected startGame(): void {
    this.isStarted.set(true);
  }
}
