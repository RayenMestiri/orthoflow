export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_COMPLETED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_NO_SHOW'
  | 'CONSENT_SIGNED'
  | 'GENERATED_DOCUMENT_READY'
  | 'CARE_CONTINUITY_ATTENTION';

export type NotificationPriority = 'NORMAL' | 'IMPORTANT';
export type NotificationTarget =
  'TASK' | 'APPOINTMENT' | 'PATIENT_CONSENTS' | 'PATIENT_DOCUMENTS' | 'CARE_CONTINUITY';

export interface NotificationContext {
  target: NotificationTarget;
  patientId: string | null;
  taskId: string | null;
  appointmentId: string | null;
  consentId: string | null;
  documentId: string | null;
  treatmentId: string | null;
  retentionPlanId: string | null;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  context: NotificationContext;
  occurredAt: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export type NotificationFilter = 'ALL' | 'UNREAD';
