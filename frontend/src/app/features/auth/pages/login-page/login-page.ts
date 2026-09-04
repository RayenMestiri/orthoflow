import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UnifiedLogin } from '../../components/unified-login/unified-login';

@Component({
  selector: 'app-login-page',
  imports: [UnifiedLogin],
  template: `<app-unified-login [initialMode]="'clinic'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {}
