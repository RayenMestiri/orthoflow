import { AUDIT_ACTIONS } from '../audit-logs/audit-log.types.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { financeService, type FinanceService } from '../finance/finance.service.js';
import { followUpService, type FollowUpService } from '../follow-ups/follow-up.service.js';
import {
  careContinuityService,
  type CareContinuityService,
} from '../follow-ups/care-continuity.service.js';
import { receptionService, type ReceptionService } from '../reception/reception.service.js';
import { FLOW_GROUPS, minutesSince } from '../reception/reception.types.js';
import { taskRepository, type TaskRepository } from '../tasks/task.repository.js';
import { dashboardRepository, type DashboardRepository } from './dashboard.repository.js';
import type {
  DashboardAttentionItem,
  DashboardFinanceSection,
  DashboardFollowUpRow,
  DashboardFollowUpsSection,
  DashboardLatePatient,
  DashboardNextPatient,
  DashboardRecentActivityItem,
  DashboardResponse,
  DashboardSetupStatus,
  DashboardTaskItem,
  DashboardTasksSection,
  DashboardTodaySection,
  DashboardWaitingPatient,
} from './dashboard.types.js';

export interface DashboardServiceOptions {
  includeFinance?: boolean;
  includeClinical?: boolean;
}

export class DashboardService {
  constructor(
    private readonly reception: ReceptionService = receptionService,
    private readonly finance: FinanceService = financeService,
    private readonly followUps: FollowUpService = followUpService,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly dashboardRepo: DashboardRepository = dashboardRepository,
    private readonly taskRepo: TaskRepository = taskRepository,
    private readonly careContinuity: CareContinuityService | null = null,
  ) {}

  async getDashboard(
    clinicId: string,
    userId: string = '',
    options: DashboardServiceOptions = { includeFinance: true, includeClinical: true },
    now: Date = new Date(),
  ): Promise<DashboardResponse> {
    // Run all high-level sections concurrently with Promise.allSettled for fault isolation
    const [
      receptionResult,
      financeResult,
      followUpsResult,
      minorsNoGuardianResult,
      recentLogsResult,
      setupResult,
      tasksResult,
      careContinuityResult,
    ] = await Promise.allSettled([
      options.includeClinical ? this.reception.getToday(clinicId, now) : Promise.resolve(null),
      options.includeFinance ? this.finance.getOverview(clinicId, now) : Promise.resolve(null),
      options.includeClinical
        ? this.followUps.list(clinicId, { filter: 'ALL', sort: 'MOST_OVERDUE' }, { page: 1, limit: 6 }, now)
        : Promise.resolve(null),
      this.dashboardRepo.countMinorsWithoutPrimaryGuardian(clinicId),
      this.dashboardRepo.getRecentActivityLogs(clinicId, 8),
      this.checkClinicSetup(clinicId),
      userId
        ? Promise.all([
            this.taskRepo.getSummary(clinicId, userId, now),
            this.taskRepo.list(
              clinicId,
              userId,
              { scope: 'MINE', status: 'ACTIVE' },
              { page: 1, limit: 3, skip: 0 },
              now,
            ),
          ])
        : Promise.resolve(null),
      options.includeClinical && this.careContinuity
        ? this.careContinuity.list(clinicId, {}, { page: 1, limit: 1 }, now)
        : Promise.resolve(null),
    ]);

    // 1. Process Live Clinic / Today Flow
    let today: DashboardTodaySection | null = null;
    if (receptionResult.status === 'fulfilled' && receptionResult.value) {
      const board = receptionResult.value;
      const rows = board.rows ?? [];

      // Extract next patient: First IN_TREATMENT, else WAITING (longest waiting), else UPCOMING (closest startAt)
      let nextPatient: DashboardNextPatient | null = null;
      const inTreatment = rows.find((r) => r.flowGroup === FLOW_GROUPS.IN_TREATMENT);
      const waitingFirst = rows.find((r) => r.flowGroup === FLOW_GROUPS.WAITING);
      const upcomingFirst = rows
        .filter((r) => r.flowGroup === FLOW_GROUPS.UPCOMING)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];

      const candidate = inTreatment ?? waitingFirst ?? upcomingFirst;
      if (candidate) {
        const start = new Date(candidate.startAt);
        const diffMs = start.getTime() - now.getTime();
        const diffMins = Math.round(diffMs / 60_000);
        const isLate = candidate.flowGroup === FLOW_GROUPS.LATE;
        const isNow =
          candidate.flowGroup === FLOW_GROUPS.IN_TREATMENT ||
          candidate.flowGroup === FLOW_GROUPS.WAITING ||
          (diffMins <= 5 && diffMins >= -15);

        nextPatient = {
          appointmentId: candidate.appointmentId,
          patientId: candidate.patientId,
          patientName: candidate.patientName,
          appointmentTypeName: candidate.appointmentTypeName,
          treatmentLabel: candidate.treatmentLabel,
          startAt: candidate.startAt,
          endAt: candidate.endAt,
          status: candidate.status,
          flowGroup: candidate.flowGroup,
          minutesUntilStart: Math.max(0, diffMins),
          isNow,
          isLate,
        };
      }

      // Waiting patients list (up to 4)
      const waitingPatients: DashboardWaitingPatient[] = rows
        .filter((r) => r.flowGroup === FLOW_GROUPS.WAITING)
        .slice(0, 4)
        .map((r) => {
          const waitingAt = r.waitingAt ? new Date(r.waitingAt) : new Date(r.startAt);
          return {
            appointmentId: r.appointmentId,
            patientId: r.patientId,
            patientName: r.patientName,
            appointmentTypeName: r.appointmentTypeName,
            treatmentLabel: r.treatmentLabel,
            waitingAt: waitingAt.toISOString(),
            waitingMinutes: minutesSince(waitingAt, now) ?? 0,
          };
        });

      // Late patients list (up to 3)
      const latePatients: DashboardLatePatient[] = rows
        .filter((r) => r.flowGroup === FLOW_GROUPS.LATE)
        .slice(0, 3)
        .map((r) => ({
          appointmentId: r.appointmentId,
          patientId: r.patientId,
          patientName: r.patientName,
          appointmentTypeName: r.appointmentTypeName,
          startAt: r.startAt,
          lateMinutes: r.lateByMinutes ?? minutesSince(new Date(r.startAt), now) ?? 0,
        }));

      today = {
        date: board.date,
        timezone: board.timezone,
        summary: board.summary
          ? {
              total: board.summary.total ?? 0,
              completed: board.summary.completed ?? 0,
              waiting: board.summary.waiting ?? 0,
              inTreatment: board.summary.inTreatment ?? 0,
              late: board.summary.late ?? 0,
              upcoming: board.summary.upcoming ?? 0,
              closed: (board.summary.noShow ?? 0) + (board.summary.cancelled ?? 0),
            }
          : {
              total: 0,
              completed: 0,
              waiting: 0,
              inTreatment: 0,
              late: 0,
              upcoming: 0,
              closed: 0,
            },
        nextPatient,
        waitingPatients,
        latePatients,
      };
    }

