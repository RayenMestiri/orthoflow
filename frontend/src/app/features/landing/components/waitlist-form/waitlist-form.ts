import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-waitlist-form',
  imports: [ReactiveFormsModule],
  templateUrl: './waitlist-form.html',
  styleUrl: './waitlist-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaitlistForm {
  protected readonly submitted = signal(false);
  protected readonly waitlistForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    practice: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    phone: new FormControl('', { nonNullable: true }),
  });

  protected submit(): void {
    this.waitlistForm.markAllAsTouched();
    if (this.waitlistForm.valid) {
      this.submitted.set(true);
    }
  }
}
