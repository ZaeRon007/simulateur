import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CallDistraction } from '../../core/distraction.models';

type CallState = 'ringing' | 'active' | 'ended';

@Component({
  selector: 'app-incoming-call',
  templateUrl: './incoming-call.component.html',
  styleUrl: './incoming-call.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomingCallComponent implements OnInit {
  readonly distraction = input.required<CallDistraction>();
  readonly dismissed = output<void>();
  readonly callAnswered = output<void>();

  protected readonly callState = signal<CallState>('ringing');
  protected readonly sliderX = signal(0);
  protected readonly isDragging = signal(false);
  protected readonly callDurationMs = signal(0);
  protected readonly callDuration = computed(() => {
    const totalSeconds = Math.floor(this.callDurationMs() / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  });

  protected readonly contactInitials = computed(() => this.distraction().contact.avatarInitials);
  protected readonly contactName = computed(() => this.distraction().contact.name);
  protected readonly contactRelation = computed(() => this.distraction().contact.relation);
  protected readonly contactColor = computed(() => this.distraction().contact.avatarColor);

  private readonly destroyRef = inject(DestroyRef);
  private readonly TRACK_WIDTH = 200;
  private readonly THUMB_SIZE = 56;
  private readonly MAX_SLIDE = this.TRACK_WIDTH - this.THUMB_SIZE - 8;
  private dragStartX = 0;
  private activeCallTimeout: ReturnType<typeof setTimeout> | null = null;
  private durationIntervalId: ReturnType<typeof setInterval> | null = null;

  protected readonly sliderThumb = viewChild<ElementRef<HTMLElement>>('sliderThumb');

  ngOnInit(): void {
    // Auto-dismiss after 30s if no action
    this.activeCallTimeout = setTimeout(() => this.decline(), 30_000);
    this.destroyRef.onDestroy(() => {
      if (this.durationIntervalId !== null) clearInterval(this.durationIntervalId);
    });
  }

  protected answer(): void {
    if (this.callState() !== 'ringing') return;
    if (this.activeCallTimeout) clearTimeout(this.activeCallTimeout);
    this.callState.set('active');
    this.callDurationMs.set(0);
    this.durationIntervalId = setInterval(() => this.callDurationMs.update(ms => ms + 1000), 1000);
    this.callAnswered.emit();
  }

  protected hangUp(): void {
    this.endCall();
  }

  protected decline(): void {
    if (this.activeCallTimeout) clearTimeout(this.activeCallTimeout);
    this.callState.set('ended');
    setTimeout(() => this.dismissed.emit(), 1200);
  }

  private endCall(): void {
    if (this.durationIntervalId !== null) {
      clearInterval(this.durationIntervalId);
      this.durationIntervalId = null;
    }
    this.callState.set('ended');
    setTimeout(() => this.dismissed.emit(), 1200);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.callState() !== 'ringing') return;
    this.isDragging.set(true);
    this.dragStartX = event.clientX - this.sliderX();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;
    const newX = Math.max(0, Math.min(this.MAX_SLIDE, event.clientX - this.dragStartX));
    this.sliderX.set(newX);
  }

  protected onPointerUp(): void {
    if (!this.isDragging()) return;
    this.isDragging.set(false);
    if (this.sliderX() >= this.MAX_SLIDE * 0.85) {
      this.answer();
    } else {
      this.sliderX.set(0);
    }
  }
}
