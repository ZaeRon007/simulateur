import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { UserProfile, UserProfileApi } from './models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  submitScore(reactionTimeMs: number): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/score`, { reaction_time: reactionTimeMs });
  }

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfileApi>(`${API_BASE_URL}/me`).pipe(
      map((profile) => ({
        name: profile.nom,
        email: profile.email,
        score: profile.score,
        bestScore: profile.best_score
      }))
    );
  }
}
