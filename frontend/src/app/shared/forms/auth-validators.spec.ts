import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { fieldsMatchValidator, phoneValidator, strongPasswordValidator } from './auth-validators';

describe('auth validators', () => {
  it('accepts a usable password and explains missing requirements', () => {
    const password = new FormControl('short', { validators: strongPasswordValidator });
    expect(password.errors).toMatchObject({ minlength: expect.any(Object), number: true });

    password.setValue('ClinicPass123');
    expect(password.errors).toBeNull();
  });

  it('supports international phone punctuation without accepting letters', () => {
    const phone = new FormControl('+216 20 123 456', { validators: phoneValidator });
    expect(phone.errors).toBeNull();

    phone.setValue('call-me');
    expect(phone.errors).toEqual({ phone: true });
  });

  it('detects mismatched confirmation fields', () => {
    const group = new FormGroup(
      {
        password: new FormControl('ClinicPass123'),
        confirmation: new FormControl('ClinicPass124'),
      },
      { validators: fieldsMatchValidator('password', 'confirmation') },
    );

    expect(group.errors).toEqual({ fieldsMismatch: true });
    group.controls.confirmation.setValue('ClinicPass123');
    expect(group.errors).toBeNull();
  });
});
