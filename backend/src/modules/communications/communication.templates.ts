import type { CommunicationTemplateKey } from './communication.types.js';

type Locale = 'fr' | 'en' | 'ar';
type Payload = Record<string, string | null>;
export interface RenderedCommunication {
  subject: string;
  text: string;
  html: string;
}

const escape = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
      character,
  );
const value = (payload: Payload, key: string, fallback = '') => payload[key]?.trim() || fallback;

function copy(
  key: CommunicationTemplateKey,
  locale: Locale,
  payload: Payload,
): { subject: string; text: string } {
  const clinic = value(payload, 'clinicName', 'OrthoFlow');
  const recipient = value(payload, 'recipientFirstName', locale === 'fr' ? 'Bonjour' : 'Hello');
  const patient = value(
    payload,
    'patientFirstName',
    locale === 'fr' ? 'le patient' : 'the patient',
  );
  const date = value(payload, 'appointmentDate');
  const time = value(payload, 'appointmentTime');
  const link = value(payload, 'portalUrl');
  const linkLine = link
    ? `\n${locale === 'fr' ? 'Ouvrir le portail' : 'Open portal'}: ${link}`
    : '';

  if (locale === 'fr') {
    switch (key) {
      case 'APPOINTMENT_CONFIRMATION':
        return {
          subject: `Rendez-vous confirmé · ${clinic}`,
          text: `Bonjour ${recipient},\n\nLe rendez-vous de ${patient} est confirmé le ${date} à ${time}.\n\n${clinic}`,
        };
      case 'APPOINTMENT_REMINDER':
        return {
          subject: `Rappel de rendez-vous · ${clinic}`,
          text: `Bonjour ${recipient},\n\nRappel : ${patient} a un rendez-vous le ${date} à ${time}.\n\n${clinic}`,
        };
      case 'APPOINTMENT_CANCELLATION':
        return {
          subject: `Rendez-vous annulé · ${clinic}`,
          text: `Bonjour ${recipient},\n\nLe rendez-vous de ${patient} prévu le ${date} à ${time} a été annulé.\n\nContactez ${clinic} si nécessaire.`,
        };
      case 'RECEIPT_AVAILABLE':
        return {
          subject: `Reçu disponible · ${clinic}`,
          text: `Bonjour ${recipient},\n\nLe reçu ${value(payload, 'receiptReference')} est disponible.${linkLine}\n\n${clinic}`,
        };
      case 'CONSENT_SIGNED':
        return {
          subject: `Consentement signé · ${clinic}`,
          text: `Bonjour ${recipient},\n\nLe consentement « ${value(payload, 'consentTitle')} » a bien été signé.${linkLine}\n\n${clinic}`,
        };
      case 'DOCUMENT_SHARED':
        return {
          subject: `Document disponible · ${clinic}`,
          text: `Bonjour ${recipient},\n\nLe document « ${value(payload, 'documentTitle')} » est disponible dans votre espace privé.${linkLine}\n\n${clinic}`,
        };
      case 'PORTAL_INVITATION':
        return {
          subject: `${clinic} vous invite sur OrthoFlow`,
          text: `Bonjour ${recipient},\n\n${clinic} vous invite à activer votre espace parent sécurisé.${linkLine}\n\nCe lien est personnel et temporaire.`,
        };
    }
  }

  switch (key) {
    case 'APPOINTMENT_CONFIRMATION':
      return {
        subject: `Appointment confirmed · ${clinic}`,
        text: `Hello ${recipient},\n\n${patient}'s appointment is confirmed for ${date} at ${time}.\n\n${clinic}`,
      };
    case 'APPOINTMENT_REMINDER':
      return {
        subject: `Appointment reminder · ${clinic}`,
        text: `Hello ${recipient},\n\nReminder: ${patient} has an appointment on ${date} at ${time}.\n\n${clinic}`,
      };
    case 'APPOINTMENT_CANCELLATION':
      return {
        subject: `Appointment cancelled · ${clinic}`,
        text: `Hello ${recipient},\n\n${patient}'s appointment scheduled for ${date} at ${time} was cancelled.\n\nContact ${clinic} if needed.`,
      };
    case 'RECEIPT_AVAILABLE':
      return {
        subject: `Receipt available · ${clinic}`,
        text: `Hello ${recipient},\n\nReceipt ${value(payload, 'receiptReference')} is available.${linkLine}\n\n${clinic}`,
      };
    case 'CONSENT_SIGNED':
      return {
        subject: `Consent signed · ${clinic}`,
        text: `Hello ${recipient},\n\nThe consent “${value(payload, 'consentTitle')}” was signed successfully.${linkLine}\n\n${clinic}`,
      };
    case 'DOCUMENT_SHARED':
      return {
        subject: `Document available · ${clinic}`,
        text: `Hello ${recipient},\n\n“${value(payload, 'documentTitle')}” is available in your private portal.${linkLine}\n\n${clinic}`,
      };
    case 'PORTAL_INVITATION':
      return {
        subject: `${clinic} invited you to OrthoFlow`,
        text: `Hello ${recipient},\n\n${clinic} invited you to activate your secure parent portal.${linkLine}\n\nThis link is personal and temporary.`,
      };
  }
}

export function renderCommunication(
  key: CommunicationTemplateKey,
  locale: Locale,
  payload: Payload,
): RenderedCommunication {
  const rendered = copy(key, locale, payload);
  const portalUrl = payload.portalUrl?.trim() || null;
  const html = `<div style="font-family:Manrope,Arial,sans-serif;max-width:560px;margin:auto;background:#fffefb;color:#17201e;padding:32px;border:1px solid #dce2de;border-radius:16px"><div style="color:#0d2925;font-weight:800;font-size:20px;margin-bottom:20px">OrthoFlow</div>${rendered.text
    .split('\n')
    .filter(Boolean)
    .map((line) => `<p style="line-height:1.6;margin:0 0 12px">${escape(line)}</p>`)
    .join(
      '',
    )}${portalUrl ? `<p style="margin:22px 0 0"><a href="${escape(portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#fff;background:#173f38;text-decoration:none;font-weight:700">${locale === 'fr' ? 'Ouvrir mon espace privé' : 'Open secure portal'}</a></p>` : ''}</div>`;
  return { ...rendered, html };
}

export const COMMUNICATION_TEMPLATE_VERSION = 1;
