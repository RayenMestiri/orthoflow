import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animate, inView, stagger } from 'motion';
import { DentalAmbient } from '../../components/dental-ambient/dental-ambient';
import { ProductPreview } from '../../components/product-preview/product-preview';
import { WaitlistForm } from '../../components/waitlist-form/waitlist-form';
import { CAPABILITIES, PROBLEMS, WORKFLOW_PHASES } from '../../data/landing-content';

@Component({
  selector: 'app-landing-page',
  imports: [DentalAmbient, ProductPreview, WaitlistForm],
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

  protected onPreviewPointerMove(event: PointerEvent): void {
    if (
      event.pointerType !== 'mouse' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const preview = event.currentTarget as HTMLElement;
    const bounds = preview.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    preview.style.setProperty('--preview-rotate-x', `${(-vertical * 4).toFixed(2)}deg`);
    preview.style.setProperty('--preview-rotate-y', `${(horizontal * 5).toFixed(2)}deg`);
    preview.style.setProperty('--preview-glow-x', `${((horizontal + 0.5) * 100).toFixed(1)}%`);
    preview.style.setProperty('--preview-glow-y', `${((vertical + 0.5) * 100).toFixed(1)}%`);
  }

  protected resetPreviewPerspective(event: PointerEvent): void {
    const preview = event.currentTarget as HTMLElement;
    preview.style.setProperty('--preview-rotate-x', '0deg');
    preview.style.setProperty('--preview-rotate-y', '0deg');
    preview.style.setProperty('--preview-glow-x', '65%');
    preview.style.setProperty('--preview-glow-y', '35%');
  }

  private setupMotion(): void {
    const root = this.elementRef.nativeElement;
    const media = gsap.matchMedia(root);

    gsap.registerPlugin(ScrollTrigger);

    media.add(
      {
        reduceMotion: '(prefers-reduced-motion: reduce)',
        desktop: '(min-width: 57rem)',
      },
      (context) => {
        const { reduceMotion, desktop } = context.conditions as {
          reduceMotion: boolean;
          desktop: boolean;
        };
        if (reduceMotion) {
          return;
        }

        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('.hero__copy > *', {
            opacity: 0,
            y: 24,
            duration: 0.65,
            stagger: 0.075,
          })
          .from(
            '.hero__preview',
            { opacity: 0, y: 48, scale: 0.94, duration: 1, ease: 'expo.out' },
            '-=0.48',
          )
          .from(
            '.hero__floating-signal',
            { opacity: 0, scale: 0.78, y: 18, duration: 0.55, stagger: 0.12 },
            '-=0.45',
          );

        root
          .querySelectorAll<HTMLElement>('.positioning__inner, .section-heading, .security__intro')
          .forEach((heading) => {
            gsap.from(Array.from(heading.children), {
              opacity: 0,
              y: 34,
              duration: 0.78,
              stagger: 0.09,
              ease: 'expo.out',
              scrollTrigger: { trigger: heading, start: 'top 86%', once: true },
            });
          });

        gsap.from('.problem-item', {
          opacity: 0,
          y: 30,
          duration: 0.72,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.problem-list', start: 'top 84%', once: true },
        });

        gsap.from('.capability-feature', {
          opacity: 0,
          y: 56,
          rotateX: desktop ? 8 : 0,
          scale: 0.96,
          transformPerspective: 1200,
          clearProps: 'transform',
          duration: 0.95,
          ease: 'expo.out',
          scrollTrigger: { trigger: '.capability-layout', start: 'top 82%', once: true },
        });
        gsap.from('.capability-row', {
          opacity: 0,
          x: desktop ? 38 : 0,
          y: desktop ? 0 : 26,
          duration: 0.72,
          stagger: 0.12,
          clearProps: 'transform',
          ease: 'power3.out',
          scrollTrigger: { trigger: '.capability-layout', start: 'top 80%', once: true },
        });

        gsap.from('.cash-story__copy > *', {
          opacity: 0,
          x: desktop ? -34 : 0,
          y: desktop ? 0 : 24,
          duration: 0.72,
          stagger: 0.09,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.cash-story', start: 'top 72%', once: true },
        });
        gsap.from('.cash-record', {
          opacity: 0,
          y: 48,
          rotateY: desktop ? -7 : 0,
          scale: 0.96,
          transformPerspective: 1200,
          duration: 0.95,
          ease: 'expo.out',
          scrollTrigger: { trigger: '.cash-story', start: 'top 68%', once: true },
        });

        gsap.from('.security__principles article', {
          opacity: 0,
          x: desktop ? 30 : 0,
          y: desktop ? 0 : 22,
          duration: 0.65,
          stagger: 0.1,
          scrollTrigger: { trigger: '.security__principles', start: 'top 84%', once: true },
        });
        gsap.from('.waitlist__shell > *', {
          opacity: 0,
          y: 38,
          duration: 0.8,
          stagger: 0.12,
          ease: 'expo.out',
          scrollTrigger: { trigger: '.waitlist', start: 'top 78%', once: true },
        });

        if (desktop) {
          gsap.to('.hero__preview', {
            y: 42,
            ease: 'none',
            scrollTrigger: {
              trigger: '.hero',
              start: 'top top',
              end: 'bottom top',
              scrub: 1,
            },
          });
        }
      },
    );

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
