import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { gsap } from 'gsap';
import { animate, inView, stagger } from 'motion';
import { ProductPreview } from '../../components/product-preview/product-preview';
import { WaitlistForm } from '../../components/waitlist-form/waitlist-form';
import { CAPABILITIES, PROBLEMS, WORKFLOW_PHASES } from '../../data/landing-content';

@Component({
  selector: 'app-landing-page',
  imports: [ProductPreview, WaitlistForm],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  protected readonly problems = PROBLEMS;
  protected readonly featuredCapability = CAPABILITIES[0];
  protected readonly supportingCapabilities = CAPABILITIES.slice(1);
  protected readonly workflowPhases = WORKFLOW_PHASES;

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.setupMotion());
  }

  private setupMotion(): void {
    const root = this.elementRef.nativeElement;
    const media = gsap.matchMedia(root);

    media.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
      const { reduceMotion } = context.conditions as { reduceMotion: boolean };
      if (reduceMotion) {
        return;
      }

      gsap
        .timeline({ defaults: { ease: 'power2.out' } })
        .from('.hero__copy > *', {
          opacity: 0,
          y: 16,
          duration: 0.5,
          stagger: 0.06,
        })
        .from('.hero__preview', { opacity: 0, y: 20, scale: 0.985, duration: 0.72 }, '-=0.32');
    });

    let stopWorkflowObserver = (): void => undefined;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const workflow = root.querySelector<HTMLElement>('[data-workflow]');
      const progress = root.querySelector<HTMLElement>('[data-workflow-progress]');
      const phases = Array.from(root.querySelectorAll<HTMLElement>('[data-workflow-phase]'));

      if (workflow && progress) {
        stopWorkflowObserver = inView(
          workflow,
          () => {
            animate(
              progress,
              { transform: ['scaleX(0)', 'scaleX(1)'] },
              { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
            );
            animate(
              phases,
              { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] },
              { duration: 0.5, delay: stagger(0.1), ease: [0.22, 1, 0.36, 1] },
            );
          },
          { amount: 0.3 },
        );
      }
    }

    this.destroyRef.onDestroy(() => {
      media.revert();
      stopWorkflowObserver();
    });
  }
}
