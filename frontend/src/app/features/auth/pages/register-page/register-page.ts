import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthStore } from '../../../../core/auth/auth.store';
import { getApiProblem } from '../../../../core/http/api-error';
import {
  fieldsMatchValidator,
  phoneValidator,
  strongPasswordValidator,
} from '../../../../shared/forms/auth-validators';
import { AuthFrame } from '../../components/auth-frame/auth-frame';

@Component({
  selector: 'app-register-page',
  imports: [AuthFrame, ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly passwordVisible = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(80)]],
      lastName: ['', [Validators.required, Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [phoneValidator]],
      clinicName: ['', [Validators.required, Validators.maxLength(120)]],
      clinicPhone: ['', [phoneValidator]],
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
      const session = await this.auth.register({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        email: value.email.trim(),
        phone: value.phone.trim() || null,
        password: value.password,
        clinic: {
          name: value.clinicName.trim(),
          phone: value.clinicPhone.trim() || null,
        },
      });
      await this.router.navigate(['/verify-email'], {
        queryParams: {
          email: session.user.email,
          delivery: session.verification.delivery.toLowerCase(),
        },
      });
    } catch (error) {
      this.errorMessage.set(getApiProblem(error).message);
    } finally {
      this.submitting.set(false);
    }
  }
}
