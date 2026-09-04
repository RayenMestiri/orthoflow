import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  Appointment,
  AppointmentActivity,
  AppointmentStatus,
  AppointmentType,
  CapacityWarning,
  CalendarViewName,
  ClinicScheduleConfiguration,
  CreateAppointmentInput,
  DraftSlot,
  SchedulePrefill,
  UpdateAppointmentInput,
  VisibleRange,
} from '../models/schedule.models';
import { isSameClinicDay, todayRange } from '../utils/appointment-time.utils';
import { ScheduleApiService } from './schedule-api.service';

export type DrawerMode = 'create' | 'edit' | null;

/**
 * Owns every piece of schedule state; components read signals and call intents.
 * FullCalendar is only a renderer — nothing in here knows it exists.
 */
@Injectable({ providedIn: 'root' })
export class ScheduleStore {
  private readonly api = inject(ScheduleApiService);
  private readonly auth = inject(AuthStore);

  private readonly appointmentsState = signal<Appointment[]>([]);
  private readonly todayState = signal<Appointment[]>([]);
  private readonly typesState = signal<AppointmentType[]>([]);
  private readonly clinicScheduleState = signal<ClinicScheduleConfiguration | null>(null);
  private readonly loadingState = signal(false);
  private readonly mutatingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly noticeState = signal<string | null>(null);
  private readonly viewState = signal<CalendarViewName>('timeGridWeek');
  private readonly rangeState = signal<VisibleRange | null>(null);
  private readonly drawerModeState = signal<DrawerMode>(null);
  private readonly selectedState = signal<Appointment | null>(null);
  private readonly draftSlotState = signal<DraftSlot | null>(null);
  private readonly capacityWarningState = signal<CapacityWarning | null>(null);
  private readonly activityState = signal<AppointmentActivity[]>([]);
  private readonly prefillState = signal<SchedulePrefill | null>(null);

  private requestSequence = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedForClinic: string | null = null;
  private pendingOverbooking: (() => Promise<boolean>) | null = null;

  readonly appointments = this.appointmentsState.asReadonly();
  readonly appointmentTypes = this.typesState.asReadonly();
  readonly clinicSchedule = this.clinicScheduleState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly isMutating = this.mutatingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly notice = this.noticeState.asReadonly();
  readonly activeView = this.viewState.asReadonly();
  readonly visibleRange = this.rangeState.asReadonly();
  readonly drawerMode = this.drawerModeState.asReadonly();
  readonly selectedAppointment = this.selectedState.asReadonly();
  readonly draftSlot = this.draftSlotState.asReadonly();
  readonly capacityWarning = this.capacityWarningState.asReadonly();
  readonly activity = this.activityState.asReadonly();
  readonly prefill = this.prefillState.asReadonly();

  readonly activeTypes = computed(() => {
    return this.typesState().filter((type) => type.isActive !== false);
  });

  readonly activeRangeAppointments = computed(() =>
    this.todayState().filter((appointment) => appointment.status !== 'CANCELLED'),
  );

  readonly receptionQueue = computed(() =>
    this.activeRangeAppointments()
      .filter((appointment) => ['ARRIVED', 'WAITING', 'IN_TREATMENT'].includes(appointment.status))
      .sort((a, b) => a.startAt.localeCompare(b.startAt)),
  );

