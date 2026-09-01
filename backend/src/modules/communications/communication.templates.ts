import type { CommunicationTemplateKey } from './communication.types.js';

export type Locale = 'fr' | 'en' | 'ar';
export type Payload = Record<string, string | null>;

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

interface TemplateConfig {
  badgeIcon: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
  headline: string;
  intro: string;
  recommendationTitle?: string;
  recommendationBody?: string;
  ctaText?: string;
}

function getTemplateMeta(
  key: CommunicationTemplateKey,
  locale: Locale,
  recipient: string,
  patient: string,
  clinic: string,
  date: string,
  time: string,
  _payload?: Payload,
): TemplateConfig {
  if (locale === 'fr') {
    switch (key) {
      case 'APPOINTMENT_CONFIRMATION':
        return {
          badgeIcon: '✅',
          badgeText: 'Confirmation de rendez-vous',
          badgeBg: '#E8F5F1',
          badgeColor: '#173F38',
          badgeBorder: '#A5D6A7',
          headline: 'Votre rendez-vous est confirmé',
          intro: `Bonjour <strong>${escape(recipient)}</strong>,<br>Nous vous confirmons le rendez-vous de <strong>${escape(patient)}</strong> au cabinet <strong>${escape(clinic)}</strong>.`,
          recommendationTitle: 'Conseil pour votre visite',
          recommendationBody: "Merci de vous présenter 5 minutes avant l'heure du rendez-vous. En cas d'imprévu, merci de nous prévenir au plus tôt.",
          ctaText: 'Accéder à mon espace patient',
        };
      case 'APPOINTMENT_REMINDER':
        return {
          badgeIcon: '🔔',
          badgeText: 'Rappel de rendez-vous',
          badgeBg: '#FEF3C7',
          badgeColor: '#92400E',
          badgeBorder: '#FDE68A',
          headline: 'Rappel de votre prochain rendez-vous',
          intro: `Bonjour <strong>${escape(recipient)}</strong>,<br>Nous vous rappelons le rendez-vous de <strong>${escape(patient)}</strong> au cabinet <strong>${escape(clinic)}</strong>.`,
          recommendationTitle: 'Recommandation',
          recommendationBody: "Merci d'arriver 5 minutes avant l'heure prévue. En cas d'empêchement, prévenez le secrétariat 24h à l'avance pour libérer le créneau.",
          ctaText: 'Consulter mon rendez-vous',
        };
      case 'APPOINTMENT_CANCELLATION':
        return {
          badgeIcon: '❌',
          badgeText: 'Annulation de rendez-vous',
          badgeBg: '#FEE2E2',
          badgeColor: '#991B1B',
          badgeBorder: '#FECACA',
          headline: 'Votre rendez-vous a été annulé',
          intro: `Bonjour <strong>${escape(recipient)}</strong>,<br>Le rendez-vous de <strong>${escape(patient)}</strong> prévu le ${escape(date)} à ${escape(time)} a été annulé.`,
          recommendationTitle: 'Reprogrammation',
          recommendationBody: `Contactez le cabinet <strong>${escape(clinic)}</strong> pour convenir d'une nouvelle date si nécessaire.`,
          ctaText: 'Prendre un nouveau rendez-vous',
        };
      case 'RECEIPT_AVAILABLE':
        return {
          badgeIcon: '💳',
          badgeText: 'Reçu de paiement',
          badgeBg: '#EDE9FE',
          badgeColor: '#5B21B6',
          badgeBorder: '#DDD6FE',
          headline: 'Votre reçu de paiement est disponible',
          intro: `Bonjour <strong>${escape(recipient)}</strong>,<br>Le reçu pour les soins de <strong>${escape(patient)}</strong> est désormais accessible en ligne.`,
          recommendationTitle: 'Information comptable',
          recommendationBody: 'Vous pouvez télécharger ou imprimer ce reçu à tout moment pour vos remboursements mutuelle.',
          ctaText: 'Télécharger mon reçu',
        };
      case 'CONSENT_SIGNED':
        return {
          badgeIcon: '✍️',
          badgeText: 'Consentement signé',
          badgeBg: '#E0F2FE',
          badgeColor: '#0369A1',
          badgeBorder: '#BAE6FD',
          headline: 'Consentement médical validé',
          intro: `Bonjour <strong>${escape(recipient)}</strong>,<br>Le consentement pour <strong>${escape(patient)}</strong> a bien été signé et enregistré dans son dossier médical.`,
          recommendationTitle: 'Dossier patient',
          recommendationBody: 'Une copie conforme est conservée de manière sécurisée dans votre espace privé.',
          ctaText: 'Consulter le dossier',
        };
      case 'DOCUMENT_SHARED':
        return {
          badgeIcon: '📄',
          badgeText: 'Document médical',
          badgeBg: '#E0F2FE',
          badgeColor: '#0369A1',
          badgeBorder: '#BAE6FD',
          headline: 'Nouveau document disponible',
          intro: `Bonjour <strong>${escape(recipient)}</strong>,<br>Le cabinet <strong>${escape(clinic)}</strong> a partagé un document pour <strong>${escape(patient)}</strong>.`,
          recommendationTitle: 'Accès sécurisé',
          recommendationBody: 'Ce document est accessible en toute confidentialité dans votre espace personnel.',
          ctaText: 'Ouvrir mon document',
        };
      case 'PORTAL_INVITATION':
        return {
          badgeIcon: '✨',
          badgeText: 'Espace Patient & Parent',
          badgeBg: '#F7EBE8',
          badgeColor: '#A94830',
          badgeBorder: '#F3D2C9',
          headline: 'Bienvenue sur votre espace patient',
          intro: `Bonjour <strong>${escape(recipient)}</strong>,<br>Le cabinet <strong>${escape(clinic)}</strong> vous invite à activer votre espace privé sécurisé OrthoFlow.`,
          recommendationTitle: 'Sécurité',
          recommendationBody: "Ce lien d'invitation est personnel et sécurisé. Activez votre compte pour suivre les rendez-vous, soins et documents.",
          ctaText: 'Activer mon espace privé',
        };
    }
  }

  if (locale === 'ar') {
    switch (key) {
      case 'APPOINTMENT_CONFIRMATION':
        return {
          badgeIcon: '✅',
          badgeText: 'تأكيد الموعد',
          badgeBg: '#E8F5F1',
          badgeColor: '#173F38',
          badgeBorder: '#A5D6A7',
          headline: 'تم تأكيد موعدكم بنجاح',
          intro: `مرحباً <strong>${escape(recipient)}</strong>،<br>يسرّنا تأكيد موعد <strong>${escape(patient)}</strong> لدى عيادة <strong>${escape(clinic)}</strong>.`,
          recommendationTitle: 'إرشادات الزيارة',
          recommendationBody: 'يرجى الحضور قبل الموعد بـ 5 دقائق. في حال حدوث أي طارئ، يرجى إعلامنا مسبقاً.',
          ctaText: 'الدخول إلى فضاء المتابعة',
        };
      case 'APPOINTMENT_REMINDER':
        return {
          badgeIcon: '🔔',
          badgeText: 'تذكير بالموعد',
          badgeBg: '#FEF3C7',
          badgeColor: '#92400E',
          badgeBorder: '#FDE68A',
          headline: 'تذكير بموعدكم القادم',
          intro: `مرحباً <strong>${escape(recipient)}</strong>،<br>نذكركم بموعد <strong>${escape(patient)}</strong> القادم لدى عيادة <strong>${escape(clinic)}</strong>.`,
          recommendationTitle: 'تنبيه هـام',
          recommendationBody: 'يرجى الحضور قبل 5 دقائق من الموعد. في حال تعذر الحضور، يرجى الاتصال بالعيادة قبل 24 ساعة.',
          ctaText: 'الاطلاع على تفاصيل الموعد',
        };
      case 'APPOINTMENT_CANCELLATION':
        return {
          badgeIcon: '❌',
          badgeText: 'إلغاء الموعد',
          badgeBg: '#FEE2E2',
          badgeColor: '#991B1B',
          badgeBorder: '#FECACA',
          headline: 'تم إلغاء الموعد',
          intro: `مرحباً <strong>${escape(recipient)}</strong>،<br>تم إلغاء موعد <strong>${escape(patient)}</strong> المقرر يوم ${escape(date)} على الساعة ${escape(time)}.`,
          recommendationTitle: 'تحديد موعد جديد',
          recommendationBody: `يرجى الاتصال بعيادة <strong>${escape(clinic)}</strong> لتحديد موعد بديل في أقرب وقت.`,
          ctaText: 'طلب موعد جديد',
        };
      case 'RECEIPT_AVAILABLE':
        return {
          badgeIcon: '💳',
          badgeText: 'إيصال دفع',
          badgeBg: '#EDE9FE',
          badgeColor: '#5B21B6',
          badgeBorder: '#DDD6FE',
          headline: 'إيصال الدفع متوفر الآن',
          intro: `مرحباً <strong>${escape(recipient)}</strong>،<br>تم إصدار إيصال الدفع الخاص بعلاج <strong>${escape(patient)}</strong> وهو متوفر للاطلاع والتحميل.`,
          recommendationTitle: 'معلومات الفاتورة',
          recommendationBody: 'يمكنكم تحميل الإيصال وطباعته في أي وقت لتقديمه لشركات التأمين والتعاضديات.',
          ctaText: 'تحميل إيصال الدفع',
        };
      case 'CONSENT_SIGNED':
        return {
          badgeIcon: '✍️',
          badgeText: 'موافقة مستنيرة',
          badgeBg: '#E0F2FE',
          badgeColor: '#0369A1',
          badgeBorder: '#BAE6FD',
          headline: 'تم توقيع وثيقة الموافقة',
          intro: `مرحباً <strong>${escape(recipient)}</strong>،<br>تم توقيع وثيقة الموافقة الطبية الخاصة بـ <strong>${escape(patient)}</strong> وحفظها بأمان.`,
          recommendationTitle: 'الملف الطبي',
          recommendationBody: 'نسخة رقمية موثقة محفوظة في ملفكم الصحي الخاص.',
          ctaText: 'معاينة الملف الطبي',
        };
      case 'DOCUMENT_SHARED':
        return {
          badgeIcon: '📄',
          badgeText: 'مستند طبي',
          badgeBg: '#E0F2FE',
          badgeColor: '#0369A1',
          badgeBorder: '#BAE6FD',
          headline: 'مستند جديد متوفر للاطلاع',
          intro: `مرحباً <strong>${escape(recipient)}</strong>،<br>قامت عيادة <strong>${escape(clinic)}</strong> بإضافة مستند جديد خاص بـ <strong>${escape(patient)}</strong>.`,
          recommendationTitle: 'أمان البيانات',
          recommendationBody: 'يمكنكم معاينة هذا المستند وتحميله بسرية تامة عبر فضاء المتابعة.',
          ctaText: 'فتح المستند',
        };
      case 'PORTAL_INVITATION':
        return {
          badgeIcon: '✨',
          badgeText: 'فضاء المريض والعائلة',
          badgeBg: '#F7EBE8',
          badgeColor: '#A94830',
          badgeBorder: '#F3D2C9',
          headline: 'مرحباً بكم في فضاء المتابعة الخاص',
          intro: `مرحباً <strong>${escape(recipient)}</strong>،<br>تدعوكم عيادة <strong>${escape(clinic)}</strong> لتفعيل حسابكم في فضاء المتابعة الآمن OrthoFlow.`,
          recommendationTitle: 'أمان الحساب',
          recommendationBody: 'هذا الرابط شخصي ومؤقت. قوموا بتفعيل حسابكم لمتابعة المواعيد، الفحوصات والوثائق.',
          ctaText: 'تفعيل حسابي الآن',
        };
    }
  }

  // English (en) fallback
  switch (key) {
    case 'APPOINTMENT_CONFIRMATION':
      return {
        badgeIcon: '✅',
        badgeText: 'Appointment Confirmed',
        badgeBg: '#E8F5F1',
        badgeColor: '#173F38',
        badgeBorder: '#A5D6A7',
        headline: 'Your appointment is confirmed',
        intro: `Hello <strong>${escape(recipient)}</strong>,<br>We confirm the appointment for <strong>${escape(patient)}</strong> at <strong>${escape(clinic)}</strong>.`,
        recommendationTitle: 'Visit Guidelines',
        recommendationBody: 'Please arrive 5 minutes before your scheduled time. If you have any questions, please contact the clinic.',
        ctaText: 'Access patient portal',
      };
    case 'APPOINTMENT_REMINDER':
      return {
        badgeIcon: '🔔',
        badgeText: 'Appointment Reminder',
        badgeBg: '#FEF3C7',
        badgeColor: '#92400E',
        badgeBorder: '#FDE68A',
        headline: 'Reminder for your upcoming visit',
        intro: `Hello <strong>${escape(recipient)}</strong>,<br>This is a friendly reminder for <strong>${escape(patient)}</strong>'s appointment at <strong>${escape(clinic)}</strong>.`,
        recommendationTitle: 'Helpful reminder',
        recommendationBody: 'Please arrive 5 minutes early. If you need to reschedule, kindly notify the clinic at least 24 hours in advance.',
        ctaText: 'View appointment details',
      };
    case 'APPOINTMENT_CANCELLATION':
      return {
        badgeIcon: '❌',
        badgeText: 'Appointment Cancelled',
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        badgeBorder: '#FECACA',
        headline: 'Your appointment has been cancelled',
        intro: `Hello <strong>${escape(recipient)}</strong>,<br>The appointment for <strong>${escape(patient)}</strong> scheduled on ${escape(date)} at ${escape(time)} was cancelled.`,
        recommendationTitle: 'Rescheduling',
        recommendationBody: `Please contact <strong>${escape(clinic)}</strong> to schedule a new visit at your convenience.`,
        ctaText: 'Book a new appointment',
      };
    case 'RECEIPT_AVAILABLE':
      return {
        badgeIcon: '💳',
        badgeText: 'Payment Receipt',
        badgeBg: '#EDE9FE',
        badgeColor: '#5B21B6',
        badgeBorder: '#DDD6FE',
        headline: 'Your payment receipt is available',
        intro: `Hello <strong>${escape(recipient)}</strong>,<br>The receipt for <strong>${escape(patient)}</strong>'s care is now available online.`,
        recommendationTitle: 'Accounting record',
        recommendationBody: 'You can download or print this receipt anytime for insurance reimbursement claims.',
        ctaText: 'Download receipt',
      };
    case 'CONSENT_SIGNED':
      return {
        badgeIcon: '✍️',
        badgeText: 'Consent Signed',
        badgeBg: '#E0F2FE',
        badgeColor: '#0369A1',
        badgeBorder: '#BAE6FD',
        headline: 'Informed consent completed',
        intro: `Hello <strong>${escape(recipient)}</strong>,<br>The consent form for <strong>${escape(patient)}</strong> has been successfully signed and stored in the medical record.`,
        recommendationTitle: 'Medical records',
        recommendationBody: 'A secure copy is permanently accessible in your private portal.',
        ctaText: 'Review document',
      };
    case 'DOCUMENT_SHARED':
      return {
        badgeIcon: '📄',
        badgeText: 'Medical Document',
        badgeBg: '#E0F2FE',
        badgeColor: '#0369A1',
        badgeBorder: '#BAE6FD',
        headline: 'New document available',
        intro: `Hello <strong>${escape(recipient)}</strong>,<br><strong>${escape(clinic)}</strong> has shared a new document for <strong>${escape(patient)}</strong>.`,
        recommendationTitle: 'Confidentiality',
        recommendationBody: 'You can safely view and download this file in your patient portal.',
        ctaText: 'Open document',
      };
    case 'PORTAL_INVITATION':
      return {
        badgeIcon: '✨',
        badgeText: 'Patient Portal',
        badgeBg: '#F7EBE8',
        badgeColor: '#A94830',
        badgeBorder: '#F3D2C9',
        headline: 'Welcome to your patient portal',
        intro: `Hello <strong>${escape(recipient)}</strong>,<br><strong>${escape(clinic)}</strong> invites you to activate your secure OrthoFlow patient portal.`,
        recommendationTitle: 'Security notice',
        recommendationBody: 'This invitation link is private and time-sensitive. Activate your account to easily manage appointments and documents.',
        ctaText: 'Activate my portal access',
      };
  }
}

