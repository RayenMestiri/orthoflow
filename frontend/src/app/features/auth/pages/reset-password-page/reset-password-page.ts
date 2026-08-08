import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../../core/auth/auth-api.service';
import { getApiProblem } from '../../../../core/http/api-error';
import {
  fieldsMatchValidator,
  strongPasswordValidator,
} from '../../../../shared/forms/auth-validators';
import { AuthFrame } from '../../components/auth-frame/auth-frame';
import { OtpInput } from '../../components/otp-input/otp-input';

@Component({
  selector: 'app-reset-password-page',
  imports: [AuthFrame, OtpInput, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password-page.html',
  styleUrl: './reset-password-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly api = inject(AuthApiService);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly completed = signal(false);
  readonly passwordVisible = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly requestNotice = this.route.snapshot.queryParamMap.get('requested') === 'true';
  readonly form = this.formBuilder.group(
    {
      email: [
        this.route.snapshot.queryParamMap.get('email') ?? '',
        [Validators.required, Validators.email],
      ],
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      password: ['', [Validators.required, strongPasswordValidator, Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: fieldsMatchValidator('password', 'confirmPassword') },
  );
  private readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });
  readonly passwordChecks = computed(() => {
    const password = this.passwordValue();
    return {
      length: password.length >= 10,
      letter: /[A-Za-z]/.test(password),
      number: /\d/.test(password),
    };
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
    const value = this.form.getRawValue();
    try {
      await firstValueFrom(this.api.resetPassword(value.email, value.code, value.password));
      this.completed.set(true);
      this.form.disable();
    } catch (error) {
      this.errorMessage.set(getApiProblem(error).message);
    } finally {
      this.submitting.set(false);
    }
  }
}
