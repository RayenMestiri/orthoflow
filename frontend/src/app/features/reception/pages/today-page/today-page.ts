import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { ReceptionStore } from '../../data-access/reception.store';
import {
  FLOW_SECTIONS,
  STATUS_LABELS,
  actorLine,
  activityCancellationReason,
  activityLabel,
  canMarkNoShow,
  formatDuration,
  minutesSince,
  primaryAction,
  type AppointmentActivity,
  type ReceptionRow,
  type RowAction,
} from '../../models/reception.models';

/**
 * Today's clinic flow — the reception workspace.
 *
 * NOT a second calendar. The Schedule owns the grid and the booking; this page
 * answers the questions a front desk asks between 08:00 and 18:00: who is here,
 * who is waiting and for how long, who is with the doctor, who is late, who is
 * next. Rows are a queue, ordered by what needs attention rather than by clock
 * position.
 */
@Component({
  selector: 'app-today-page',
  imports: [DatePipe, ReactiveFormsModule],
  providers: [ReceptionStore],
  templateUrl: './today-page.html',
  styleUrl: './today-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayPage {
  protected readonly store = inject(ReceptionStore);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);

  protected readonly sections = FLOW_SECTIONS;
  protected readonly statusLabels = STATUS_LABELS;

  /**
   * Clinical transitions stay with clinicians; the desk checks people in.
   *
   * These only decide what is worth offering. The server refuses the transition
   * regardless of what this page chooses to render.
   */
  protected readonly canStartVisit = this.permissions.can(PERMISSIONS.APPOINTMENTS_START_VISIT);
  protected readonly canCompleteVisit = this.permissions.can(
    PERMISSIONS.APPOINTMENTS_COMPLETE_VISIT,
  );
  protected readonly canCancel = this.permissions.can(PERMISSIONS.APPOINTMENTS_CANCEL);
  protected readonly canUpdate = this.permissions.can(PERMISSIONS.APPOINTMENTS_UPDATE);

  private readonly selectedAppointmentId = signal<string | null>(null);
  /** Keeps the drawer open while polling replaces the row with fresher data. */
  protected readonly selected = computed(() => {
    const appointmentId = this.selectedAppointmentId();
    return appointmentId
      ? (this.store.rows().find((row) => row.appointmentId === appointmentId) ?? null)
      : null;
  });
  protected readonly cancelTarget = signal<ReceptionRow | null>(null);
  protected readonly cancelReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });

  /** Sections that currently have rows, so empty headings never render. */
  protected readonly visibleSections = computed(() => {
    const grouped = this.store.byGroup();
    return this.sections
      .map((section) => ({ ...section, rows: grouped[section.group] }))
      .filter((section) => section.rows.length > 0);
  });

  protected readonly nextPatient = this.store.nextPatient;

  /** Minutes until the next patient is due; negative means already due. */
  protected readonly nextInMinutes = computed(() => {
    const next = this.nextPatient();
    if (!next) return null;
    return Math.round((new Date(next.startAt).getTime() - this.store.now()) / 60_000);
  });

  /** Smart clinical day briefing tailored to the clinic's real-time flow. */
  protected readonly smartBriefing = computed<{
    tone: 'celebration' | 'active' | 'warning' | 'calm';
    eyebrow: string;
    title: string;
    message: string;
    icon: string;
    metricLabel?: string;
    metricValue?: string;
  } | null>(() => {
    const summary = this.store.summary();
    if (!summary || !this.store.isLoaded()) return null;

    // 1. All completed today (e.g. 1/1 completed, 0 waiting, 0 upcoming)
    if (
      summary.total > 0 &&
      summary.completed === summary.total &&
      summary.waiting === 0 &&
      summary.upcoming === 0 &&
      summary.inTreatment === 0
    ) {
      return {
        tone: 'celebration',
        eyebrow: 'Excellence clinique · Clôture du jour',
        title: summary.total === 1 ? 'Excellente journée · Consultation honorée et finalisée' : 'Journée accomplie avec succès · 100% de complétion',
        message: 'Flux clinique parfait aujourd\'hui : tous les rendez-vous ont été pris en charge avec précision et clôturés à l\'heure. Bravo à toute l\'équipe !',
        icon: 'verified',
        metricLabel: 'Complétion',
        metricValue: '100%',
      };
    }

    // 2. Critical: late arrivals
    if (summary.late > 0) {
      return {
        tone: 'warning',
        eyebrow: 'Coordination d\'accueil · Vigilance horaire',
        title: `${summary.late} patient${summary.late > 1 ? 's' : ''} en retard sur l'horaire`,
        message: 'Surveillez les arrivées à l\'accueil pour réadapter l\'ordre de passage au fauteuil sans impacter les prochains créneaux.',
        icon: 'warning_amber',
        metricLabel: 'Retard',
        metricValue: `${summary.late}`,
      };
    }

    // 3. Active clinic in progress with waiting/in treatment
    if (summary.waiting > 0 || summary.inTreatment > 0) {
      return {
        tone: 'active',
        eyebrow: 'Flux clinique en direct · En cours',
        title: 'Cadence soutenue et fluide au cabinet',
        message: `${summary.inTreatment} patient(s) au fauteuil · ${summary.waiting} en attente · ${summary.completed} consultation(s) déjà finalisée(s).`,
        icon: 'speed',
        metricLabel: 'En attente',
        metricValue: `${summary.waiting}`,
      };
    }

    // 4. Upcoming appointments remaining
    if (summary.upcoming > 0) {
      return {
        tone: 'active',
        eyebrow: 'Planning du jour · Prochaines arrivées',
        title: `${summary.upcoming} consultation${summary.upcoming > 1 ? 's' : ''} à venir aujourd'hui`,
        message: 'L\'équipe d\'accueil et les salles de soins sont parées pour accueillir les prochains patients selon la planification.',
        icon: 'schedule',
        metricLabel: 'À venir',
        metricValue: `${summary.upcoming}`,
      };
    }

    // 5. Empty day
    if (summary.total === 0) {
      return {
        tone: 'calm',
        eyebrow: 'Journée sereine · Cabinet',
        title: 'Aucune consultation planifiée aujourd\'hui',
        message: 'Moment idéal pour le travail administratif, l\'archivage clinique, les bilans de traitement et la préparation de la semaine.',
        icon: 'spa',
        metricLabel: 'Planning',
        metricValue: 'Libre',
      };
    }

    // Fallback: general positive state
    return {
      tone: 'celebration',
      eyebrow: 'Flux clinique · Progression',
      title: 'Journée clinique bien maîtrisée',
      message: `${summary.completed}/${summary.total} rendez-vous finalisés avec succès.`,
      icon: 'task_alt',
      metricLabel: 'Réalisé',
      metricValue: `${summary.completed}/${summary.total}`,
    };
  });

  constructor() {
    void this.store.load();
  }

  /** Live waiting time, recomputed whenever the store's clock ticks. */
  protected waitingFor(row: ReceptionRow): string {
    return formatDuration(minutesSince(row.waitingAt, this.store.now()));
  }

  /** Total time physically in clinic; completed visits stop at completion. */
  protected clinicTimeFor(row: ReceptionRow): string {
    if (!row.arrivedAt) return '—';
    const end = row.completedAt ? new Date(row.completedAt).getTime() : this.store.now();
    return formatDuration(minutesSince(row.arrivedAt, end));
  }

  protected inTreatmentFor(row: ReceptionRow): string {
    return formatDuration(minutesSince(row.treatmentStartedAt, this.store.now()));
  }

  /** Lateness ticks locally too, rather than freezing at the last poll. */
  protected lateFor(row: ReceptionRow): string {
    return formatDuration(minutesSince(row.startAt, this.store.now()));
  }

  /**
   * The action this row is asking for, or nothing when this user may not
   * perform it. A secretary sees no button rather than a disabled one: a greyed
   * "Start visit" reads as broken software, not as a boundary.
   */
  protected action(row: ReceptionRow): RowAction | null {
    const next = primaryAction(row);
    if (!next) return null;
    if (!this.canUpdate) return null;
    if (next.next === 'IN_TREATMENT' && !this.canStartVisit) return null;
    if (next.next === 'COMPLETED' && !this.canCompleteVisit) return null;
    return next;
  }

  protected showNoShow(row: ReceptionRow): boolean {
    return this.canUpdate && canMarkNoShow(row);
  }

  protected canDirectComplete(row: ReceptionRow): boolean {
    return (
      this.canCompleteVisit &&
      (row.status === 'WAITING' || row.status === 'ARRIVED')
    );
  }

  protected async directComplete(row: ReceptionRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.canCompleteVisit) return;
    if (await this.store.changeStatus(row.appointmentId, 'COMPLETED')) {
      await this.refreshOpenActivity(row.appointmentId);
    }
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''}`
      .toUpperCase()
      .trim();
  }

  /**
   * Row actions stop propagation themselves rather than sitting inside a
   * click-trapping wrapper — a `<div>` with a handler is not focusable and is
   * invisible to a keyboard user.
   */
  protected async advance(row: ReceptionRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    const next = this.action(row);
    if (!next) return;
    if (await this.store.changeStatus(row.appointmentId, next.next)) {
      if (next.next === 'IN_TREATMENT') {
        await this.router.navigate(['/app/clinical-visits/appointments', row.appointmentId]);
        return;
      }
      await this.refreshOpenActivity(row.appointmentId);
    }
  }

  protected async markNoShow(row: ReceptionRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (await this.store.changeStatus(row.appointmentId, 'NO_SHOW')) {
      await this.refreshOpenActivity(row.appointmentId);
    }
  }

  protected openDetail(row: ReceptionRow): void {
    this.selectedAppointmentId.set(row.appointmentId);
    void this.store.loadActivity(row.appointmentId);
  }

  protected closeDetail(): void {
    this.selectedAppointmentId.set(null);
    this.store.clearActivity();
  }

  protected retryActivity(): void {
    const row = this.selected();
    if (row) void this.store.loadActivity(row.appointmentId);
  }

  /** `Sarah Trabelsi · Secretary`. Never a user id, never a permission string. */
  protected actor(entry: AppointmentActivity): string {
    return actorLine(entry);
  }

  protected entryLabel(entry: AppointmentActivity): string {
    return activityLabel(entry);
  }

  protected entryReason(entry: AppointmentActivity): string | null {
    return activityCancellationReason(entry);
  }

  protected openCancel(row: ReceptionRow): void {
    this.cancelReason.reset('');
    this.cancelTarget.set(row);
  }

  protected closeCancel(): void {
    this.cancelTarget.set(null);
  }

  protected async confirmCancel(): Promise<void> {
    const row = this.cancelTarget();
    if (!row || this.cancelReason.invalid) {
      this.cancelReason.markAsTouched();
      return;
    }
    if (await this.store.cancel(row.appointmentId, this.cancelReason.value.trim())) {
      this.cancelTarget.set(null);
      this.selectedAppointmentId.set(null);
    }
  }

  protected submitCancel(event: SubmitEvent): void {
    event.preventDefault();
    void this.confirmCancel();
  }

  /** The patient name is a door into the full record, not just a label. */
  protected openPatient(row: ReceptionRow, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/app/patients', row.patientId]);
  }

  protected trackRow(_index: number, row: ReceptionRow): string {
    return row.appointmentId;
  }

  private async refreshOpenActivity(appointmentId: string): Promise<void> {
    if (this.selectedAppointmentId() === appointmentId) {
      await this.store.loadActivity(appointmentId);
    }
  }
}
