import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { HeaderComponent } from '../../components/header/header.component';
import { PhoneComponent } from '../../components/phone/phone.component';
import { RoadComponent } from '../../components/road/road.component';

type GameState = 'idle' | 'playing' | 'crashed' | 'avoided' | 'phone-timeout';

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
  protected readonly gameState = signal<GameState>('idle');
  protected readonly reactionTime = signal<string | null>(null);
  protected readonly distanceMeters = signal(0);
  protected readonly speedKph = signal(0);
  protected readonly keyUpPressed = signal(false);
  protected readonly keyDownPressed = signal(false);
  protected readonly elapsedTimeMs = signal(0);
  protected readonly phoneResetCount = signal(0);

  protected readonly isStarted = computed(() => this.gameState() === 'playing');

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
    this.gameState.set('playing');
    this.reactionTime.set(null);
  }

  private stopTimer(): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  protected onCrashed(reactionTime: string | null): void {
    this.stopTimer();
    this.gameState.set('crashed');
    this.reactionTime.set(reactionTime);
  }

  protected onAvoided(reactionTime: string | null): void {
    this.stopTimer();
    this.gameState.set('avoided');
    this.reactionTime.set(reactionTime);
  }

  protected onBrakingComplete(): void {
    this.stopTimer();
  }

  protected onPhoneGameOver(): void {
    this.stopTimer();
    this.gameState.set('phone-timeout');
  }

  protected restartGame(): void {
    this.stopTimer();
    this.elapsedTimeMs.set(0);
    this.distanceMeters.set(0);
    this.speedKph.set(0);
    this.reactionTime.set(null);
    this.phoneResetCount.update(c => c + 1);
    this.gameState.set('idle');
  }
}

