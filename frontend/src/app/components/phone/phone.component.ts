import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { ConversationsComponent } from '../conversations/conversations.component';

type AppIcon = {
  readonly label: string;
  readonly src: string;
  readonly alt: string;
};

@Component({
  selector: 'app-phone',
  imports: [NgOptimizedImage, MatBadgeModule, ConversationsComponent],
  templateUrl: './phone.component.html',
  styleUrl: './phone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneComponent {
  readonly phoneBadgeCount = input(0);
  readonly smsBadgeCount = input(0);
  protected readonly conversationsOpen = signal(false);

  protected readonly currentTime = signal(this.formatTime());

  constructor() {
    const intervalId = setInterval(() => this.currentTime.set(this.formatTime()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalId));
  }

  private formatTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  protected readonly primaryApps: readonly AppIcon[] = [
    {
      label: 'Store',
      src: '/images/icons/store.jpg',
      alt: 'Icone Store'
    },
    {
      label: 'Gallery',
      src: '/images/icons/gallery.jpg',
      alt: 'Icone Gallery'
    },
    {
      label: 'Play Store',
      src: '/images/icons/play store.jpg',
      alt: 'Icone Play Store'
    },
    {
      label: 'Google',
      src: '/images/icons/google.jpg',
      alt: 'Icone dossier Google'
    }
  ];

  protected readonly dockApps: readonly AppIcon[] = [
    {
      label: 'Phone',
      src: '/images/icons/phone.jpg',
      alt: 'Icone Telephone'
    },
    {
      label: 'SMS',
      src: '/images/icons/sms.jpg',
      alt: 'Icone SMS'
    },
    {
      label: 'Internet',
      src: '/images/icons/internet.jpg',
      alt: 'Icone Internet'
    },
    {
      label: 'Camera',
      src: '/images/icons/camera.jpg',
      alt: 'Icone Camera'
    }
  ];

  protected readonly phoneIcon = this.dockApps[0];
  protected readonly smsIcon = this.dockApps[1];
  protected readonly internetIcon = this.dockApps[2];
  protected readonly cameraIcon = this.dockApps[3];

  protected openConversations(): void {
    this.conversationsOpen.set(true);
  }

  protected closeConversations(): void {
    this.conversationsOpen.set(false);
  }
}