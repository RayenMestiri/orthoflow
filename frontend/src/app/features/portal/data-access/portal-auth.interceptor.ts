import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { PortalAuthStore } from './portal-auth.store';

export const portalAuthInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.includes('/portal/')) return next(request);
  const store = inject(PortalAuthStore);
  const publicRequest = [
    '/portal/auth/login',
    '/portal/auth/activate',
    '/portal/auth/refresh',
  ].some((path) => request.url.endsWith(path));
  const token = store.token();
  const outgoing =
    token && !publicRequest
      ? request.clone({ withCredentials: true, setHeaders: { Authorization: `Bearer ${token}` } })
      : request.clone({ withCredentials: true });
  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || publicRequest)
        return throwError(() => error);
      return from(store.refreshOnce()).pipe(
        switchMap((fresh) =>
          fresh
            ? next(
                request.clone({
                  withCredentials: true,
                  setHeaders: { Authorization: `Bearer ${fresh}` },
                }),
              )
            : throwError(() => error),
        ),
      );
    }),
  );
};
