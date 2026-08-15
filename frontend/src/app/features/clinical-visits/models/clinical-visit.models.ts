export type ClinicalVisitStatus = 'DRAFT' | 'COMPLETED';
export type ClinicalReasonCode =
  | 'CONSULTATION'
  | 'ROUTINE_ADJUSTMENT'
  | 'EMERGENCY'
  | 'APPLIANCE_DELIVERY'
  | 'RETENTION_CHECK'
  | 'OTHER';
export type ClinicalProcedure =
  | 'EXAMINATION'
  | 'PHOTOGRAPHS'
  | 'SCAN_OR_IMPRESSION'
  | 'WIRE_CHANGE'
  | 'ARCHWIRE_ADJUSTMENT'
  | 'BRACKET_REPAIR'
  | 'ELASTICS_INSTRUCTION'
  | 'APPLIANCE_FITTING'
  | 'APPLIANCE_REMOVAL'
  | 'RETAINER_CHECK'
  | 'OTHER';

export const CLINICAL_REASONS: readonly ClinicalReasonCode[] = [
  'CONSULTATION',
  'ROUTINE_ADJUSTMENT',
  'EMERGENCY',
  'APPLIANCE_DELIVERY',
  'RETENTION_CHECK',
  'OTHER',
];
export const CLINICAL_PROCEDURES: readonly ClinicalProcedure[] = [
  'EXAMINATION',
  'PHOTOGRAPHS',
  'SCAN_OR_IMPRESSION',
  'WIRE_CHANGE',
  'ARCHWIRE_ADJUSTMENT',
  'BRACKET_REPAIR',
  'ELASTICS_INSTRUCTION',
  'APPLIANCE_FITTING',
  'APPLIANCE_REMOVAL',
  'RETAINER_CHECK',
  'OTHER',
];

export interface ClinicalVisitSummary {
  id: string;
  appointmentId: string;
  treatmentId: string | null;
  status: ClinicalVisitStatus;
  reasonCode: ClinicalReasonCode | null;
  reasonOther: string | null;
  procedures: ClinicalProcedure[];
  patientInstructions: string | null;
  nextVisitRecommendedAt: string | null;
  nextStepNote: string | null;
  startedAt: string;
  completedAt: string | null;
  clinicianName: string;
}

export interface ClinicalVisit extends Omit<ClinicalVisitSummary, 'clinicianName'> {
  clinicId: string;
  patientId: string;
  observations: string | null;
  procedureDetails: string | null;
  doctorNote: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  context: {
    patient: { id: string; fullName: string };
    appointment: { id: string; startAt: string; endAt: string; status: string };
    treatment: { id: string; label: string; status: string } | null;
    previousVisit: ClinicalVisitSummary | null;
  };
}

export interface ClinicalVisitInput {
  treatmentId?: string | null;
  reasonCode?: ClinicalReasonCode | null;
  reasonOther?: string | null;
  observations?: string | null;
  procedures?: ClinicalProcedure[];
  procedureDetails?: string | null;
  patientInstructions?: string | null;
  doctorNote?: string | null;
  nextVisitRecommendedAt?: string | null;
  nextStepNote?: string | null;
}

export function clinicalLabel(value: string | null): string {
  if (!value) return 'Not recorded';
  const normalized = value.toLowerCase().replaceAll('_', ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
