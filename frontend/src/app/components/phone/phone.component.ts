import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { DistractionService } from '../../core/distraction.service';
import { IncomingCallComponent } from '../incoming-call/incoming-call.component';
import { NotificationOverlayComponent } from '../notification-overlay/notification-overlay.component';
import { ConversationsComponent } from '../conversations/conversations.component';
import { CallDistraction } from '../../core/distraction.models';

type AppIcon = {
  readonly label: string;
  readonly src: string;
  readonly alt: string;
};

@Component({
  selector: 'app-phone',
  imports: [NgOptimizedImage, MatBadgeModule, ConversationsComponent, IncomingCallComponent, NotificationOverlayComponent],
  templateUrl: './phone.component.html',
  styleUrl: './phone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneComponent {
  readonly gameRunning = input(false);
  readonly resetCount = input(0);
  readonly gameOver = output<void>();

  private readonly distractionService = inject(DistractionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly conversationsOpen = signal(false);
  protected readonly currentTime = signal(this.formatTime());

  protected readonly currentDistraction = this.distractionService.currentDistraction;
  protected readonly unreadSmsCount = this.distractionService.unreadSmsCount;
  protected readonly countdownProgress = this.distractionService.countdownProgress;

  protected readonly hasActiveDistraction = computed(() =>
    this.currentDistraction() !== null || this.unreadSmsCount() > 0
  );

  protected readonly incomingCall = computed(() => {
    const d = this.currentDistraction();
    return d?.type === 'call' ? (d as CallDistraction) : null;
  });

  protected readonly notificationDistraction = computed(() => {
    const d = this.currentDistraction();
    if (!d) return null;
    return ['battery', 'photo', 'reminder', 'music', 'location'].includes(d.type) ? d : null;
  });

  constructor() {
    const timeId = setInterval(() => this.currentTime.set(this.formatTime()), 1000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timeId);
      this.distractionService.stop();
    });

    // Reset phone display when REJOUER is clicked
    effect(() => {
      if (this.resetCount() > 0) {
        this.conversationsOpen.set(false);
        this.distractionService.reset();
      }
    });

    // Reset + start/stop service based on game state
    effect(() => {
      if (this.gameRunning()) {
        this.distractionService.start();
      } else {
        this.distractionService.stop();
      }
    });

    // Emit gameOver when service times out
    effect(() => {
      if (this.distractionService.timedOut()) {
        this.gameOver.emit();
      }
    });
  }

  private formatTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  protected readonly primaryApps: readonly AppIcon[] = [
    { label: 'Store', src: '/images/icons/store.jpg', alt: 'Icone Store' },
    { label: 'Gallery', src: '/images/icons/gallery.jpg', alt: 'Icone Gallery' },
    { label: 'Play Store', src: '/images/icons/play store.jpg', alt: 'Icone Play Store' },
    { label: 'Google', src: '/images/icons/google.jpg', alt: 'Icone dossier Google' }
  ];

  protected readonly dockApps: readonly AppIcon[] = [
    { label: 'Phone', src: '/images/icons/phone.jpg', alt: 'Icone Telephone' },
    { label: 'SMS', src: '/images/icons/sms.jpg', alt: 'Icone SMS' },
    { label: 'Internet', src: '/images/icons/internet.jpg', alt: 'Icone Internet' },
    { label: 'Camera', src: '/images/icons/camera.jpg', alt: 'Icone Camera' }
  ];

  protected readonly phoneIcon = this.dockApps[0];
  protected readonly smsIcon = this.dockApps[1];
  protected readonly internetIcon = this.dockApps[2];
  protected readonly cameraIcon = this.dockApps[3];

  protected openConversations(): void {
    this.conversationsOpen.set(true);
    this.distractionService.resetCountdown();
  }

  protected closeConversations(): void {
    this.conversationsOpen.set(false);
  }

  protected onCallAnswered(): void {
    this.distractionService.pauseCountdown();
  }

  protected dismissDistraction(): void {
    this.distractionService.dismiss();
  }
}
