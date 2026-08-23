import type { Types } from 'mongoose';

export const CLINICAL_VISIT_STATUSES = { DRAFT: 'DRAFT', COMPLETED: 'COMPLETED' } as const;
export type ClinicalVisitStatus =
  (typeof CLINICAL_VISIT_STATUSES)[keyof typeof CLINICAL_VISIT_STATUSES];
export const CLINICAL_VISIT_STATUS_VALUES = Object.values(CLINICAL_VISIT_STATUSES) as [
  ClinicalVisitStatus,
  ...ClinicalVisitStatus[],
];

export const CLINICAL_REASON_CODES = {
  CONSULTATION: 'CONSULTATION',
  ROUTINE_ADJUSTMENT: 'ROUTINE_ADJUSTMENT',
  EMERGENCY: 'EMERGENCY',
  APPLIANCE_DELIVERY: 'APPLIANCE_DELIVERY',
  RETENTION_CHECK: 'RETENTION_CHECK',
  OTHER: 'OTHER',
} as const;
export type ClinicalReasonCode =
  (typeof CLINICAL_REASON_CODES)[keyof typeof CLINICAL_REASON_CODES];
export const CLINICAL_REASON_CODE_VALUES = Object.values(CLINICAL_REASON_CODES) as [
  ClinicalReasonCode,
  ...ClinicalReasonCode[],
];

export const CLINICAL_PROCEDURES = {
  EXAMINATION: 'EXAMINATION',
  PHOTOGRAPHS: 'PHOTOGRAPHS',
  SCAN_OR_IMPRESSION: 'SCAN_OR_IMPRESSION',
  WIRE_CHANGE: 'WIRE_CHANGE',
  ARCHWIRE_ADJUSTMENT: 'ARCHWIRE_ADJUSTMENT',
  BRACKET_REPAIR: 'BRACKET_REPAIR',
  ELASTICS_INSTRUCTION: 'ELASTICS_INSTRUCTION',
  APPLIANCE_FITTING: 'APPLIANCE_FITTING',
  APPLIANCE_REMOVAL: 'APPLIANCE_REMOVAL',
  RETAINER_CHECK: 'RETAINER_CHECK',
  OTHER: 'OTHER',
} as const;
export type ClinicalProcedure =
  (typeof CLINICAL_PROCEDURES)[keyof typeof CLINICAL_PROCEDURES];
export const CLINICAL_PROCEDURE_VALUES = Object.values(CLINICAL_PROCEDURES) as [
  ClinicalProcedure,
  ...ClinicalProcedure[],
];

export interface ClinicalVisitAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  appointmentId: Types.ObjectId;
  treatmentId: Types.ObjectId | null;
  retentionPlanId?: Types.ObjectId | null;
  status: ClinicalVisitStatus;
  reasonCode: ClinicalReasonCode | null;
  reasonOther: string | null;
  observations: string | null;
  procedures: ClinicalProcedure[];
  procedureDetails: string | null;
  patientInstructions: string | null;
  doctorNote: string | null;
  nextVisitRecommendedAt: Date | null;
  nextStepNote: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ClinicalVisitRecord = ClinicalVisitAttributes & { _id: Types.ObjectId };

export interface ClinicalVisitWriteFields {
  treatmentId?: string | null;
  retentionPlanId?: string | null;
  reasonCode?: ClinicalReasonCode | null;
  reasonOther?: string | null;
  observations?: string | null;
  procedures?: ClinicalProcedure[];
  procedureDetails?: string | null;
  patientInstructions?: string | null;
  doctorNote?: string | null;
  nextVisitRecommendedAt?: Date | null;
  nextStepNote?: string | null;
}

export interface ClinicalVisitDto {
  id: string;
  clinicId: string;
  patientId: string;
  appointmentId: string;
  treatmentId: string | null;
  retentionPlanId: string | null;
  status: ClinicalVisitStatus;
  reasonCode: ClinicalReasonCode | null;
  reasonOther: string | null;
  observations: string | null;
  procedures: ClinicalProcedure[];
  procedureDetails: string | null;
  patientInstructions: string | null;
  doctorNote: string | null;
  nextVisitRecommendedAt: string | null;
  nextStepNote: string | null;
  startedAt: string;
  completedAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  context: {
    patient: { id: string; fullName: string };
    appointment: { id: string; startAt: string; endAt: string; status: string };
    treatment: { id: string; label: string; status: string } | null;
    retention: { id: string; status: string } | null;
    previousVisit: ClinicalVisitSummaryDto | null;
  };
}

export interface ClinicalVisitSummaryDto {
  id: string;
  appointmentId: string;
  treatmentId: string | null;
  retentionPlanId: string | null;
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
