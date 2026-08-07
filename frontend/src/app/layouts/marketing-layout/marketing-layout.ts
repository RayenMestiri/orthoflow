import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-marketing-layout',
  imports: [RouterOutlet],
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
