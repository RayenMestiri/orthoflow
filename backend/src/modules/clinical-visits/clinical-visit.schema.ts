import { z } from 'zod';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
} from '../../common/validation/common.schemas.js';
import {
  CLINICAL_PROCEDURE_VALUES,
  CLINICAL_REASON_CODE_VALUES,
  CLINICAL_VISIT_STATUS_VALUES,
} from './clinical-visit.types.js';

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const writeFields = {
  treatmentId: objectIdSchema.nullable().optional(),
  retentionPlanId: objectIdSchema.nullable().optional(),
  reasonCode: z.enum(CLINICAL_REASON_CODE_VALUES).nullable().optional(),
  reasonOther: nullableText(160).optional(),
  observations: nullableText(5000).optional(),
  procedures: z.array(z.enum(CLINICAL_PROCEDURE_VALUES)).max(20).optional(),
  procedureDetails: nullableText(5000).optional(),
  patientInstructions: nullableText(3000).optional(),
  doctorNote: nullableText(5000).optional(),
  nextVisitRecommendedAt: isoDateTimeSchema.nullable().optional(),
  nextStepNote: nullableText(1000).optional(),
};

export const clinicalVisitWriteBodySchema = z
  .object(writeFields)
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');
export const completeClinicalVisitBodySchema = z.object(writeFields);

const summarySchema = z.object({
  id: objectIdSchema,
  appointmentId: objectIdSchema,
  treatmentId: objectIdSchema.nullable(),
  retentionPlanId: objectIdSchema.nullable(),
  status: z.enum(CLINICAL_VISIT_STATUS_VALUES),
  reasonCode: z.enum(CLINICAL_REASON_CODE_VALUES).nullable(),
  reasonOther: z.string().nullable(),
  procedures: z.array(z.enum(CLINICAL_PROCEDURE_VALUES)),
  patientInstructions: z.string().nullable(),
  nextVisitRecommendedAt: z.string().nullable(),
  nextStepNote: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  clinicianName: z.string(),
});

export const clinicalVisitDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  appointmentId: objectIdSchema,
  treatmentId: objectIdSchema.nullable(),
  retentionPlanId: objectIdSchema.nullable(),
  status: z.enum(CLINICAL_VISIT_STATUS_VALUES),
  reasonCode: z.enum(CLINICAL_REASON_CODE_VALUES).nullable(),
  reasonOther: z.string().nullable(),
  observations: z.string().nullable(),
  procedures: z.array(z.enum(CLINICAL_PROCEDURE_VALUES)),
  procedureDetails: z.string().nullable(),
  patientInstructions: z.string().nullable(),
  doctorNote: z.string().nullable(),
  nextVisitRecommendedAt: z.string().nullable(),
  nextStepNote: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdBy: objectIdSchema,
  updatedBy: objectIdSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  context: z.object({
    patient: z.object({ id: objectIdSchema, fullName: z.string() }),
    appointment: z.object({
      id: objectIdSchema,
      startAt: z.string(),
      endAt: z.string(),
      status: z.string(),
    }),
    treatment: z
      .object({ id: objectIdSchema, label: z.string(), status: z.string() })
      .nullable(),
    retention: z.object({ id: objectIdSchema, status: z.string() }).nullable(),
    previousVisit: summarySchema.nullable(),
  }),
});

export const clinicalVisitSummaryDtoSchema = summarySchema;
export const visitIdParamSchema = z.object({ visitId: objectIdSchema });
export const appointmentVisitParamSchema = z.object({ appointmentId: objectIdSchema });
export const patientVisitParamSchema = z.object({ patientId: objectIdSchema });
export const patientVisitsQuerySchema = paginationQuerySchema;

export type ClinicalVisitWriteBody = z.infer<typeof clinicalVisitWriteBodySchema>;
export type CompleteClinicalVisitBody = z.infer<typeof completeClinicalVisitBodySchema>;
export type VisitIdParam = z.infer<typeof visitIdParamSchema>;
export type AppointmentVisitParam = z.infer<typeof appointmentVisitParamSchema>;
export type PatientVisitParam = z.infer<typeof patientVisitParamSchema>;
export type PatientVisitsQuery = z.infer<typeof patientVisitsQuerySchema>;
