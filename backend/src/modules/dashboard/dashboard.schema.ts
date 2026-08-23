import { z } from 'zod';

export const dashboardResponseSchema = z.object({
  today: z
    .object({
      date: z.string(),
      timezone: z.string(),
      summary: z.object({
        total: z.number(),
        completed: z.number(),
        waiting: z.number(),
        inTreatment: z.number(),
        late: z.number(),
        upcoming: z.number(),
        closed: z.number(),
      }),
      nextPatient: z
        .object({
          appointmentId: z.string(),
          patientId: z.string(),
          patientName: z.string(),
          appointmentTypeName: z.string(),
          treatmentLabel: z.string().nullable(),
          startAt: z.string(),
          endAt: z.string(),
          status: z.string(),
          flowGroup: z.string(),
          minutesUntilStart: z.number(),
          isNow: z.boolean(),
          isLate: z.boolean(),
        })
        .nullable(),
      waitingPatients: z.array(
        z.object({
          appointmentId: z.string(),
          patientId: z.string(),
          patientName: z.string(),
          appointmentTypeName: z.string(),
          treatmentLabel: z.string().nullable(),
          waitingAt: z.string(),
          waitingMinutes: z.number(),
        }),
      ),
      latePatients: z.array(
        z.object({
          appointmentId: z.string(),
          patientId: z.string(),
          patientName: z.string(),
          appointmentTypeName: z.string(),
          startAt: z.string(),
          lateMinutes: z.number(),
        }),
      ),
    })
    .nullable(),
  finance: z
    .object({
      currency: z.string(),
      receivedTodayMinor: z.number(),
      receivedTodayCount: z.number(),
      receivedMonthMinor: z.number(),
      receivedMonthCount: z.number(),
      outstandingMinor: z.number(),
      outstandingPatientCount: z.number(),
      totalAgreedMinor: z.number(),
      totalRecordedMinor: z.number(),
      collectedPercent: z.number(),
    })
    .nullable(),
  followUps: z
    .object({
      summary: z.object({
        needsScheduling: z.number(),
        overdue: z.number(),
        scheduled: z.number(),
      }),
      urgentRows: z.array(
        z.object({
          patient: z.object({
            id: z.string(),
            fullName: z.string(),
            phone: z.string().nullable(),
          }),
          treatment: z
            .object({
              id: z.string(),
              label: z.string(),
            })
            .nullable(),
          recommendedAt: z.string(),
          state: z.string(),
          daysFromRecommendation: z.number(),
        }),
      ),
    })
    .nullable(),
  tasks: z
    .object({
      summary: z.object({
        toDo: z.number(),
        inProgress: z.number(),
        overdue: z.number(),
        urgent: z.number(),
      }),
      myTasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          priority: z.enum(['NORMAL', 'HIGH', 'URGENT']),
          isOverdue: z.boolean(),
          dueAt: z.string().nullable(),
          patientName: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  attention: z.array(
    z.object({
      id: z.string(),
      level: z.enum(['CRITICAL', 'WARNING', 'INFO']),
      title: z.string(),
      description: z.string(),
      count: z.number(),
      actionRoute: z.array(z.string()),
      actionQueryParams: z.record(z.string(), z.string()).optional(),
      actionLabel: z.string(),
    }),
  ),
  recentActivity: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        'PAYMENT_RECORDED',
        'PAYMENT_CANCELLED',
        'CLINICAL_VISIT_COMPLETED',
        'APPOINTMENT_SCHEDULED',
        'APPOINTMENT_CANCELLED',
        'DOCUMENT_UPLOADED',
        'PATIENT_CREATED',
      ]),
      title: z.string(),
      subtitle: z.string(),
      actorName: z.string(),
      timestamp: z.string(),
      patientId: z.string().optional(),
      patientName: z.string().optional(),
      amountMinor: z.number().optional(),
      currency: z.string().optional(),
    }),
  ),
  setup: z.object({
    isComplete: z.boolean(),
    remainingCount: z.number(),
    pendingItems: z.array(z.string()),
  }),
  generatedAt: z.string(),
});