    // 2. Process Financial Pulse
    let finance: DashboardFinanceSection | null = null;
    let financeOverviewRaw = null;
    if (financeResult.status === 'fulfilled' && financeResult.value) {
      const fin = financeResult.value;
      financeOverviewRaw = fin;
      finance = {
        currency: fin.summary.currency,
        receivedTodayMinor: fin.summary.receivedTodayMinor,
        receivedTodayCount: fin.summary.receivedTodayCount,
        receivedMonthMinor: fin.summary.receivedMonthMinor,
        receivedMonthCount: fin.summary.receivedMonthCount,
        outstandingMinor: fin.summary.outstandingMinor,
        outstandingPatientCount: fin.summary.outstandingPatientCount,
        totalAgreedMinor: fin.summary.totalAgreedMinor,
        totalRecordedMinor: fin.summary.totalRecordedMinor,
        collectedPercent: fin.summary.collectedPercent,
      };
    }

    // 3. Process Follow-ups
    let followUps: DashboardFollowUpsSection | null = null;
    let followUpsSummaryRaw = null;
    if (followUpsResult.status === 'fulfilled' && followUpsResult.value) {
      const fu = followUpsResult.value;
      followUpsSummaryRaw = fu.summary;
      // Sort urgent rows: OVERDUE first, then DUE_SOON, then NEEDS_SCHEDULING
      const urgentRows: DashboardFollowUpRow[] = [...(fu.rows ?? [])]
        .filter((r) => r.state === 'OVERDUE' || r.state === 'DUE_SOON' || r.state === 'NEEDS_SCHEDULING')
        .sort((a, b) => {
          if (a.state === 'OVERDUE' && b.state !== 'OVERDUE') return -1;
          if (a.state !== 'OVERDUE' && b.state === 'OVERDUE') return 1;
          return new Date(a.recommendedAt).getTime() - new Date(b.recommendedAt).getTime();
        })
        .slice(0, 4)
        .map((r) => ({
          patient: r.patient,
          treatment: r.treatment ? { id: r.treatment.id, label: r.treatment.label } : null,
          recommendedAt: r.recommendedAt,
          state: r.state,
          daysFromRecommendation: r.daysFromRecommendation,
        }));

      followUps = {
        summary: fu.summary,
        urgentRows,
      };
    }

