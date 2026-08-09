import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { ReceptionStore } from '../../data-access/reception.store';
import {
  FLOW_SECTIONS,
  STATUS_LABELS,
  canMarkNoShow,
  formatDuration,
  minutesSince,
  primaryAction,
  type ReceptionRow,
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

  /** Clinical transitions stay with clinicians; the desk checks people in. */
  protected readonly canRunVisits = this.permissions.can(PERMISSIONS.TREATMENTS_MANAGE);
  protected readonly canCancel = this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW);

  protected readonly selected = signal<ReceptionRow | null>(null);
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

  constructor() {
    void this.store.load();
  }

  /** Live waiting time, recomputed whenever the store's clock ticks. */
  protected waitingFor(row: ReceptionRow): string {
    return formatDuration(minutesSince(row.waitingSince, this.store.now()));
  }

  protected inTreatmentFor(row: ReceptionRow): string {
    return formatDuration(minutesSince(row.treatmentStartedAt, this.store.now()));
  }

  /** Lateness ticks locally too, rather than freezing at the last poll. */
  protected lateFor(row: ReceptionRow): string {
    return formatDuration(minutesSince(row.startAt, this.store.now()));
  }

  protected action(row: ReceptionRow) {
    return primaryAction(row);
  }

  protected showNoShow(row: ReceptionRow): boolean {
    return canMarkNoShow(row);
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
    await this.store.changeStatus(row.appointmentId, next.next);
  }

  protected async markNoShow(row: ReceptionRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    await this.store.changeStatus(row.appointmentId, 'NO_SHOW');
  }

  protected openDetail(row: ReceptionRow): void {
    this.selected.set(row);
  }

  protected closeDetail(): void {
    this.selected.set(null);
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
      this.selected.set(null);
    }
  }

  /** The patient name is a door into the full record, not just a label. */
  protected openPatient(row: ReceptionRow, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/app/patients', row.patientId]);
  }

  protected trackRow(_index: number, row: ReceptionRow): string {
    return row.appointmentId;
  }
}
