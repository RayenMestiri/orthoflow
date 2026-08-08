# Repository Guidelines

## Product Direction

OrthoFlow is practice-management software for orthodontic and dental teams—not a patient booking marketplace. It should make scheduling, treatment progress, clinic operations, and physical-payment records clear and trustworthy. Primary users are orthodontists, owners, secretaries, and assistants; patients, parents, and guardians are secondary users. The business goal is early-access conversion now, followed by validated SaaS adoption across multiple clinics.

**Always read AGENTS.md and design.md before implementing or redesigning any interface.**

## Current Scope

The current phase includes the established landing page, authenticated foundation, shared dashboard shell, and production patient management: clinic-scoped patient search, creation, profiles, administrative editing, guardians, audit activity, and soft archive. Do not expand into appointment, treatment, cash-record, analytics, notification, portal, or administration functionality until those domains receive their own milestone. Preserve the landing page and dashboard visual systems and never invent testimonials, metrics, certifications, clinic logos, appointments, treatments, or financial values.

## Structure & Commands

Feature code belongs in `src/app/features/`; public framing belongs in `src/app/layouts/`; broadly reusable UI belongs in `src/app/shared/`; app-wide services and models belong in `src/app/core/`. Design primitives live in `src/styles/`; static files live in `public/`.

- `npm start` — run the local development server.
- `npm run build` — create a production bundle.
- `npm test` — run Vitest unit tests once.
- `npm run lint` — check TypeScript and Angular templates.
- `npm run format:check` — verify Prettier formatting.

Use Node `22.22.3+`, `24.15+`, or `26+` as required by Angular 22.

## Angular & Code Conventions

Use standalone components, strict TypeScript, lazy feature routes, Signals for local reactive state, and RxJS only for asynchronous streams. Prefer semantic HTML and CSS over JavaScript effects. Use two-space indentation, single quotes, kebab-case filenames/selectors, PascalCase types, camelCase members, and suffix tests with `.spec.ts`. Keep components focused; move repeated content into typed data instead of duplicating markup.

## Quality Bar

Target WCAG 2.2 AA: keyboard access, visible focus, sufficient contrast, semantic landmarks, correct labels, 44px touch targets, and reduced-motion support. Design mobile-first and verify 360, 390, 430, 768, 1024, 1280, and 1440px widths. Avoid layout shift, heavy animation libraries, unnecessary dependencies, oversized images, and nonessential effects. Never bypass lint/type errors, use `any`, hide overflow bugs, or ship placeholder UI as finished work.

Commits should use Conventional Commits, for example `feat: add cash traceability story`. Pull requests need a focused summary, test evidence, linked issue when available, and screenshots for visual changes.
