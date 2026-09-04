import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UnifiedForgotPassword } from '../../auth/components/unified-forgot-password/unified-forgot-password';

@Component({
  selector: 'app-portal-forgot-password-page',
  imports: [UnifiedForgotPassword],
  template: `<app-unified-forgot-password [initialMode]="'portal'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalForgotPasswordPage {}
