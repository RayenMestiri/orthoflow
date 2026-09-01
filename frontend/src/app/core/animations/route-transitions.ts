import {
  animate,
  animateChild,
  group,
  query,
  sequence,
  style,
  transition,
  trigger,
} from '@angular/animations';

/**
 * Premium route transitions for OrthoFlow.
 *
 * Strategy:
 *  - GPU-only properties: transform + opacity -> 60 fps guaranteed
 *  - 300ms cubic-bezier(0.4, 0, 0.2, 1)  -- Material-Design-style easing
 *  - position: fixed during animation -> no layout reflow / no scrollbar flash
 *  - CSS @view-transition in _animations.scss handles modern browsers natively
 *    (Chrome 126+, Safari 18.2+); Angular animations are the universal fallback
 */

const TIMING = '300ms cubic-bezier(0.4, 0, 0.2, 1)';

const FIXED_OVERLAY = style({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});

function slideOut(direction: 'left' | 'right') {
  const x = direction === 'left' ? '-100%' : '100%';
  return animate(TIMING, style({ transform: `translateX(${x})`, opacity: 0.25 }));
}

function slideIn(from: 'left' | 'right') {
  const x = from === 'right' ? '100%' : '-100%';
  // sequence() is required: query() expects AnimationMetadata, not an array
  return sequence([
    style({ transform: `translateX(${x})`, opacity: 0 }),
    animate(TIMING, style({ transform: 'translateX(0)', opacity: 1 })),
  ]);
}

// Helper to build a standard forward or reverse transition pair
function slidePair(leaving: 'left' | 'right', entering: 'left' | 'right') {
  return [
    query(':enter, :leave', [FIXED_OVERLAY], { optional: true }),
    group([
      query(':leave', [slideOut(leaving)], { optional: true }),
      query(':enter', [slideIn(entering)], { optional: true }),
    ]),
  ];
}

export const routeTransitions = trigger('routeAnim', [

  // Auth: Login -> Clinic Dashboard (success)
  transition('LoginPage => AppShell', [
    query(':enter, :leave', [FIXED_OVERLAY], { optional: true }),
    group([
      query(':leave', [slideOut('left')], { optional: true }),
      query(':enter', [slideIn('right')], { optional: true }),
      query(':enter', [animateChild()], { optional: true }),
    ]),
  ]),

  // Auth: Login <-> Forgot Password
  transition('LoginPage => ForgotPage', slidePair('left', 'right')),
  transition('ForgotPage => LoginPage', slidePair('right', 'left')),

  // Auth: Forgot <-> Reset
  transition('ForgotPage => ResetPage', slidePair('left', 'right')),
  transition('ResetPage => LoginPage', slidePair('right', 'left')),

  // Portal: PortalLogin <-> PortalForgot
  transition('PortalLoginPage => PortalForgotPage', slidePair('left', 'right')),
  transition('PortalForgotPage => PortalLoginPage', slidePair('right', 'left')),

  // Portal: PortalForgot <-> PortalReset
  transition('PortalForgotPage => PortalResetPage', slidePair('left', 'right')),
  transition('PortalResetPage => PortalLoginPage', slidePair('right', 'left')),

  // Portal: PortalLogin -> PortalShell (login success)
  transition('PortalLoginPage => PortalShell', [
    query(':enter, :leave', [FIXED_OVERLAY], { optional: true }),
    group([
      query(':leave', [slideOut('left')], { optional: true }),
      query(':enter', [slideIn('right')], { optional: true }),
      query(':enter', [animateChild()], { optional: true }),
    ]),
  ]),

  // Tab switch: Login <-> PortalLogin
  transition('LoginPage => PortalLoginPage', slidePair('left', 'right')),
  transition('PortalLoginPage => LoginPage', slidePair('right', 'left')),

  // Tab switch: Forgot <-> PortalForgot
  transition('ForgotPage => PortalForgotPage', slidePair('left', 'right')),
  transition('PortalForgotPage => ForgotPage', slidePair('right', 'left')),

  // Login <-> Register
  transition('LoginPage => RegisterPage', slidePair('left', 'right')),
  transition('RegisterPage => LoginPage', slidePair('right', 'left')),
]);
