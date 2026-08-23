import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { PortalAuthStore } from './portal-auth.store';
export const portalAuthGuard: CanActivateFn = async (_route, state) => {
  const store = inject(PortalAuthStore);
  const router = inject(Router);
  await store.ensureInitialized();
  return store.authenticated()
    ? true
    : router.createUrlTree(['/portal/login'], { queryParams: { returnUrl: state.url } });
};
export const portalGuestGuard: CanActivateFn = async () => {
  const store = inject(PortalAuthStore);
  const router = inject(Router);
  await store.ensureInitialized();
  return store.authenticated() ? router.createUrlTree(['/portal/home']) : true;
};
