import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PortalAuthStore } from '../../../portal/data-access/portal-auth.store';
import { UnifiedLogin } from './unified-login';

describe('UnifiedLogin', () => {
  let authMock: { login: ReturnType<typeof vi.fn> };
  let portalAuthMock: { login: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authMock = { login: vi.fn().mockResolvedValue({}) };
    portalAuthMock = { login: vi.fn().mockResolvedValue({}) };

    await TestBed.configureTestingModule({
      imports: [UnifiedLogin],
      providers: [
        provideRouter([
          { path: 'login', component: UnifiedLogin },
          { path: 'portal/login', component: UnifiedLogin },
          { path: 'app/dashboard', component: UnifiedLogin },
          { path: 'portal/home', component: UnifiedLogin },
          { path: 'verify-email', component: UnifiedLogin },
          { path: 'forgot-password', component: UnifiedLogin },
          { path: 'portal/forgot-password', component: UnifiedLogin },
          { path: 'portal/activate', component: UnifiedLogin },
          { path: 'register', component: UnifiedLogin },
        ]),
        { provide: AuthStore, useValue: authMock },
        { provide: PortalAuthStore, useValue: portalAuthMock },
      ],
    }).compileComponents();
  });

  it('renders clinic mode by default with dual switcher and clinic fields', () => {
    const fixture = TestBed.createComponent(UnifiedLogin);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.auth-switcher')).toBeTruthy();
    expect(element.textContent).toContain('Espace Cabinet');
    expect(element.textContent).toContain('Portail Famille');
    expect(element.querySelector('input[type="email"]')).toBeTruthy();
    expect(element.querySelector('input[type="password"]')).toBeTruthy();
  });

  it('switches between clinic and portal modes when clicking switcher tabs', () => {
    const fixture = TestBed.createComponent(UnifiedLogin);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.mode()).toBe('clinic');

    component.switchMode('portal');
    fixture.detectChanges();

    expect(component.mode()).toBe('portal');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Connexion Famille');

    component.switchMode('clinic');
    fixture.detectChanges();
    expect(component.mode()).toBe('clinic');
    expect(element.textContent).toContain('Connexion à votre cabinet');
  });

  it('validates email and password requirements before submission', async () => {
    const fixture = TestBed.createComponent(UnifiedLogin);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.submit();
    expect(authMock.login).not.toHaveBeenCalled();
    expect(component.form.invalid).toBe(true);
  });

  it('dispatches to AuthStore in clinic mode when valid', async () => {
    const fixture = TestBed.createComponent(UnifiedLogin);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.form.controls.email.setValue('praticien@orthoflow.fr');
    component.form.controls.password.setValue('SecureClinicPassword123!');

    await component.submit();

    expect(authMock.login).toHaveBeenCalledWith({
      email: 'praticien@orthoflow.fr',
      password: 'SecureClinicPassword123!',
    });
    expect(portalAuthMock.login).not.toHaveBeenCalled();
  });

  it('dispatches to PortalAuthStore in portal mode when valid', async () => {
    const fixture = TestBed.createComponent(UnifiedLogin);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.switchMode('portal');
    fixture.detectChanges();

    component.form.controls.email.setValue('parent@famille.fr');
    component.form.controls.password.setValue('FamilyPortalPassword123!');

    await component.submit();

    expect(portalAuthMock.login).toHaveBeenCalledWith(
      'parent@famille.fr',
      'FamilyPortalPassword123!',
    );
    expect(authMock.login).not.toHaveBeenCalled();
  });
});
