export const REPORT_PRESETS = {
  THIS_MONTH: 'this-month',
  LAST_MONTH: 'last-month',
  LAST_3_MONTHS: 'last-3-months',
  LAST_6_MONTHS: 'last-6-months',
  THIS_YEAR: 'this-year',
  CUSTOM: 'custom',
} as const;

export type ReportPreset = (typeof REPORT_PRESETS)[keyof typeof REPORT_PRESETS];
export type ReportBucket = 'day' | 'week' | 'month';

export interface ReportPeriodQuery {
  preset?: ReportPreset;
  from?: string;
  to?: string;
}

export interface ReportPeriod {
  preset: ReportPreset;
  timezone: string;
  from: string;
  to: string;
  effectiveTo: string;
  fromDate: string;
  toDate: string;
  comparisonFrom: string | null;
  comparisonTo: string | null;
  bucket: ReportBucket;
}

export interface ResolvedReportPeriod extends ReportPeriod {
  fromInstant: Date;
  toInstant: Date;
  effectiveToInstant: Date;
  comparisonFromInstant: Date | null;
  comparisonToInstant: Date | null;
  toDateExclusive: string;
}

export interface ReportMetric {
  value: number;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
}

export interface ReportSeriesPoint {
  bucket: string;
  value: number;
  denominator?: number;
  rate?: number | null;
}

export interface ReportOverview {
  period: ReportPeriod;
  completedClinicalVisits: ReportMetric;
  uniquePatientsSeen: ReportMetric;
  newPatients: ReportMetric;
  generatedAt: string;
}

export interface AppointmentReports {
  period: ReportPeriod;
  booked: ReportMetric;
  eligible: ReportMetric;
  completed: ReportMetric;
  cancelled: ReportMetric;
  noShow: ReportMetric;
  attended: ReportMetric;
  unresolved: ReportMetric;
  noShowRate: ReportMetric;
  attendanceRate: ReportMetric;
  volumeTrend: ReportSeriesPoint[];
  noShowTrend: ReportSeriesPoint[];
  generatedAt: string;
}

export interface TreatmentRetentionReports {
  period: ReportPeriod;
  treatments: {
    activeNow: number;
    pausedNow: number;
    started: ReportMetric;
    completed: ReportMetric;
    cancelled: ReportMetric;
    startedTrend: ReportSeriesPoint[];
    completedTrend: ReportSeriesPoint[];
  };
  retention: {
    activePlansNow: number;
    activeDevicesNow: number;
    started: ReportMetric;
    completed: ReportMetric;
    replacements: ReportMetric;
  };
  generatedAt: string;
}

export interface FinanceReports {
  period: ReportPeriod;
  currency: string;
  cashRecordedMinor: ReportMetric;
  paymentCount: ReportMetric;
  cancelledPaymentCount: ReportMetric;
  currentSnapshot: {
    outstandingMinor: number;
    outstandingPatientCount: number;
    totalAgreedMinor: number;
    totalRecordedMinor: number;
    collectedPercent: number;
  };
  cashTrend: ReportSeriesPoint[];
  generatedAt: string;
}

export interface CareContinuityReports {
  asOf: string;
  timezone: string;
  needsAttention: number;
  lostToFollowUp: number;
  byCareType: Array<{
    careType: 'TREATMENT' | 'RETENTION';
    needsAttention: number;
    lostToFollowUp: number;
  }>;
  byReason: Array<{ reason: string; count: number }>;
}
