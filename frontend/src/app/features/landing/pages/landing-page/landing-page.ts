import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProductPreview } from '../../components/product-preview/product-preview';
import { WaitlistForm } from '../../components/waitlist-form/waitlist-form';
import { CAPABILITIES, PROBLEMS, WORKFLOW } from '../../data/landing-content';

@Component({
  selector: 'app-landing-page',
  imports: [ProductPreview, WaitlistForm],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  protected readonly problems = PROBLEMS;
  protected readonly capabilities = CAPABILITIES;
  protected readonly workflow = WORKFLOW;
}
