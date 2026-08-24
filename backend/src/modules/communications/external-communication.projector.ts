import { Temporal } from 'temporal-polyfill';
import { env } from '../../config/env.js';
import type { CommunicationEventRecord } from '../notifications/notification.types.js';
import { clinicRepository } from '../clinics/clinic.repository.js';
import { DEFAULT_CLINIC_SETTINGS } from '../clinics/clinic-settings.types.js';
import { patientRepository } from '../patients/patient.repository.js';
import {
  communicationRepository,
  type CommunicationRepository,
} from './communication.repository.js';
import {
  recipientResolverService,
  type RecipientResolverService,
} from './recipient-resolver.service.js';
import {
  EXTERNAL_EVENT_TYPES,
  TEMPLATE_KEYS,
  type CommunicationTemplateKey,
} from './communication.types.js';
import { COMMUNICATION_TEMPLATE_VERSION } from './communication.templates.js';

type Payload = Record<string, unknown>;
const text = (payload: Payload, key: string): string | null =>
  typeof payload[key] === 'string' && payload[key] ? String(payload[key]) : null;
const recognized = new Set<string>(Object.values(EXTERNAL_EVENT_TYPES));

export class ExternalCommunicationProjector {
  constructor(
    private readonly jobs: CommunicationRepository = communicationRepository,
    private readonly recipients: RecipientResolverService = recipientResolverService,
  ) {}

  async dispatch(event: CommunicationEventRecord): Promise<void> {
    if (!recognized.has(event.type)) return;
    const clinicId = event.clinicId.toString();
    const appointmentId =
      event.aggregateType === 'APPOINTMENT'
        ? event.aggregateId.toString()
        : text(event.payload, 'appointmentId');
    if (
      appointmentId &&
      [
        EXTERNAL_EVENT_TYPES.APPOINTMENT_RESCHEDULED,
        EXTERNAL_EVENT_TYPES.APPOINTMENT_CANCELLED,
        EXTERNAL_EVENT_TYPES.APPOINTMENT_NO_SHOW,
      ].includes(event.type as never)
    ) {
      await this.jobs.cancelPendingForAppointment(clinicId, appointmentId, `EVENT_${event.type}`);
    }
    if (event.type === EXTERNAL_EVENT_TYPES.APPOINTMENT_NO_SHOW) return;

    const patientId = text(event.payload, 'patientId');
    if (!patientId) return;
    const [clinic, patient] = await Promise.all([
      clinicRepository.findById(clinicId),
      patientRepository.findByIdInClinic(patientId, clinicId),
    ]);
    if (!clinic || !patient) return;
    const settings = clinic.settings?.communications ?? DEFAULT_CLINIC_SETTINGS.communications;
    const template = this.templateFor(event.type, settings);
    if (!template) return;

    const guardianId = text(event.payload, 'guardianId');
    const explicitStaffDelivery =
      event.type === EXTERNAL_EVENT_TYPES.PORTAL_INVITATION ||
      event.type === EXTERNAL_EVENT_TYPES.DOCUMENT_SHARED;
    const recipient = await this.recipients.resolve(
      clinic,
      patient,
      event.occurredAt,
      guardianId,
      explicitStaffDelivery,
    );
    if (!recipient) return;
    const startAt = this.appointmentStart(event.payload);
    const schedule = this.scheduleFor(
      template,
      startAt,
      clinic.timezone,
      settings.reminderLeadMinutes,
    );
    if (!schedule) return;
    const locale = clinic.settings?.general?.defaultLanguage ?? 'fr';
    const labels = startAt ? this.appointmentLabels(startAt, clinic.timezone, locale) : null;
    const portalPath = this.portalPath(template, patientId);
    const payloadSnapshot: Record<string, string | null> = {
      recipientFirstName: recipient.firstName,
      patientFirstName: patient.firstName,
      clinicName: clinic.name,
      appointmentDate: labels?.date ?? null,
      appointmentTime: labels?.time ?? null,
      appointmentStartAt: startAt?.toISOString() ?? null,
      receiptReference: text(event.payload, 'receiptReference'),
      consentTitle: text(event.payload, 'consentTitle'),
      documentTitle: text(event.payload, 'documentTitle'),
      portalUrl: portalPath ? `${env.FRONTEND_URL}${portalPath}` : null,
      portalUrlEncrypted: text(event.payload, 'activationUrlEncrypted'),
    };
    const suffix =
      template === TEMPLATE_KEYS.APPOINTMENT_REMINDER && startAt
        ? `${startAt.toISOString()}:${settings.reminderLeadMinutes}M`
        : event.eventId;
    await this.jobs.createIdempotent({
      clinicId,
      sourceEventId: event.eventId,
      eventType: event.type,
      patientId,
      appointmentId,
      recipientType: recipient.recipientType,
      recipientId: recipient.recipientId,
      channel: recipient.channel,
      destinationSnapshot: recipient.destination,
      destinationMasked: recipient.destinationMasked,
      templateKey: template,
      templateVersion: COMMUNICATION_TEMPLATE_VERSION,
      locale,
      payloadSnapshot,
      deduplicationKey: `${template}:${appointmentId ?? event.aggregateId.toString()}:${suffix}:${recipient.channel}:${recipient.recipientId}`,
      scheduledFor: schedule.scheduledFor,
      expiresAt: schedule.expiresAt,
    });
  }

