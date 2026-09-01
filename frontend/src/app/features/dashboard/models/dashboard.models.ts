export interface DashboardNextPatient {
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentTypeName: string;
  treatmentLabel: string | null;
  startAt: string;
  endAt: string;
  status: string;
  flowGroup: string;
  minutesUntilStart: number;
  isNow: boolean;
  isLate: boolean;
}

export interface DashboardWaitingPatient {
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentTypeName: string;
  treatmentLabel: string | null;
  waitingAt: string;
  waitingMinutes: number;
}

export interface DashboardLatePatient {
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentTypeName: string;
  startAt: string;
  lateMinutes: number;
}

export interface DashboardToday {
  date: string;
  timezone: string;
  summary: {
    total: number;
    completed: number;
    waiting: number;
    inTreatment: number;
    late: number;
    upcoming: number;
    closed: number;
  };
  nextPatient: DashboardNextPatient | null;
  waitingPatients: DashboardWaitingPatient[];
  latePatients: DashboardLatePatient[];
}

export interface DashboardFinance {
  currency: string;
  receivedTodayMinor: number;
  receivedTodayCount: number;
  receivedMonthMinor: number;
  receivedMonthCount: number;
  outstandingMinor: number;
  outstandingPatientCount: number;
  totalAgreedMinor: number;
  totalRecordedMinor: number;
  collectedPercent: number;
}

export interface DashboardFollowUpRow {
  patient: {
    id: string;
    fullName: string;
    phone: string | null;
  };
  treatment: {
    id: string;
    label: string;
  } | null;
  recommendedAt: string;
  state: 'OVERDUE' | 'DUE_SOON' | 'NEEDS_SCHEDULING' | 'SCHEDULED';
  daysFromRecommendation: number;
}

export interface DashboardFollowUps {
  summary: {
    needsScheduling: number;
    overdue: number;
    scheduled: number;
  };
  urgentRows: DashboardFollowUpRow[];
}

export interface DashboardAttentionItem {
  id: string;
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  count: number;
  actionRoute: string[];
  actionQueryParams?: Record<string, string>;
  actionLabel: string;
}

export interface DashboardRecentActivityItem {
  id: string;
  type:
    | 'PAYMENT_RECORDED'
    | 'PAYMENT_CANCELLED'
    | 'CLINICAL_VISIT_COMPLETED'
    | 'APPOINTMENT_SCHEDULED'
    | 'APPOINTMENT_CANCELLED'
    | 'DOCUMENT_UPLOADED'
    | 'PATIENT_CREATED';
  title: string;
  subtitle: string;
  actorName: string;
  timestamp: string;
  patientId?: string;
  patientName?: string;
  amountMinor?: number;
  currency?: string;
}

export interface DashboardTaskItem {
  id: string;
  title: string;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  isOverdue: boolean;
  dueAt: string | null;
  patientName: string | null;
  patientId: string | null;
}

export interface DashboardTasksSection {
  summary: {
    toDo: number;
    inProgress: number;
    overdue: number;
    urgent: number;
    completedToday: number;
  };
  topTasks: DashboardTaskItem[];
  myTasks?: DashboardTaskItem[];
}

export interface DashboardSetupStatus {
  isComplete: boolean;
  remainingCount: number;
  pendingItems: string[];
}

export interface DashboardData {
  today: DashboardToday | null;
  finance: DashboardFinance | null;
  followUps: DashboardFollowUps | null;
  tasks: DashboardTasksSection | null;
  attention: DashboardAttentionItem[];
  recentActivity: DashboardRecentActivityItem[];
  setup: DashboardSetupStatus;
  generatedAt: string;
}
