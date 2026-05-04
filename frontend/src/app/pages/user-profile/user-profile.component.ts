import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { HeaderComponent } from '../../components/header/header.component';
import { AuthService } from '../../core/auth.service';
import { ProfileService } from '../../core/profile.service';
import { ScoreRow, UserProfile } from '../../core/models';

@Component({
  selector: 'app-user-profile',
  imports: [HeaderComponent, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTableModule],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserProfileComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly displayedColumns = ['label', 'value'];

  readonly scoreRows = computed<ScoreRow[]>(() => {
    const currentProfile = this.profile();
    if (!currentProfile) {
      return [];
    }

    return [
      { label: 'Score actuel', value: currentProfile.score },
      { label: 'Meilleur score', value: currentProfile.bestScore }
    ];
  });

  readonly avatarUrl = computed(() => {
    const currentProfile = this.profile();
    const seed = encodeURIComponent(currentProfile?.name ?? 'Player');
    return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}`;
  });

  goBack(): void {
    this.location.back();
  }

  logout(): void {
    this.authService.clearToken();
    void this.router.navigateByUrl('/auth');
  }

  constructor() {
    this.loadProfile();
  }

  private loadProfile(): void {
    this.profileService
      .getMe()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.errorMessage.set(null);
          this.isLoading.set(false);
        },
        error: () => {
          this.errorMessage.set('Impossible de charger le profil utilisateur.');
          this.isLoading.set(false);
        }
      });
  }
}