  readonly needsAttention = computed(() =>
    this.activeRangeAppointments()
      .filter(
        (appointment) =>
          ['SCHEDULED', 'CONFIRMED'].includes(appointment.status) &&
          new Date(appointment.startAt).getTime() < Date.now(),
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt)),
  );

  readonly todayCount = computed(() => this.activeRangeAppointments().length);

  readonly waitingCount = computed(() => {
    return this.activeRangeAppointments().filter(
      (a) => a.status === 'WAITING' || a.status === 'SCHEDULED' || a.status === 'CONFIRMED',
    ).length;
  });

  readonly arrivedCount = computed(() => {
    return this.activeRangeAppointments().filter((a) => a.status === 'ARRIVED').length;
  });

  readonly inTreatmentCount = computed(() => {
    return this.activeRangeAppointments().filter((a) => a.status === 'IN_TREATMENT').length;
  });

  readonly completedCount = computed(() => {
    return this.activeRangeAppointments().filter((a) => a.status === 'COMPLETED').length;
  });

  readonly completedToday = computed(() => {
    return this.todayState()
      .filter((a) => a.status === 'COMPLETED')
      .sort((a, b) => (b.completedAt ?? b.startAt).localeCompare(a.completedAt ?? a.startAt));
  });

  readonly hasAppointmentsInView = computed(() =>
    this.appointmentsState().some((appointment) => appointment.status !== 'CANCELLED'),
  );

  // --- bootstrap -----------------------------------------------------------

  async initialize(force = false): Promise<void> {
    const clinicId = this.auth.activeClinicId();
    if (!clinicId || (!force && this.loadedForClinic === clinicId)) {
      return;
    }
    this.loadedForClinic = clinicId;

    try {
      const [types, schedule] = await Promise.all([
        firstValueFrom(this.api.listAppointmentTypes()),
        firstValueFrom(this.api.getClinicSchedule()),
      ]);
      this.typesState.set(types);
      this.clinicScheduleState.set(schedule);
      const { start, end } = todayRange(schedule.timezone);
      this.todayState.set(
        await firstValueFrom(
          this.api.listAppointments(start.toISOString(), end.toISOString()),
        ).catch(() => []),
      );
    } catch (error) {
      this.typesState.set([]);
      this.errorState.set(getApiProblem(error).message);
    }
  }

  // --- range / view --------------------------------------------------------

  setView(view: CalendarViewName): void {
    this.viewState.set(view);
  }

  /**
   * Called by the calendar whenever the visible dates change. Fetches exactly
   * that window — never the whole history — and keeps the previous events on
   * screen while the request is in flight.
   */
  async rangeChanged(range: VisibleRange): Promise<void> {
    const previous = this.rangeState();
    this.rangeState.set(range);
    if (previous?.start === range.start && previous?.end === range.end) {
      return;
    }
    await this.reload();
  }

  async reload(): Promise<void> {
    const range = this.rangeState();
    if (!range) {
      return;
    }

    const sequence = ++this.requestSequence;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const appointments = await firstValueFrom(this.api.listAppointments(range.start, range.end));
      if (sequence !== this.requestSequence) return;
      this.appointmentsState.set(appointments);
    } catch (error) {
      if (sequence !== this.requestSequence) return;
      this.errorState.set(getApiProblem(error).message);
    } finally {
      if (sequence === this.requestSequence) this.loadingState.set(false);
    }
  }

  async refresh(): Promise<void> {
    const range = this.rangeState();
    const schedule = this.clinicScheduleState();
    const calls: Promise<unknown>[] = [];

    if (schedule) {
      const { start, end } = todayRange(schedule.timezone);
      calls.push(
        firstValueFrom(this.api.listAppointments(start.toISOString(), end.toISOString()))
          .then((today) => this.todayState.set(today))
          .catch(() => undefined),
      );
    }

    if (range) {
      const sequence = ++this.requestSequence;
      this.loadingState.set(true);
      calls.push(
        firstValueFrom(this.api.listAppointments(range.start, range.end))
          .then((appointments) => {
            if (sequence === this.requestSequence) {
              this.appointmentsState.set(appointments);
            }
          })
          .catch((error) => {
            if (sequence === this.requestSequence) {
              this.errorState.set(getApiProblem(error).message);
            }
          })
          .finally(() => {
            if (sequence === this.requestSequence) {
              this.loadingState.set(false);
            }
          }),
      );
    }

    await Promise.all(calls);
  }

  // --- drawer --------------------------------------------------------------

  openCreate(slot: DraftSlot | null): void {
    void this.initialize(true);
    this.selectedState.set(null);
    this.draftSlotState.set(slot);
    this.drawerModeState.set('create');
    this.clearCapacityWarning();
  }

  setPrefill(prefill: SchedulePrefill | null): void {
    this.prefillState.set(prefill);
  }

  openEdit(appointmentId: string, preserveCapacityWarning = false): void {
    void this.initialize(true);
    const appointment =
      this.appointmentsState().find((a) => a.id === appointmentId) ??
      this.todayState().find((a) => a.id === appointmentId);
    if (appointment) {
      this.selectedState.set(appointment);
    }
    this.draftSlotState.set(null);
    this.drawerModeState.set('edit');
    if (!preserveCapacityWarning) this.clearCapacityWarning();
    void this.loadActivity(appointmentId);

    void firstValueFrom(this.api.getAppointment(appointmentId))
      .then((fresh) => {
        this.upsert(fresh);
      })
      .catch(() => undefined);
  }

  async openRemote(appointmentId: string): Promise<void> {
    try {
      const appointment = await firstValueFrom(this.api.getAppointment(appointmentId));
      this.upsert(appointment);
      this.selectedState.set(appointment);
      this.draftSlotState.set(null);
      this.drawerModeState.set('edit');
      void this.loadActivity(appointmentId);
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
    }
  }

  closeDrawer(): void {
    this.drawerModeState.set(null);
    this.selectedState.set(null);
    this.draftSlotState.set(null);
    this.clearCapacityWarning();
    this.activityState.set([]);
    this.prefillState.set(null);
  }

  // --- mutations -----------------------------------------------------------

  async createAppointment(input: CreateAppointmentInput): Promise<boolean> {
    return this.mutate(
      async () => {
        const created = await firstValueFrom(this.api.createAppointment(input));
        this.upsert(created);
        this.closeDrawer();
        this.showNotice('Appointment created');
      },
      () => this.createAppointment({ ...input, allowOverbooking: true }),
    );
  }

  async updateAppointment(appointmentId: string, input: UpdateAppointmentInput): Promise<boolean> {
    return this.mutate(
      async () => {
        const updated = await firstValueFrom(this.api.updateAppointment(appointmentId, input));
        this.upsert(updated);
        this.closeDrawer();
        this.showNotice('Appointment updated');
      },
      () => this.updateAppointment(appointmentId, { ...input, allowOverbooking: true }),
    );
  }

  /**
   * Persists a drag/resize. The calendar has already moved the event
   * optimistically; on failure the caller reverts it and we surface why.
   */
  async reschedule(appointmentId: string, startAt: string, endAt: string): Promise<boolean> {
    return this.mutate(
      async () => {
        const updated = await firstValueFrom(
          this.api.updateAppointment(appointmentId, {
            startAt,
            durationMinutes: Math.round(
              (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000,
            ),
          }),
        );
        this.upsert(updated);
        this.showNotice('Appointment moved');
      },
      () => this.rescheduleWithOverride(appointmentId, startAt, endAt),
    );
  }

  private async rescheduleWithOverride(
    appointmentId: string,
    startAt: string,
    endAt: string,
  ): Promise<boolean> {
    return this.mutate(async () => {
      const updated = await firstValueFrom(
        this.api.updateAppointment(appointmentId, {
          startAt,
          durationMinutes: Math.round(
            (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000,
          ),
          allowOverbooking: true,
        }),
      );
      this.upsert(updated);
      this.showNotice('Appointment moved');
    });
  }

  async confirmOverbooking(): Promise<boolean> {
    const retry = this.pendingOverbooking;
    if (!retry) return false;
    this.capacityWarningState.set(null);
    this.pendingOverbooking = null;
    return retry();
  }

  dismissCapacityWarning(): void {
    this.clearCapacityWarning();
  }

  async changeStatus(
    appointmentId: string,
    status: Exclude<AppointmentStatus, 'CANCELLED'>,
  ): Promise<boolean> {
    return this.mutate(async () => {
      const updated = await firstValueFrom(this.api.changeStatus(appointmentId, status));
      this.upsert(updated);
      if (this.selectedState()?.id === appointmentId) void this.loadActivity(appointmentId);
      this.showNotice(`Marked as ${status.toLowerCase().replace('_', ' ')}`);
    });
  }

  async cancelAppointment(appointmentId: string, reason: string | null): Promise<boolean> {
    return this.mutate(async () => {
      const cancelled = await firstValueFrom(this.api.cancelAppointment(appointmentId, reason));
      this.upsert(cancelled);
      this.closeDrawer();
      this.showNotice('Appointment cancelled');
    });
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  /** Test/devtool hook: drops per-clinic caches (e.g. after switching clinic). */
  resetForClinicChange(): void {
    this.loadedForClinic = null;
    this.appointmentsState.set([]);
    this.todayState.set([]);
    this.typesState.set([]);
    this.clinicScheduleState.set(null);
    this.closeDrawer();
  }

  // --- internals -----------------------------------------------------------

  private countToday(status: AppointmentStatus): number {
    return this.activeRangeAppointments().filter((a: Appointment) => a.status === status).length;
  }

  private upsert(appointment: Appointment): void {
    this.appointmentsState.update((appointments) => this.upsertIn(appointments, appointment));
    const schedule = this.clinicScheduleState();
    if (schedule) {
      this.todayState.update((appointments) =>
        isSameClinicDay(appointment.startAt, new Date(), schedule.timezone)
          ? this.upsertIn(appointments, appointment)
          : appointments.filter((candidate) => candidate.id !== appointment.id),
      );
    } else {
      this.todayState.update((appointments) => this.upsertIn(appointments, appointment));
    }
    if (this.selectedState()?.id === appointment.id) {
      this.selectedState.set(appointment);
    }
  }

  private upsertIn(appointments: Appointment[], appointment: Appointment): Appointment[] {
    const index = appointments.findIndex((a) => a.id === appointment.id);
    if (index === -1) {
      return [...appointments, appointment];
    }
    const next = [...appointments];
    next[index] = appointment;
    return next;
  }

  private async mutate(
    work: () => Promise<void>,
    retryOverbooking?: () => Promise<boolean>,
  ): Promise<boolean> {
    this.mutatingState.set(true);
    this.errorState.set(null);
    try {
      await work();
      return true;
    } catch (error) {
      const problem = getApiProblem(error);
      if (problem.code === 'SLOT_CAPACITY_EXCEEDED' && retryOverbooking) {
        this.capacityWarningState.set(problem.details as CapacityWarning);
        this.pendingOverbooking = retryOverbooking;
      } else {
        this.errorState.set(problem.message);
        // Automatically sync fresh data to recover from conflict / stale status
        void this.refresh();
        const selectedId = this.selectedState()?.id;
        if (selectedId) {
          void firstValueFrom(this.api.getAppointment(selectedId))
            .then((fresh) => this.upsert(fresh))
            .catch(() => undefined);
        }
      }
      return false;
    } finally {
      this.mutatingState.set(false);
    }
  }

  private clearCapacityWarning(): void {
    this.capacityWarningState.set(null);
    this.pendingOverbooking = null;
  }

  private async loadActivity(appointmentId: string): Promise<void> {
    try {
      this.activityState.set(await firstValueFrom(this.api.listActivity(appointmentId)));
    } catch {
      this.activityState.set([]);
    }
  }

  private showNotice(message: string): void {
    this.noticeState.set(message);
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.noticeState.set(null), 3200);
  }
}
