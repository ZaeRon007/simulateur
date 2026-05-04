import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api.config';

interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStorageKey = 'auth_token';
  private readonly tokenSignal = signal<string | null>(localStorage.getItem(this.tokenStorageKey));

  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  getToken(): string | null {
    return this.tokenSignal();
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenStorageKey, token);
    this.tokenSignal.set(token);
  }

  clearToken(): void {
    localStorage.removeItem(this.tokenStorageKey);
    this.tokenSignal.set(null);
  }

  login(identifier: string, password: string): Observable<void> {
    return this.http
      .post<AuthResponse>(`${API_BASE_URL}/auth/login`, {
        identifier,
        password
      })
      .pipe(
        tap((response) => this.setToken(response.accessToken)),
        map(() => undefined)
      );
  }

  register(name: string, email: string, password: string): Observable<void> {
    return this.http
      .post<AuthResponse>(`${API_BASE_URL}/auth/register`, {
        name,
        email,
        password
      })
      .pipe(
        tap((response) => this.setToken(response.accessToken)),
        map(() => undefined)
      );
  }
}
