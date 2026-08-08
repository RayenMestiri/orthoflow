import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-frame',
  imports: [RouterLink],
  templateUrl: './auth-frame.html',
  styleUrl: './auth-frame.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthFrame {
  readonly eyebrow = input('Secure clinic workspace');
  readonly storyTitle = input('Care moves better when the whole clinic sees the same picture.');
  readonly storyCopy = input(
    'A focused workspace for appointments, treatment progress, team handoffs, and accountable records.',
  );
}
