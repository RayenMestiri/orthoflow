import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth.store';
import { PLATFORM_ROLES, type ClinicRole } from './auth.models';
import { PermissionService, type Permission } from './permissions';

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

export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.ensureInitialized();

  if (auth.user()?.platformRole === PLATFORM_ROLES.SUPER_ADMIN) {
    return true;
  }
  const allowedRoles = route.data?.['roles'] as readonly ClinicRole[] | undefined;
  const role = auth.activeMembership()?.role;
  return allowedRoles?.length && role && allowedRoles.includes(role)
    ? true
    : router.createUrlTree(['/login']);
};

export const permissionGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const permissions = inject(PermissionService);
  const router = inject(Router);
  await auth.ensureInitialized();

  const permission = route.data?.['permission'] as Permission | undefined;
  return permission && permissions.can(permission)
    ? true
    : router.createUrlTree(['/app/dashboard']);
};
