import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** Maps the activated route's animation data key → named trigger state. */
  getRouteState(outlet: RouterOutlet): string {
    return outlet.isActivated
      ? (outlet.activatedRouteData?.['animation'] as string | undefined) ?? ''
      : '';
  }
}
