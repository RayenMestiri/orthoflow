import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { getApiProblem } from '../../../../core/http/api-error';
import { PortalAuthStore } from '../../../portal/data-access/portal-auth.store';
import type { LoginMode } from '../../models/login-mode';

@Component({
  selector: 'app-unified-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './unified-login.html',
  styleUrl: './unified-login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnifiedLogin implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly portalAuth = inject(PortalAuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly initialMode = input<LoginMode>('clinic');

  readonly mode = signal<LoginMode>('clinic');
  readonly isAnimating = signal(false);
  readonly passwordVisible = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isAlternateAccount = signal(false);
  readonly copiedNotice = signal<string | null>(null);

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  ngOnInit(): void {
    // Detect mode from input or current route
    const currentPath = this.route.snapshot.routeConfig?.path ?? '';
    if (this.initialMode()) {
      this.mode.set(this.initialMode());
    } else if (currentPath.includes('portal')) {
      this.mode.set('portal');
    }

    const emailParam = this.route.snapshot.queryParamMap.get('email');
    const copiedParam = this.route.snapshot.queryParamMap.get('copied');
    const verifiedParam = this.route.snapshot.queryParamMap.get('verified');

    if (emailParam) {
      this.form.controls.email.setValue(emailParam);
    }
    if (verifiedParam === 'true') {
      this.copiedNotice.set(
        '✅ Compte activé avec succès ! Saisissez votre mot de passe pour vous connecter.',
      );
    } else if (copiedParam === 'true') {
      this.copiedNotice.set(
        this.mode() === 'clinic'
          ? "✨ Coordonnées transmises : Bienvenue sur l'Espace Cabinet OrthoFlow. Vos identifiants ont été pré-remplis."
          : '✨ Coordonnées transmises : Bienvenue sur le Portail Famille OrthoFlow. Vos identifiants ont été pré-remplis.',
      );
    }
  }

  togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  switchMode(target: LoginMode): void {
    if (this.mode() === target) return;

    this.isAnimating.set(true);
    this.mode.set(target);
    this.errorMessage.set(null);
    this.isAlternateAccount.set(false);

    if (this.copiedNotice()) {
      this.copiedNotice.set(
        target === 'clinic'
          ? "✨ Coordonnées transmises : Bienvenue sur l'Espace Cabinet OrthoFlow."
          : '✨ Coordonnées transmises : Bienvenue sur le Portail Famille OrthoFlow.',
      );
    }

    const destinationUrl = target === 'clinic' ? '/login' : '/portal/login';
    this.router.navigate([destinationUrl], {
      queryParamsHandling: 'preserve',
      replaceUrl: true,
    });

    setTimeout(() => {
      this.isAnimating.set(false);
    }, 650);
  }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    this.isAlternateAccount.set(false);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();

    try {
      if (this.mode() === 'clinic') {
        await this.auth.login({ email, password });
        const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const destination = requestedUrl?.startsWith('/app') ? requestedUrl : '/app/dashboard';
        await this.router.navigateByUrl(destination);
      } else {
        await this.portalAuth.login(email, password);
        const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const destination =
          requestedUrl?.startsWith('/portal') && !requestedUrl.includes('/portal/login')
            ? requestedUrl
            : '/portal/home';
        await this.router.navigateByUrl(destination);
      }
    } catch (error) {
      const problem = getApiProblem(error);
      if (problem.code === 'EMAIL_NOT_VERIFIED' && this.mode() === 'clinic') {
        await this.router.navigate(['/verify-email'], {
          queryParams: { email: this.form.controls.email.value },
        });
        return;
      }

      if (
        (this.mode() === 'clinic' && problem.code === 'PORTAL_ACCOUNT_DETECTED') ||
        (this.mode() === 'portal' && problem.code === 'STAFF_ACCOUNT_DETECTED')
      ) {
        this.isAlternateAccount.set(true);
      }

      this.errorMessage.set(problem.message);
    } finally {
      this.submitting.set(false);
    }
  }
}
