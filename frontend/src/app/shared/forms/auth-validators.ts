import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_MIN_LENGTH = 10;

export const strongPasswordValidator: ValidatorFn = (
  control: AbstractControl<string>,
): ValidationErrors | null => {
  const value = control.value;
  if (!value) {
    return null;
  }
  const errors: ValidationErrors = {};
  if (value.length < PASSWORD_MIN_LENGTH) {
    errors['minlength'] = { requiredLength: PASSWORD_MIN_LENGTH, actualLength: value.length };
  }
  if (!/[A-Za-z]/.test(value)) {
    errors['letter'] = true;
  }
  if (!/\d/.test(value)) {
    errors['number'] = true;
  }
  return Object.keys(errors).length ? errors : null;
};

export const phoneValidator: ValidatorFn = (
  control: AbstractControl<string>,
): ValidationErrors | null => {
  const value = control.value.trim();
  if (!value) {
    return null;
  }
  return /^[+]?[0-9\s().-]{6,32}$/.test(value) ? null : { phone: true };
};

export function fieldsMatchValidator(firstField: string, secondField: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const first = control.get(firstField)?.value;
    const second = control.get(secondField)?.value;
    return first === second ? null : { fieldsMismatch: true };
  };
}
