import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(AuthStore);
  if (request.url.includes('/portal/')) {
    return next(request.clone({ withCredentials: true }));
  }
  const isPublicAuthRequest = PUBLIC_AUTH_PATHS.some((path) => request.url.endsWith(path));
  const token = store.accessToken();
  const clinicId = store.activeClinicId();
  const protectedHeaders = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(clinicId ? { 'x-clinic-id': clinicId } : {}),
  };
  const authorizedRequest =
    token && !isPublicAuthRequest
      ? request.clone({
          withCredentials: true,
          setHeaders: protectedHeaders,
        })
      : request.clone({ withCredentials: true });

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isPublicAuthRequest) {
        return throwError(() => error);
      }

      return from(store.refreshAccessTokenOnce()).pipe(
        switchMap((refreshedToken) => {
          if (!refreshedToken) {
            return throwError(() => error);
          }
          return next(
            request.clone({
              withCredentials: true,
              setHeaders: {
                Authorization: `Bearer ${refreshedToken}`,
                ...(store.activeClinicId() ? { 'x-clinic-id': store.activeClinicId()! } : {}),
              },
            }),
          );
        }),
      );
    }),
  );
};
