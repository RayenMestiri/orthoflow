import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UnifiedLogin } from '../../auth/components/unified-login/unified-login';

@Component({
  selector: 'app-portal-login-page',
  imports: [UnifiedLogin],
  template: `<app-unified-login [initialMode]="'portal'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalLoginPage {}
