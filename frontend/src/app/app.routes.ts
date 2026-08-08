import { Routes } from '@angular/router';
import { guestGuard } from './core/auth/auth.guards';

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
  { path: '**', redirectTo: '' },
];
