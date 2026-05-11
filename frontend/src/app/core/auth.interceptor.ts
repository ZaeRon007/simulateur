import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
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
  );
};
