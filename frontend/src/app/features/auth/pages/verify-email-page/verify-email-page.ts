import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthApiService } from '../../../../core/auth/auth-api.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { getApiProblem } from '../../../../core/http/api-error';
import { AuthFrame } from '../../components/auth-frame/auth-frame';
import { OtpInput } from '../../components/otp-input/otp-input';

@Component({
  selector: 'app-verify-email-page',
  imports: [AuthFrame, OtpInput, ReactiveFormsModule, RouterLink],
  templateUrl: './verify-email-page.html',
  styleUrl: './verify-email-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly api = inject(AuthApiService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly now = signal(Date.now());
  private readonly resendAvailableAt = signal(0);

  readonly submitting = signal(false);
  readonly resending = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly noticeMessage = signal<string | null>(null);
  readonly deliveryUnavailable =
    this.route.snapshot.queryParamMap.get('delivery') === 'unavailable';
  readonly form = this.formBuilder.group({
    email: [
      this.route.snapshot.queryParamMap.get('email') ?? '',
      [Validators.required, Validators.email],
    ],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  readonly resendSeconds = computed(() =>
    Math.max(0, Math.ceil((this.resendAvailableAt() - this.now()) / 1000)),
  );

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));

    const email = this.route.snapshot.queryParamMap.get('email');
    if (email && !this.deliveryUnavailable) {
      this.noticeMessage.set('Un code d\'activation sécurisé à 6 chiffres a été envoyé à votre adresse e-mail.');
      this.resendAvailableAt.set(Date.now() + 60_000);
      this.api.resendVerification(email).subscribe({
        next: () => {},
        error: () => {},
      });
    }
  }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { email, code } = this.form.getRawValue();
    try {
      await this.auth.verifyEmail(email, code);
      if (this.auth.isAuthenticated()) {
        await this.router.navigateByUrl('/app/dashboard');
      } else {
        await this.router.navigate(['/login'], {
          queryParams: { verified: 'true', email },
        });
      }
    } catch (error) {
      this.errorMessage.set(getApiProblem(error).message);
    } finally {
      this.submitting.set(false);
    }
  }

  async resend(): Promise<void> {
    if (this.resendSeconds() > 0 || this.form.controls.email.invalid) {
      this.form.controls.email.markAsTouched();
      return;
    }
    this.resending.set(true);
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.api.resendVerification(this.form.controls.email.value));
      this.noticeMessage.set('If the address is eligible, a fresh code is on its way.');
      this.resendAvailableAt.set(Date.now() + 60_000);
    } catch (error) {
      this.errorMessage.set(getApiProblem(error).message);
    } finally {
      this.resending.set(false);
    }
  }
}