    // 3b. Process Tasks Section
    let tasks: DashboardTasksSection | null = null;
    let tasksSummaryRaw = null;
    if (tasksResult.status === 'fulfilled' && tasksResult.value) {
      const [summary, paginated] = tasksResult.value;
      tasksSummaryRaw = summary;
      const myTasks: DashboardTaskItem[] = paginated.items.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        priority: t.priority,
        isOverdue:
          (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
          t.dueAt !== null &&
          t.dueAt.getTime() < now.getTime(),
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        patientName: t.context?.labelSnapshot ?? null,
      }));

      tasks = {
        summary: {
          toDo: summary.toDo,
          inProgress: summary.inProgress,
          overdue: summary.overdue,
          urgent: summary.urgent,
        },
        myTasks,
      };
    }

    // 4. Construct Deterministic Attention Items
    const attention: DashboardAttentionItem[] = [];

    // Attention A: Overdue Follow-ups
    if (followUpsSummaryRaw && followUpsSummaryRaw.overdue > 0) {
      attention.push({
        id: 'overdue_followups',
        level: 'WARNING',
        title: `${followUpsSummaryRaw.overdue} rappel${followUpsSummaryRaw.overdue > 1 ? 's' : ''} en retard`,
        description: 'Des patients nécessitent la planification de leur prochaine étape de soin.',
        count: followUpsSummaryRaw.overdue,
        actionRoute: ['/app/follow-ups'],
        actionQueryParams: { filter: 'OVERDUE' },
        actionLabel: 'Traiter les suivis',
      });
    }

    if (careContinuityResult.status === 'fulfilled' && careContinuityResult.value) {
      const continuityCount =
        careContinuityResult.value.summary.needsAttention +
        careContinuityResult.value.summary.lostToFollowUp;
      if (continuityCount > 0) {
        attention.push({
          id: 'care_continuity',
          level:
            careContinuityResult.value.summary.lostToFollowUp > 0 ? 'CRITICAL' : 'WARNING',
          title: `${continuityCount} patient${continuityCount > 1 ? 's' : ''} sans continuité de soin`,
          description: 'Traitement actif ou contention sans prochain rendez-vous approprié.',
          count: continuityCount,
          actionRoute: ['/app/follow-ups'],
          actionQueryParams: { tab: 'attention' },
          actionLabel: 'Voir les patients',
        });
      }
    }

    // Attention B: Treatments with no payment recorded
    if (financeOverviewRaw && financeOverviewRaw.attention?.noPaymentCount > 0) {
      attention.push({
        id: 'no_payment_treatments',
        level: 'INFO',
        title: `${financeOverviewRaw.attention.noPaymentCount} traitement${financeOverviewRaw.attention.noPaymentCount > 1 ? 's' : ''} sans acompte`,
        description: 'Traitements actifs pour lesquels aucun versement physique n’a encore été enregistré.',
        count: financeOverviewRaw.attention.noPaymentCount,
        actionRoute: ['/app/finance'],
        actionQueryParams: { tab: 'balances', filter: 'NO_PAYMENT' },
        actionLabel: 'Voir les soldes',
      });
    }

    // Attention C: Cancelled payments without correction
    if (financeOverviewRaw && financeOverviewRaw.attention?.cancelledUncorrectedCount > 0) {
      attention.push({
        id: 'cancelled_uncorrected',
        level: 'WARNING',
        title: `${financeOverviewRaw.attention.cancelledUncorrectedCount} reçu${financeOverviewRaw.attention.cancelledUncorrectedCount > 1 ? 's' : ''} annulé${financeOverviewRaw.attention.cancelledUncorrectedCount > 1 ? 's' : ''} non corrigé${financeOverviewRaw.attention.cancelledUncorrectedCount > 1 ? 's' : ''}`,
        description: 'Paiements annulés nécessitant une régularisation ou une réémission.',
        count: financeOverviewRaw.attention.cancelledUncorrectedCount,
        actionRoute: ['/app/finance'],
        actionQueryParams: { tab: 'cancelled' },
        actionLabel: 'Vérifier les annulations',
      });
    }

    // Attention D: Minors without primary guardian
    if (minorsNoGuardianResult.status === 'fulfilled' && minorsNoGuardianResult.value > 0) {
      attention.push({
        id: 'minors_no_guardian',
        level: 'WARNING',
        title: `${minorsNoGuardianResult.value} patient${minorsNoGuardianResult.value > 1 ? 's' : ''} mineur${minorsNoGuardianResult.value > 1 ? 's' : ''} sans tuteur`,
        description: 'Patients de moins de 18 ans sans contact responsable identifié.',
        count: minorsNoGuardianResult.value,
        actionRoute: ['/app/patients'],
        actionLabel: 'Consulter la liste',
      });
    }

    // Attention E: Overdue tasks
    if (tasksSummaryRaw && tasksSummaryRaw.overdue > 0) {
      attention.push({
        id: 'overdue_tasks',
        level: 'WARNING',
        title: `${tasksSummaryRaw.overdue} tâche${tasksSummaryRaw.overdue > 1 ? 's' : ''} en retard`,
        description: 'Des actions internes assignées ont dépassé leur date d’échéance.',
        count: tasksSummaryRaw.overdue,
        actionRoute: ['/app/tasks'],
        actionQueryParams: { status: 'OVERDUE' },
        actionLabel: 'Voir mes tâches',
      });
    }

    // 5. Recent Activity
    let recentActivity: DashboardRecentActivityItem[] = [];
    if (recentLogsResult.status === 'fulfilled' && recentLogsResult.value) {
      recentActivity = recentLogsResult.value.map((log) => {
        let type: DashboardRecentActivityItem['type'] = 'PATIENT_CREATED';
        let title = 'Activité enregistrée';
        const subtitle = log.patientName
          ? `${log.patientName} · ${log.actorName}`
          : log.actorName;

        switch (log.action) {
          case AUDIT_ACTIONS.CASH_RECORD_CREATED:
            type = 'PAYMENT_RECORDED';
            title = 'Paiement encaissé';
            break;
          case AUDIT_ACTIONS.CASH_RECORD_CANCELLED:
            type = 'PAYMENT_CANCELLED';
            title = 'Paiement annulé';
            break;
          case AUDIT_ACTIONS.CLINICAL_VISIT_COMPLETED:
            type = 'CLINICAL_VISIT_COMPLETED';
            title = 'Consultation terminée';
            break;
          case AUDIT_ACTIONS.APPOINTMENT_CREATED:
          case AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED:
            type = 'APPOINTMENT_SCHEDULED';
            title = 'Rendez-vous planifié';
            break;
          case AUDIT_ACTIONS.APPOINTMENT_CANCELLED:
            type = 'APPOINTMENT_CANCELLED';
            title = 'Rendez-vous annulé';
            break;
          case AUDIT_ACTIONS.PATIENT_CREATED:
            type = 'PATIENT_CREATED';
            title = 'Nouveau patient créé';
            break;
          case AUDIT_ACTIONS.PATIENT_MEDIA_UPLOADED:
            type = 'DOCUMENT_UPLOADED';
            title = 'Document / Média ajouté';
            break;
        }

        return {
          id: log._id,
          type,
          title,
          subtitle,
          actorName: log.actorName,
          timestamp: new Date(log.createdAt).toISOString(),
          patientId: log.patientId,
          patientName: log.patientName,
          amountMinor:
            typeof log.metadata?.amountMinor === 'number' ? log.metadata.amountMinor : undefined,
          currency:
            typeof log.metadata?.currency === 'string' ? log.metadata.currency : undefined,
        };
      });
    }

    // 6. Clinic Setup Status
    const setup: DashboardSetupStatus =
      setupResult.status === 'fulfilled'
        ? setupResult.value
        : { isComplete: true, remainingCount: 0, pendingItems: [] };

    return {
      today,
      finance,
      followUps,
      tasks,
      attention,
      recentActivity,
      setup,
      generatedAt: now.toISOString(),
    };
  }

  private async checkClinicSetup(clinicId: string): Promise<DashboardSetupStatus> {
    const pendingItems: string[] = [];

    try {
      const [clinic, counts] = await Promise.all([
        this.clinics.findById(clinicId),
        this.dashboardRepo.getClinicSetupCounts(clinicId),
      ]);

      if (!clinic?.phone && !clinic?.address?.city) {
        pendingItems.push('Coordonnées du cabinet');
      }
      if (counts.appointmentTypesCount === 0) {
        pendingItems.push('Types de rendez-vous');
      }
      if (counts.membersCount <= 1) {
        pendingItems.push('Invitations des praticiens & assistantes');
      }
    } catch {
      // Graceful fallback
    }

    return {
      isComplete: pendingItems.length === 0,
      remainingCount: pendingItems.length,
      pendingItems,
    };
  }
}

export const dashboardService = new DashboardService(
  receptionService,
  financeService,
  followUpService,
  clinicRepository,
  dashboardRepository,
  taskRepository,
  careContinuityService,
);
