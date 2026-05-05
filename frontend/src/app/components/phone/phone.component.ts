import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';

type AppIcon = {
  readonly label: string;
  readonly src: string;
  readonly alt: string;
};

@Component({
  selector: 'app-phone',
  imports: [NgOptimizedImage, MatBadgeModule],
  templateUrl: './phone.component.html',
  styleUrl: './phone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneComponent {
  readonly phoneBadgeCount = input(0);
  readonly smsBadgeCount = input(0);
  protected readonly smsMenuOpen = signal(false);

  protected readonly primaryApps: readonly AppIcon[] = [
    {
      label: 'Store',
      src: '/store.jpg',
      alt: 'Icone Store'
    },
    {
      label: 'Gallery',
      src: '/gallery.jpg',
      alt: 'Icone Gallery'
    },
    {
      label: 'Play Store',
      src: '/play store.jpg',
      alt: 'Icone Play Store'
    },
    {
      label: 'Google',
      src: '/google.jpg',
      alt: 'Icone dossier Google'
    }
  ];

  protected readonly dockApps: readonly AppIcon[] = [
    {
      label: 'Phone',
      src: '/phone.jpg',
      alt: 'Icone Telephone'
    },
    {
      label: 'SMS',
      src: '/sms.jpg',
      alt: 'Icone SMS'
    },
    {
      label: 'Internet',
      src: '/internet.jpg',
      alt: 'Icone Internet'
    },
    {
      label: 'Camera',
      src: '/camera.jpg',
      alt: 'Icone Camera'
    }
  ];

  protected readonly phoneIcon = this.dockApps[0];
  protected readonly smsIcon = this.dockApps[1];
  protected readonly internetIcon = this.dockApps[2];
  protected readonly cameraIcon = this.dockApps[3];

  protected toggleSmsMenu(): void {
    this.smsMenuOpen.update((open) => !open);
  }

  protected closeSmsMenu(): void {
    this.smsMenuOpen.set(false);
  }
}