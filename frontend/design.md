# OrthoFlow Design System

## Visual Intent

OrthoFlow should feel calm, precise, human, premium, and operationally credible. The identity combines warm porcelain surfaces with deep pine and a restrained copper accent—distinct from the expected blue/cyan healthcare gradient. Interfaces should communicate through hierarchy, alignment, and believable workflow details, not decoration.

## Design Tokens

Tokens are defined as CSS custom properties in `src/styles/_tokens.scss` so themes can be introduced without rewriting components.

- **Brand:** pine `#173F38`, pine-dark `#0D2925`, copper `#C86445`, copper-dark `#A94830`.
- **Neutrals:** ink `#17201E`, slate `#56635F`, mist `#DCE2DE`, porcelain `#F6F3EC`, white `#FFFEFB`.
- **Semantic:** success `#2D765F`, warning `#A66719`, danger `#A33D3D`, info `#3F6574`.
- **Surfaces:** page porcelain, elevated white, dark pine, and a pale sage tint for emphasized stories.
- **Typography:** Manrope Variable; weights 400, 500, 600, and 700 only. Body text is 16–18px; the fluid hero is restrained to 68px maximum; future compact UI text may use 13–14px.
- **Spacing:** 4px base scale from `--space-1` (4px) through `--space-24` (96px).
- **Radius:** 8px controls, 14px cards, 20px feature surfaces, and pill radius only for tags/actions.
- **Shadows:** soft neutral elevation; no colored glow or stacked glass effects.
- **Containers:** 1180px content maximum with 24–40px responsive gutters.
- **Breakpoints:** 360, 430, 768, 1024, 1280, and 1440px review widths.
- **Motion:** 160ms controls and 280ms reveals using an ease-out curve; disable nonessential movement for `prefers-reduced-motion`.
- **Icons:** 16px inline, 20px controls, 24px feature icons; use simple 1.75px line SVGs.

## Composition Principles

Use editorial layouts, asymmetry, and structured product UI to vary rhythm. Keep one dominant action per section. Product previews must show coherent data—appointments, treatments, staff, guardians, and payments—not random cards or meaningless charts. Copper is a focal accent, never a full-page wash. Gradients may only add subtle surface depth.

## Components & Interaction

Buttons use clear text, visible hover/active/focus states, and a 44px minimum target. Cards appear only when content is genuinely grouped. Forms use persistent labels, useful autocomplete attributes, inline validation, and explicit submission feedback. Navigation is sticky but compact; the mobile menu remains keyboard operable and intentionally composed.

## Accessibility & Performance

Target WCAG 2.2 AA contrast, semantic landmarks, logical headings, keyboard navigation, and descriptive accessible names. Never encode meaning through color alone. Favor CSS/SVG, prevent layout shifts with explicit geometry, lazy-load noncritical media, and avoid animation or UI libraries without a measured need.
