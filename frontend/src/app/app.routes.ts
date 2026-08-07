import { Routes } from '@angular/router';

export const routes: Routes = [
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
