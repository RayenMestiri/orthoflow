import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiService } from '../../../../core/auth/auth-api.service';
import { PortalApiService } from '../../../portal/data-access/portal-api.service';
import { UnifiedForgotPassword } from './unified-forgot-password';

describe('UnifiedForgotPassword', () => {
  let authApiMock: { requestPasswordReset: ReturnType<typeof vi.fn> };
  let portalApiMock: { forgotPassword: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authApiMock = { requestPasswordReset: vi.fn().mockReturnValue(of({})) };
    portalApiMock = { forgotPassword: vi.fn().mockReturnValue(of({ message: 'Success' })) };

    await TestBed.configureTestingModule({
      imports: [UnifiedForgotPassword],
      providers: [
        provideRouter([
          { path: 'login', component: UnifiedForgotPassword },
          { path: 'portal/login', component: UnifiedForgotPassword },
          { path: 'forgot-password', component: UnifiedForgotPassword },
          { path: 'portal/forgot-password', component: UnifiedForgotPassword },
          { path: 'reset-password', component: UnifiedForgotPassword },
        ]),
        { provide: AuthApiService, useValue: authApiMock },
        { provide: PortalApiService, useValue: portalApiMock },
      ],
    }).compileComponents();
  });

  it('renders clinic mode recovery by default', () => {
    const fixture = TestBed.createComponent(UnifiedForgotPassword);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.auth-switcher')).toBeTruthy();
    expect(element.textContent).toContain('Récupération de compte');
    expect(element.querySelector('input[type="email"]')).toBeTruthy();
  });

  it('switches to portal mode recovery seamlessly', () => {
    const fixture = TestBed.createComponent(UnifiedForgotPassword);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.switchMode('portal');
    fixture.detectChanges();

    expect(component.mode()).toBe('portal');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Mot de passe oublié');
  });

  it('dispatches clinic recovery request when in clinic mode', async () => {
    const fixture = TestBed.createComponent(UnifiedForgotPassword);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.form.controls.email.setValue('praticien@orthoflow.fr');
    await component.submit();

    expect(authApiMock.requestPasswordReset).toHaveBeenCalledWith('praticien@orthoflow.fr');
    expect(portalApiMock.forgotPassword).not.toHaveBeenCalled();
  });

  it('dispatches portal recovery request when in portal mode', async () => {
    const fixture = TestBed.createComponent(UnifiedForgotPassword);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.switchMode('portal');
    fixture.detectChanges();

    component.form.controls.email.setValue('parent@famille.fr');
    await component.submit();

    expect(portalApiMock.forgotPassword).toHaveBeenCalledWith('parent@famille.fr');
    expect(authApiMock.requestPasswordReset).not.toHaveBeenCalled();
    expect(component.submitted()).toBe(true);
  });
});
