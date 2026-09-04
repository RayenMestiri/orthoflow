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
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../../core/auth/auth-api.service';
import { getApiProblem } from '../../../../core/http/api-error';
import { PortalApiService } from '../../../portal/data-access/portal-api.service';
import type { LoginMode } from '../../models/login-mode';

@Component({
  selector: 'app-unified-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './unified-forgot-password.html',
  styleUrl: './unified-forgot-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnifiedForgotPassword implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly portalApi = inject(PortalApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly initialMode = input<LoginMode>('clinic');

  readonly mode = signal<LoginMode>('clinic');
  readonly isAnimating = signal(false);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly isAlternateAccount = signal(false);

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    const currentPath = this.route.snapshot.routeConfig?.path ?? '';
    if (this.initialMode()) {
      this.mode.set(this.initialMode());
    } else if (currentPath.includes('portal')) {
      this.mode.set('portal');
    }

    const emailParam = this.route.snapshot.queryParamMap.get('email');
    if (emailParam) {
      this.form.controls.email.setValue(emailParam);
    }
  }

  switchMode(target: LoginMode): void {
    if (this.mode() === target) return;

    this.isAnimating.set(true);
    this.mode.set(target);
    this.errorMessage.set(null);
    this.submitted.set(false);
    this.successMessage.set(null);
    this.isAlternateAccount.set(false);

    const destinationUrl = target === 'clinic' ? '/forgot-password' : '/portal/forgot-password';
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
    const email = this.form.controls.email.value.trim();

    try {
      if (this.mode() === 'clinic') {
        await firstValueFrom(this.authApi.requestPasswordReset(email));
        await this.router.navigate(['/reset-password'], {
          queryParams: { email, requested: 'true' },
        });
      } else {
        const response = await firstValueFrom(this.portalApi.forgotPassword(email));
        this.submitted.set(true);
        this.successMessage.set(
          response?.message ??
            'Si un compte associé à cette adresse existe, un email contenant un lien de réinitialisation sécurisé vient de vous être envoyé.',
        );
      }
    } catch (error) {
      const problem = getApiProblem(error);

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
