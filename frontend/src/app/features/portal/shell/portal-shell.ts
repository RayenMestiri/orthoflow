import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PortalAuthStore } from '../data-access/portal-auth.store';
@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './portal-shell.html',
  styleUrl: './portal-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class PortalShell {
  protected readonly auth = inject(PortalAuthStore);
  private readonly router = inject(Router);
  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['/portal/login']);
  }
}
