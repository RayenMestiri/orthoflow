import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.ensureInitialized();

  if (auth.status() === 'authenticated') {
    return true;
  }
  if (auth.status() === 'verification-required') {
    return router.createUrlTree(['/verify-email'], {
      queryParams: { email: auth.user()?.email ?? undefined },
    });
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.ensureInitialized();

  if (auth.status() === 'authenticated') {
    return router.createUrlTree(['/app/dashboard']);
  }
  if (auth.status() === 'verification-required') {
    return router.createUrlTree(['/verify-email'], {
      queryParams: { email: auth.user()?.email ?? undefined },
    });
  }
  return true;
};
