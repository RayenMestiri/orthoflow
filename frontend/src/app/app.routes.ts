import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, roleGuard } from './core/auth/auth.guards';
import { CLINIC_ROLES } from './core/auth/auth.models';
import { PERMISSIONS } from './core/auth/permissions';
import { clinicalVisitPendingChangesGuard } from './features/clinical-visits/pages/clinical-visit-page/clinical-visit-page';
import { portalAuthGuard, portalGuestGuard } from './features/portal/data-access/portal.guards';

export const routes: Routes = [
  {
    path: 'portal/login',
    title: 'Family portal sign in — OrthoFlow',
    canActivate: [portalGuestGuard],
    loadComponent: () =>
      import('./features/portal/pages/portal-login-page').then((c) => c.PortalLoginPage),
  },
  {
    path: 'portal/activate',
    title: 'Activate family portal — OrthoFlow',
    canActivate: [portalGuestGuard],
    loadComponent: () =>
      import('./features/portal/pages/portal-activate-page').then((c) => c.PortalActivatePage),
  },
  {
    path: 'portal',
    canActivate: [portalAuthGuard],
    loadComponent: () => import('./features/portal/shell/portal-shell').then((c) => c.PortalShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        title: 'Family overview — OrthoFlow',
        loadComponent: () =>
          import('./features/portal/pages/portal-home-page').then((c) => c.PortalHomePage),
      },
      {
        path: 'children',
        title: 'My children — OrthoFlow',
        loadComponent: () =>
          import('./features/portal/pages/portal-children-page').then((c) => c.PortalChildrenPage),
      },
      {
        path: 'children/:patientId',
        title: 'Care overview — OrthoFlow',
        loadComponent: () =>
          import('./features/portal/pages/portal-child-page').then((c) => c.PortalChildPage),
      },
      {
        path: 'appointments',
        title: 'Appointments — OrthoFlow',
        loadComponent: () =>
          import('./features/portal/pages/portal-appointments-page').then(
            (c) => c.PortalAppointmentsPage,
          ),
      },
      {
        path: 'payments',
        title: 'Payments and receipts — OrthoFlow',
        loadComponent: () =>
          import('./features/portal/pages/portal-payments-page').then((c) => c.PortalPaymentsPage),
      },
      {
        path: 'documents',
        title: 'Shared documents — OrthoFlow',
        loadComponent: () =>
          import('./features/portal/pages/portal-documents-page').then(
            (c) => c.PortalDocumentsPage,
          ),
      },
      {
        path: 'profile',
        title: 'Portal profile — OrthoFlow',
        loadComponent: () =>
          import('./features/portal/pages/portal-profile-page').then((c) => c.PortalProfilePage),
      },
    ],
  },
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
      {
        path: 'schedule',
        title: 'Schedule — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.APPOINTMENTS_VIEW },
        loadComponent: () =>
          import('./features/schedule/pages/schedule-page/schedule-page').then(
            (component) => component.SchedulePage,
          ),
      },
      {
        path: 'today',
        title: 'Today — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.APPOINTMENTS_VIEW },
        loadComponent: () =>
          import('./features/reception/pages/today-page/today-page').then(
            (component) => component.TodayPage,
          ),
      },
      {
        path: 'follow-ups',
        title: 'Follow-ups — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.FOLLOWUPS_VIEW },
        loadComponent: () =>
          import('./features/follow-ups/pages/follow-ups-page/follow-ups-page').then(
            (component) => component.FollowUpsPage,
          ),
      },
      {
        path: 'tasks',
        title: 'Tâches & Délégation — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.TASKS_VIEW },
        loadComponent: () =>
          import('./features/tasks/pages/tasks-page/tasks-page.component').then(
            (component) => component.TasksPageComponent,
          ),
      },
      {
        path: 'clinical-visits/appointments/:appointmentId',
        title: 'Clinical visit — OrthoFlow',
        canActivate: [permissionGuard],
        canDeactivate: [clinicalVisitPendingChangesGuard],
        data: { permission: PERMISSIONS.CLINICAL_VISITS_MANAGE },
        loadComponent: () =>
          import('./features/clinical-visits/pages/clinical-visit-page/clinical-visit-page').then(
            (component) => component.ClinicalVisitPage,
          ),
      },
      {
        path: 'clinical-visits/:visitId',
        title: 'Clinical visit — OrthoFlow',
        canActivate: [permissionGuard],
        canDeactivate: [clinicalVisitPendingChangesGuard],
        data: { permission: PERMISSIONS.CLINICAL_VISITS_VIEW },
        loadComponent: () =>
          import('./features/clinical-visits/pages/clinical-visit-page/clinical-visit-page').then(
            (component) => component.ClinicalVisitPage,
          ),
      },
      {
        path: 'cash-records',
        title: 'Cash records — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.CASH_RECORDS_VIEW },
        loadComponent: () =>
          import('./features/finance/pages/finance-page/finance-page').then(
            (component) => component.FinancePage,
          ),
      },
      {
        path: 'reports',
        title: 'Rapports — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.REPORTS_VIEW },
        loadComponent: () =>
          import('./features/reports/pages/reports-page/reports-page').then(
            (component) => component.ReportsPage,
          ),
      },
      {
        path: 'settings',
        title: 'Settings — OrthoFlow',
        loadComponent: () =>
          import('./features/settings/pages/settings-page/settings-page').then(
            (component) => component.SettingsPage,
          ),
      },
      {
        path: 'patients',
        title: 'Patients — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.PATIENTS_VIEW },
        loadComponent: () =>
          import('./features/patients/pages/patients-list-page/patients-list-page').then(
            (component) => component.PatientsListPage,
          ),
      },
      {
        path: 'patients/new',
        title: 'New patient — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.PATIENTS_CREATE },
        loadComponent: () =>
          import('./features/patients/pages/patient-editor-page/patient-editor-page').then(
            (component) => component.PatientEditorPage,
          ),
      },
      {
        path: 'patients/:patientId/edit',
        title: 'Edit patient — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.PATIENTS_UPDATE },
        loadComponent: () =>
          import('./features/patients/pages/patient-editor-page/patient-editor-page').then(
            (component) => component.PatientEditorPage,
          ),
      },
      {
        path: 'patients/:patientId',
        title: 'Patient profile — OrthoFlow',
        canActivate: [permissionGuard],
        data: { permission: PERMISSIONS.PATIENTS_VIEW },
        loadComponent: () =>
          import('./features/patients/pages/patient-detail-page/patient-detail-page').then(
            (component) => component.PatientDetailPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
