import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

@Component({
  selector: 'app-otp-input',
  templateUrl: './otp-input.html',
  styleUrl: './otp-input.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => OtpInput),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OtpInput implements ControlValueAccessor {
  @ViewChildren('digitInput') private readonly inputs?: QueryList<ElementRef<HTMLInputElement>>;

  readonly digits = signal(['', '', '', '', '', '']);
  readonly disabled = signal(false);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    const normalized = (value ?? '').replace(/\D/g, '').slice(0, 6).padEnd(6, ' ');
    this.digits.set([...normalized].map((digit) => (digit === ' ' ? '' : digit)));
  }

  registerOnChange(callback: (value: string) => void): void {
    this.onChange = callback;
  }

  registerOnTouched(callback: () => void): void {
    this.onTouched = callback;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  handleInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    this.updateDigit(index, digit);
    input.value = digit;
    if (digit && index < 5) {
      this.focus(index + 1);
    }
  }

  handleKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      this.focus(index - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focus(index - 1);
    }
    if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      this.focus(index + 1);
    }
  }

  handlePaste(event: ClipboardEvent): void {
    const code = event.clipboardData?.getData('text').replace(/\D/g, '').slice(0, 6) ?? '';
    if (!code) {
      return;
    }
    event.preventDefault();
    const nextDigits = Array.from({ length: 6 }, (_, index) => code[index] ?? '');
    this.digits.set(nextDigits);
    this.emitValue();
    this.focus(Math.min(code.length, 6) - 1);
  }

  markTouched(): void {
    this.onTouched();
  }

  private updateDigit(index: number, digit: string): void {
    this.digits.update((digits) =>
      digits.map((value, position) => (position === index ? digit : value)),
    );
    this.emitValue();
  }

  private emitValue(): void {
    this.onChange(this.digits().join(''));
  }

  private focus(index: number): void {
    this.inputs?.get(index)?.nativeElement.focus();
    this.inputs?.get(index)?.nativeElement.select();
  }
}
