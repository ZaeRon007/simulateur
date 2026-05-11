import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  BatteryDistraction,
  DistractionEvent,
  LocationDistraction,
  MusicDistraction,
  PhotoDistraction,
  ReminderDistraction,
} from '../../core/distraction.models';

@Component({
  selector: 'app-notification-overlay',
  templateUrl: './notification-overlay.component.html',
  styleUrl: './notification-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationOverlayComponent {
  readonly distraction = input.required<DistractionEvent>();
  readonly dismissed = output<void>();

  protected readonly asBattery = computed(() =>
    this.distraction().type === 'battery' ? (this.distraction() as BatteryDistraction) : null
  );
  protected readonly asPhoto = computed(() =>
    this.distraction().type === 'photo' ? (this.distraction() as PhotoDistraction) : null
  );
  protected readonly asReminder = computed(() =>
    this.distraction().type === 'reminder' ? (this.distraction() as ReminderDistraction) : null
  );
  protected readonly asMusic = computed(() =>
    this.distraction().type === 'music' ? (this.distraction() as MusicDistraction) : null
  );
  protected readonly asLocation = computed(() =>
    this.distraction().type === 'location' ? (this.distraction() as LocationDistraction) : null
  );

  protected dismiss(): void {
    this.dismissed.emit();
  }
}