function copy(
  key: CommunicationTemplateKey,
  locale: Locale,
  payload: Payload,
): { subject: string; text: string } {
  const clinic = value(payload, 'clinicName', 'OrthoFlow');
  const recipient = value(
    payload,
    'recipientFirstName',
    locale === 'ar' ? 'عزيزنا' : locale === 'fr' ? 'Bonjour' : 'Hello',
  );
  const patient = value(
    payload,
    'patientFirstName',
    locale === 'ar' ? 'المريض' : locale === 'fr' ? 'le patient' : 'the patient',
  );
  const date = value(payload, 'appointmentDate');
  const time = value(payload, 'appointmentTime');
  const link = value(payload, 'portalUrl');
  const linkLine = link
    ? `\n${locale === 'ar' ? 'فتح فضاء المتابعة' : locale === 'fr' ? 'Ouvrir le portail' : 'Open portal'}: ${link}`
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

  if (locale === 'ar') {
    switch (key) {
      case 'APPOINTMENT_CONFIRMATION':
        return {
          subject: `تأكيد الموعد · ${clinic}`,
          text: `مرحباً ${recipient}،\n\nنؤكد لكم موعد ${patient} يوم ${date} على الساعة ${time}.\n\n${clinic}`,
        };
      case 'APPOINTMENT_REMINDER':
        return {
          subject: `تذكير بالموعد · ${clinic}`,
          text: `مرحباً ${recipient}،\n\nنذكركم بموعد ${patient} يوم ${date} على الساعة ${time}.\n\n${clinic}`,
        };
      case 'APPOINTMENT_CANCELLATION':
        return {
          subject: `إلغاء الموعد · ${clinic}`,
          text: `مرحباً ${recipient}،\n\nتم إلغاء موعد ${patient} المقرر يوم ${date} على الساعة ${time}.\n\nيرجى التواصل مع ${clinic} إذا لزم الأمر.`,
        };
      case 'RECEIPT_AVAILABLE':
        return {
          subject: `إيصال الدفع متوفر · ${clinic}`,
          text: `مرحباً ${recipient}،\n\nإيصال الدفع ${value(payload, 'receiptReference')} متوفر الآن.${linkLine}\n\n${clinic}`,
        };
      case 'CONSENT_SIGNED':
        return {
          subject: `تم توقيع الموافقة · ${clinic}`,
          text: `مرحباً ${recipient}،\n\nتم توقيع وثيقة الموافقة « ${value(payload, 'consentTitle')} » بنجاح.${linkLine}\n\n${clinic}`,
        };
      case 'DOCUMENT_SHARED':
        return {
          subject: `مستند جديد متوفر · ${clinic}`,
          text: `مرحباً ${recipient}،\n\nالمستند « ${value(payload, 'documentTitle')} » متوفر في فضاء المتابعة الخاص بكم.${linkLine}\n\n${clinic}`,
        };
      case 'PORTAL_INVITATION':
        return {
          subject: `${clinic} يدعوكم للانضمام إلى OrthoFlow`,
          text: `مرحباً ${recipient}،\n\nيدعوكم ${clinic} لتفعيل حسابكم في فضاء المتابعة الخاص بـ OrthoFlow.${linkLine}\n\nهذا الرابط شخصي ومؤقت.`,
        };
    }
  }

  // English fallback
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
  const isRtl = locale === 'ar';
  const clinic = value(payload, 'clinicName', 'OrthoFlow');
  const recipient = value(
    payload,
    'recipientFirstName',
    locale === 'ar' ? 'عزيزنا' : locale === 'fr' ? 'Cher patient' : 'Valued Patient',
  );
  const patient = value(
    payload,
    'patientFirstName',
    locale === 'ar' ? 'المريض' : locale === 'fr' ? 'le patient' : 'the patient',
  );
  const date = value(payload, 'appointmentDate');
  const time = value(payload, 'appointmentTime');
  const portalUrl = payload.portalUrl?.trim() || null;

  const meta = getTemplateMeta(key, locale, recipient, patient, clinic, date, time, payload);

  const isAppointment =
    key === 'APPOINTMENT_CONFIRMATION' ||
    key === 'APPOINTMENT_REMINDER' ||
    key === 'APPOINTMENT_CANCELLATION';

  const dateLabel = locale === 'ar' ? 'التاريخ' : locale === 'fr' ? 'Date' : 'Date';
  const timeLabel = locale === 'ar' ? 'التوقيت' : locale === 'fr' ? 'Heure' : 'Time';
  const patientLabel = locale === 'ar' ? 'المريض' : locale === 'fr' ? 'Patient' : 'Patient';
  const clinicLabel =
    locale === 'ar' ? 'العيادة' : locale === 'fr' ? 'Établissement' : 'Clinic';
  const tagline =
    locale === 'ar'
      ? 'عيادة طب وتقويم الأسنان'
      : locale === 'fr'
        ? 'Cabinet Dentaire & Orthodontie'
        : 'Dental & Orthodontic Practice';
  const footerNote =
    locale === 'ar'
      ? 'رسالة آلية مرسلة بأمان وسرية تامة من قِبل العيادة لراحتكم ومتابعة علاجكم.'
      : locale === 'fr'
        ? 'Message automatique et confidentiel transmis par votre cabinet pour le suivi de vos soins.'
        : 'Automated and confidential message sent by your practice for your dental care follow-up.';

  // Information Highlight Block
  let detailsBlockHtml = '';

  if (isAppointment && (date || time)) {
    detailsBlockHtml = `
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F4F7F5; border: 1px solid #D5E2DC; border-radius: 12px; margin: 24px 0; overflow: hidden; border-collapse: separate;">
        <tr>
          <td width="50%" style="padding: 16px 20px; border-bottom: 1px solid #E2ECE7; vertical-align: top; text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #73847F; font-weight: 700; margin-bottom: 4px;">📅 ${dateLabel}</div>
            <div style="font-size: 15px; font-weight: 700; color: #0D2925; line-height: 1.3;">${escape(date)}</div>
          </td>
          <td width="50%" style="padding: 16px 20px; border-bottom: 1px solid #E2ECE7; ${isRtl ? 'border-right: 1px solid #E2ECE7;' : 'border-left: 1px solid #E2ECE7;'} vertical-align: top; text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #73847F; font-weight: 700; margin-bottom: 4px;">⏰ ${timeLabel}</div>
            <div style="font-size: 15px; font-weight: 700; color: #0D2925; line-height: 1.3;">${escape(time)}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding: 14px 20px; vertical-align: top; text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #73847F; font-weight: 700; margin-bottom: 3px;">👤 ${patientLabel}</div>
            <div style="font-size: 14px; font-weight: 600; color: #17201E;">${escape(patient)}</div>
          </td>
          <td width="50%" style="padding: 14px 20px; ${isRtl ? 'border-right: 1px solid #E2ECE7;' : 'border-left: 1px solid #E2ECE7;'} vertical-align: top; text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #73847F; font-weight: 700; margin-bottom: 3px;">🏥 ${clinicLabel}</div>
            <div style="font-size: 14px; font-weight: 600; color: #17201E;">${escape(clinic)}</div>
          </td>
        </tr>
      </table>
    `;
  } else if (key === 'RECEIPT_AVAILABLE') {
    const ref = value(payload, 'receiptReference');
    detailsBlockHtml = `
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 12px; margin: 24px 0; padding: 20px 24px;">
        <tr>
          <td style="text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #6D28D9; font-weight: 700; margin-bottom: 4px;">${locale === 'ar' ? 'رقم الإيصال' : locale === 'fr' ? 'Référence du reçu' : 'Receipt Reference'}</div>
            <div style="font-size: 18px; font-weight: 800; color: #4C1D95; font-family: monospace, sans-serif; letter-spacing: 1px;">${escape(ref)}</div>
            <div style="font-size: 13px; color: #5B21B6; font-weight: 600; margin-top: 8px;">👤 ${escape(patient)} · 🏥 ${escape(clinic)}</div>
          </td>
        </tr>
      </table>
    `;
  } else if (key === 'CONSENT_SIGNED') {
    const title = value(payload, 'consentTitle');
    detailsBlockHtml = `
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 12px; margin: 24px 0; padding: 20px 24px;">
        <tr>
          <td style="text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #0284C7; font-weight: 700; margin-bottom: 4px;">${locale === 'ar' ? 'وثيقة الموافقة الموقعة' : locale === 'fr' ? 'Document de consentement' : 'Signed Document'}</div>
            <div style="font-size: 16px; font-weight: 700; color: #0369A1;">« ${escape(title)} »</div>
            <div style="display: inline-block; background: #E0F2FE; color: #075985; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; margin-top: 10px;">✓ ${locale === 'ar' ? 'موقعة ومسجلة رسمياً' : locale === 'fr' ? 'Signé électroniquement' : 'Signed & Validated'}</div>
          </td>
        </tr>
      </table>
    `;
  } else if (key === 'DOCUMENT_SHARED') {
    const title = value(payload, 'documentTitle');
    detailsBlockHtml = `
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 12px; margin: 24px 0; padding: 20px 24px;">
        <tr>
          <td style="text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #0284C7; font-weight: 700; margin-bottom: 4px;">${locale === 'ar' ? 'عنوان المستند' : locale === 'fr' ? 'Document médical' : 'Shared Document'}</div>
            <div style="font-size: 16px; font-weight: 700; color: #0369A1;">📄 « ${escape(title)} »</div>
            <div style="font-size: 13px; color: #0284C7; margin-top: 6px;">👤 ${escape(patient)} · 🏥 ${escape(clinic)}</div>
          </td>
        </tr>
      </table>
    `;
  }

  // Recommendation / Tips Box
  let adviceBlockHtml = '';
  if (meta.recommendationTitle && meta.recommendationBody) {
    const isCancel = key === 'APPOINTMENT_CANCELLATION';
    const boxBg = isCancel ? '#FEF2F2' : '#F6F3EC';
    const boxBorder = isCancel ? '#DC2626' : '#173F38';
    const textColor = isCancel ? '#991B1B' : '#56635F';
    adviceBlockHtml = `
      <div style="background-color: ${boxBg}; ${isRtl ? `border-right: 3px solid ${boxBorder}; border-radius: 8px 0 0 8px;` : `border-left: 3px solid ${boxBorder}; border-radius: 0 8px 8px 0;`} padding: 14px 18px; margin: 22px 0 12px 0; text-align: ${isRtl ? 'right' : 'left'};">
        <p style="margin: 0; font-size: 13px; color: ${textColor}; line-height: 1.55;">
          ${isCancel ? '⚠️' : '💡'} <strong>${escape(meta.recommendationTitle)} :</strong> ${meta.recommendationBody}
        </p>
      </div>
    `;
  }

  // CTA Button
  let ctaButtonHtml = '';
  if (portalUrl) {
    const ctaLabel = meta.ctaText ?? (locale === 'ar' ? 'فتح فضاء المتابعة' : locale === 'fr' ? 'Ouvrir mon espace privé' : 'Open secure portal');
    ctaButtonHtml = `
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 18px 0; width: 100%;">
        <tr>
          <td align="center">
            <a href="${escape(portalUrl)}" style="display: inline-block; background-color: #173F38; color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(23, 63, 56, 0.22); letter-spacing: 0.2px;">
              ${escape(ctaLabel)} ${isRtl ? '←' : '→'}
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="${locale}" ${isRtl ? 'dir="rtl"' : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(rendered.subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F3EC; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #17201E;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F6F3EC; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #FFFEFB; border-radius: 16px; overflow: hidden; border: 1px solid #DCE2DE; box-shadow: 0 12px 36px rgba(13, 41, 37, 0.07);">

          <!-- Top Header with Deep Pine Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0D2925 0%, #173F38 100%); padding: 32px 36px; text-align: center; border-bottom: 3px solid #C86445;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: rgba(255, 254, 251, 0.08); border: 1px solid rgba(255, 254, 251, 0.16); border-radius: 12px; padding: 9px 22px; margin-bottom: 6px;">
                      <span style="font-size: 22px; font-weight: 700; color: #FFFEFB; letter-spacing: -0.3px;">${escape(clinic)}<span style="color: #C86445;">.</span></span>
                    </div>
                    <div style="font-size: 12px; color: #DCE2DE; font-weight: 500; letter-spacing: 0.6px; text-transform: uppercase;">${tagline}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px; text-align: ${isRtl ? 'right' : 'left'};">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="text-align: ${isRtl ? 'right' : 'left'};">

                    <!-- Badge Pill -->
                    <span style="display: inline-block; background-color: ${meta.badgeBg}; color: ${meta.badgeColor}; border: 1px solid ${meta.badgeBorder}; font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 16px;">
                      ${meta.badgeIcon} ${escape(meta.badgeText)}
                    </span>

                    <!-- Main Headline -->
                    <h1 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 700; color: #0D2925; line-height: 1.35;">
                      ${escape(meta.headline)}
                    </h1>

                    <!-- Body Paragraph -->
                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #56635F; line-height: 1.65;">
                      ${meta.intro}
                    </p>

                    <!-- Details Card (Dates, Reference, etc) -->
                    ${detailsBlockHtml}

                    <!-- Advice & Guidance Box -->
                    ${adviceBlockHtml}

                    <!-- CTA Button -->
                    ${ctaButtonHtml}

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F6F3EC; padding: 24px 36px; text-align: center; border-top: 1px solid #DCE2DE;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #173F38;">
                ${escape(clinic)} · OrthoFlow
              </p>
              <p style="margin: 0; font-size: 12px; color: #73847F; line-height: 1.45;">
                ${footerNote}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { ...rendered, html };
}

export const COMMUNICATION_TEMPLATE_VERSION = 1;
