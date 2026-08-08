import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';
import { CLINIC_ROLES } from './core/auth/auth.models';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in — OrthoFlow',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/pages/login-page/login-page').then(
        (component) => component.LoginPage,
      ),
  },
  {
    path: 'register',
    title: 'Create your clinic — OrthoFlow',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/pages/register-page/register-page').then(
        (component) => component.RegisterPage,
      ),
  },
  {
    path: 'verify-email',
    title: 'Verify your email — OrthoFlow',
    loadComponent: () =>
      import('./features/auth/pages/verify-email-page/verify-email-page').then(
        (component) => component.VerifyEmailPage,
      ),
  },
  {
    path: 'forgot-password',
    title: 'Recover your account — OrthoFlow',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/pages/forgot-password-page/forgot-password-page').then(
        (component) => component.ForgotPasswordPage,
      ),
  },
  {
    path: 'reset-password',
    title: 'Reset your password — OrthoFlow',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/pages/reset-password-page/reset-password-page').then(
        (component) => component.ResetPasswordPage,
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/marketing-layout/marketing-layout').then(
        (component) => component.MarketingLayout,
      ),
    children: [
      {
        path: '',
        title: 'OrthoFlow — Practice management with clarity',
        loadComponent: () =>
          import('./features/landing/pages/landing-page/landing-page').then(
            (component) => component.LandingPage,
          ),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard, roleGuard],
    data: { roles: Object.values(CLINIC_ROLES) },
    loadComponent: () =>
      import('./layouts/app-shell/app-shell').then((component) => component.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard — OrthoFlow',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard-page/dashboard-page').then(
            (component) => component.DashboardPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