  private templateFor(
    eventType: string,
    settings: typeof DEFAULT_CLINIC_SETTINGS.communications,
  ): CommunicationTemplateKey | null {
    switch (eventType) {
      case EXTERNAL_EVENT_TYPES.APPOINTMENT_SCHEDULED:
      case EXTERNAL_EVENT_TYPES.APPOINTMENT_RESCHEDULED:
        return settings.appointmentRemindersEnabled ? TEMPLATE_KEYS.APPOINTMENT_REMINDER : null;
      case EXTERNAL_EVENT_TYPES.APPOINTMENT_CONFIRMED:
        return settings.appointmentConfirmationsEnabled
          ? TEMPLATE_KEYS.APPOINTMENT_CONFIRMATION
          : null;
      case EXTERNAL_EVENT_TYPES.APPOINTMENT_CANCELLED:
        return settings.appointmentCancellationNoticesEnabled
          ? TEMPLATE_KEYS.APPOINTMENT_CANCELLATION
          : null;
      case EXTERNAL_EVENT_TYPES.RECEIPT_AVAILABLE:
        return settings.receiptNoticesEnabled ? TEMPLATE_KEYS.RECEIPT_AVAILABLE : null;
      case EXTERNAL_EVENT_TYPES.CONSENT_SIGNED:
        return settings.consentConfirmationsEnabled ? TEMPLATE_KEYS.CONSENT_SIGNED : null;
      case EXTERNAL_EVENT_TYPES.DOCUMENT_SHARED:
        return settings.documentShareNoticesEnabled ? TEMPLATE_KEYS.DOCUMENT_SHARED : null;
      case EXTERNAL_EVENT_TYPES.PORTAL_INVITATION:
        return TEMPLATE_KEYS.PORTAL_INVITATION;
      default:
        return null;
    }
  }

  private appointmentStart(payload: Payload): Date | null {
    const raw = text(payload, 'startAt') ?? text(payload, 'scheduledLabel');
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private scheduleFor(
    template: CommunicationTemplateKey,
    startAt: Date | null,
    timezone: string,
    leadMinutes: number,
  ): { scheduledFor: Date; expiresAt: Date } | null {
    const now = new Date();
    if (template === TEMPLATE_KEYS.APPOINTMENT_REMINDER) {
      if (!startAt || startAt <= now) return null;
      const target = Temporal.Instant.from(startAt.toISOString())
        .toZonedDateTimeISO(timezone)
        .subtract({ minutes: leadMinutes })
        .toInstant();
      const scheduledFor = new Date(target.epochMilliseconds);
      return { scheduledFor: scheduledFor > now ? scheduledFor : now, expiresAt: startAt };
    }
    return { scheduledFor: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
  }

  private appointmentLabels(startAt: Date, timezone: string, locale: 'fr' | 'en' | 'ar') {
    const language = locale === 'ar' ? 'ar-TN' : locale === 'fr' ? 'fr-TN' : 'en-GB';
    return {
      date: new Intl.DateTimeFormat(language, { timeZone: timezone, dateStyle: 'long' }).format(
        startAt,
      ),
      time: new Intl.DateTimeFormat(language, {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(startAt),
    };
  }

  private portalPath(template: CommunicationTemplateKey, patientId: string): string | null {
    if (template === TEMPLATE_KEYS.RECEIPT_AVAILABLE) return '/portal/payments';
    if (template === TEMPLATE_KEYS.CONSENT_SIGNED) return `/portal/children/${patientId}`;
    if (template === TEMPLATE_KEYS.DOCUMENT_SHARED) return '/portal/documents';
    return null;
  }
}

export const externalCommunicationProjector = new ExternalCommunicationProjector();
