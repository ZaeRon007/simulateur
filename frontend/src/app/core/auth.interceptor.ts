import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  const isMeRequest = req.url.endsWith('/me') || req.url.endsWith('/me/');
  const isScoreRequest = req.url.endsWith('/score') || req.url.endsWith('/score/');

  if (!token || (!isMeRequest && !isScoreRequest)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  ).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.clearToken();
        void router.navigateByUrl('/auth');
      }
      return throwError(() => error);
    })
  );
};
