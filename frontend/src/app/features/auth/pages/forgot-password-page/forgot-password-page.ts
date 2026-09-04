import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UnifiedForgotPassword } from '../../components/unified-forgot-password/unified-forgot-password';

@Component({
  selector: 'app-forgot-password-page',
  imports: [UnifiedForgotPassword],
  template: `<app-unified-forgot-password [initialMode]="'clinic'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {}
