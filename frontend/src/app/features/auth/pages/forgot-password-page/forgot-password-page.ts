import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../../core/auth/auth-api.service';
import { getApiProblem } from '../../../../core/http/api-error';
import { AuthFrame } from '../../components/auth-frame/auth-frame';

@Component({
  selector: 'app-forgot-password-page',
  imports: [AuthFrame, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password-page.html',
  styleUrl: './forgot-password-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly api = inject(AuthApiService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const email = this.form.controls.email.value.trim();
    try {
      await firstValueFrom(this.api.requestPasswordReset(email));
      await this.router.navigate(['/reset-password'], {
        queryParams: { email, requested: 'true' },
      });
    } catch (error) {
      this.errorMessage.set(getApiProblem(error).message);
    } finally {
      this.submitting.set(false);
    }
  }
}
