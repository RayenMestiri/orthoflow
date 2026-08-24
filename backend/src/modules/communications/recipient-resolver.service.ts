import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { z } from 'zod';
import type { ClinicRecord } from '../clinics/clinic.types.js';
import type { GuardianRecord } from '../guardians/guardian.types.js';
import { guardianRepository, type GuardianRepository } from '../guardians/guardian.repository.js';
import {
  patientGuardianRepository,
  type PatientGuardianRepository,
} from '../guardians/patient-guardian.repository.js';
import type { PatientRecord } from '../patients/patient.types.js';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_RECIPIENT_TYPES,
  type CommunicationChannel,
  type CommunicationRecipientType,
} from './communication.types.js';

export interface ResolvedRecipient {
  recipientType: CommunicationRecipientType;
  recipientId: string;
  firstName: string;
  channel: CommunicationChannel;
  destination: string;
  destinationMasked: string;
}

const email = z.email();
const maskEmail = (value: string) => {
  const [local = '', domain = ''] = value.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};
const maskPhone = (value: string) =>
  `${value.slice(0, Math.max(0, value.length - 4)).replace(/\d/g, '•')}${value.slice(-4)}`;
const ageAt = (birthDate: Date, at: Date) => {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  if (
    at.getUTCMonth() < birthDate.getUTCMonth() ||
    (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() < birthDate.getUTCDate())
  )
    age -= 1;
  return age;
};

export class RecipientResolverService {
  constructor(
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly relationships: PatientGuardianRepository = patientGuardianRepository,
  ) {}

  async resolve(
    clinic: ClinicRecord,
    patient: PatientRecord,
    at: Date,
    explicitGuardianId?: string | null,
    allowExplicitWithoutAuthorization = false,
  ): Promise<ResolvedRecipient | null> {
    let recipient: PatientRecord | GuardianRecord = patient;
    let recipientType: CommunicationRecipientType = COMMUNICATION_RECIPIENT_TYPES.PATIENT;
    let preference: 'PHONE' | 'EMAIL' | 'NO_PREFERENCE' = 'NO_PREFERENCE';

    const relationships = await this.relationships.listByPatient(
      patient._id.toString(),
      clinic._id.toString(),
    );
    const minor = patient.birthDate ? ageAt(patient.birthDate, at) < 18 : relationships.length > 0;
    const relation = explicitGuardianId
      ? relationships.find((item) => item.guardianId.toString() === explicitGuardianId)
      : relationships.find((item) => item.isPrimary && item.communicationAuthorized);

    if (explicitGuardianId || minor) {
      if (!relation || (!relation.communicationAuthorized && !allowExplicitWithoutAuthorization)) {
        return null;
      }
      const guardian = await this.guardians.findByIdInClinic(
        relation.guardianId.toString(),
        clinic._id.toString(),
      );
      if (!guardian) return null;
      recipient = guardian;
      recipientType = COMMUNICATION_RECIPIENT_TYPES.GUARDIAN;
      preference = relation.contactPreference;
    }

    const communications = clinic.settings?.communications;
    const channels = communications?.channelPriority ?? ['EMAIL'];
    const permitted = channels.filter((channel) =>
      preference === 'EMAIL'
        ? channel === 'EMAIL'
        : preference === 'PHONE'
          ? channel !== 'EMAIL'
          : true,
    );
    for (const channel of permitted) {
      if (
        channel === COMMUNICATION_CHANNELS.EMAIL &&
        recipient.email &&
        email.safeParse(recipient.email).success
      ) {
        return {
          recipientType,
          recipientId: recipient._id.toString(),
          firstName: recipient.firstName,
          channel,
          destination: recipient.email.toLowerCase(),
          destinationMasked: maskEmail(recipient.email),
        };
      }
      if (
        channel !== COMMUNICATION_CHANNELS.EMAIL &&
        recipient.phone &&
        communications?.defaultPhoneRegion
      ) {
        const parsed = parsePhoneNumberFromString(
          recipient.phone,
          communications.defaultPhoneRegion as CountryCode,
        );
        if (parsed?.isValid())
          return {
            recipientType,
            recipientId: recipient._id.toString(),
            firstName: recipient.firstName,
            channel,
            destination: parsed.number,
            destinationMasked: maskPhone(parsed.number),
          };
      }
    }
    return null;
  }
}

export const recipientResolverService = new RecipientResolverService();
