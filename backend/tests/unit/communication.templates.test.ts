import { describe, expect, it } from 'vitest';
import { renderCommunication } from '../../src/modules/communications/communication.templates.js';

describe('communication templates', () => {
  it('renders a concise localized reminder from allowlisted snapshot values', () => {
    const rendered = renderCommunication('APPOINTMENT_REMINDER', 'fr', {
      recipientFirstName: 'Mohamed',
      patientFirstName: 'Rayen',
      clinicName: 'Orthodentiste',
      appointmentDate: '28 août 2026',
      appointmentTime: '10:30',
      portalUrl: null,
    });
    expect(rendered.subject).toContain('Orthodentiste');
    expect(rendered.text).toContain('Rayen');
    expect(rendered.text).toContain('10:30');
    expect(rendered.text).not.toContain('diagnosis');
  });

  it('escapes HTML and exposes portal links only as a safe CTA', () => {
    const rendered = renderCommunication('DOCUMENT_SHARED', 'en', {
      recipientFirstName: '<script>alert(1)</script>',
      patientFirstName: 'Child',
      clinicName: 'Clinic',
      documentTitle: 'Summary',
      portalUrl: 'https://app.example/portal/documents?next=<unsafe>',
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain(
      'href="https://app.example/portal/documents?next=&lt;unsafe&gt;"',
    );
  });
});
