import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { PortalAuthStore } from '../../features/portal/data-access/portal-auth.store';

@Component({
  selector: 'app-marketing-layout',
  imports: [A11yModule, RouterLink, RouterOutlet],
  templateUrl: './marketing-layout.html',
  styleUrl: './marketing-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:scroll)': 'onWindowScroll()',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class MarketingLayout {
  protected readonly menuOpen = signal(false);
  protected readonly scrolled = signal(false);
  private readonly document = inject(DOCUMENT);
  protected readonly staffAuth = inject(AuthStore);
  protected readonly portalAuth = inject(PortalAuthStore);

  constructor() {
    this.staffAuth.ensureInitialized();
    this.portalAuth.ensureInitialized();
    effect((onCleanup) => {
      this.document.body.classList.toggle('menu-open', this.menuOpen());
      onCleanup(() => this.document.body.classList.remove('menu-open'));
    });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected onWindowScroll(): void {
    this.scrolled.set(window.scrollY > 24);
  }
}
