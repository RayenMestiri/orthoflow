export type CommunicationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';
export type CommunicationJobStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface CommunicationJob {
  id: string;
  eventType: string;
  patientId: string | null;
  appointmentId: string | null;
  recipientType: 'PATIENT' | 'GUARDIAN';
  recipientId: string;
  channel: CommunicationChannel;
  destinationMasked: string;
  templateKey: string;
  status: CommunicationJobStatus;
  scheduledFor: string;
  sentAt: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  retryOfJobId: string | null;
  createdAt: string;
}

export type ProviderStatus = Record<CommunicationChannel, boolean>;
