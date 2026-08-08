import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { getApiProblem } from '../../../../core/http/api-error';
import { AuthFrame } from '../../components/auth-frame/auth-frame';

@Component({
  selector: 'app-login-page',
  imports: [AuthFrame, ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly passwordVisible = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.login(this.form.getRawValue());
      const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const destination = requestedUrl?.startsWith('/app') ? requestedUrl : '/app/dashboard';
      await this.router.navigateByUrl(destination);
    } catch (error) {
      const problem = getApiProblem(error);
      if (problem.code === 'EMAIL_NOT_VERIFIED') {
        await this.router.navigate(['/verify-email'], {
          queryParams: { email: this.form.controls.email.value },
        });
        return;
      }
      this.errorMessage.set(problem.message);
    } finally {
      this.submitting.set(false);
    }
  }
}
