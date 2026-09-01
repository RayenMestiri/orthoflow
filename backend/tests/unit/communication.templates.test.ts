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

  it('renders Arabic templates with RTL direction and authentic Arabic phrasing', () => {
    const rendered = renderCommunication('APPOINTMENT_REMINDER', 'ar', {
      recipientFirstName: 'محمد',
      patientFirstName: 'ريان',
      clinicName: 'عيادة الأمل',
      appointmentDate: 'الاثنين، 31 أوت 2026',
      appointmentTime: '09:30',
      portalUrl: 'https://app.example/portal',
    });
    expect(rendered.subject).toContain('تذكير بالموعد');
    expect(rendered.subject).toContain('عيادة الأمل');
    expect(rendered.text).toContain('ريان');
    expect(rendered.text).toContain('31 أوت 2026');
    expect(rendered.html).toContain('dir="rtl"');
    expect(rendered.html).toContain('عيادة طب وتقويم الأسنان');
    expect(rendered.html).toContain('التاريخ');
    expect(rendered.html).toContain('التوقيت');
  });

  it('renders executive appointment confirmation card in French', () => {
    const rendered = renderCommunication('APPOINTMENT_CONFIRMATION', 'fr', {
      recipientFirstName: 'Sophie',
      patientFirstName: 'Lucas',
      clinicName: 'Cabinet Ortho',
      appointmentDate: 'Lundi 31 août 2026',
      appointmentTime: '14:00',
      portalUrl: 'https://app.example/portal',
    });
    expect(rendered.subject).toContain('Rendez-vous confirmé');
    expect(rendered.html).toContain('Cabinet Dentaire & Orthodontie');
    expect(rendered.html).toContain('Lundi 31 août 2026');
    expect(rendered.html).toContain('14:00');
    expect(rendered.html).toContain('Accéder à mon espace patient');
  });
});
