import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
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
}
