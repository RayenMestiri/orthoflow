import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { PatientsApiService } from '../../../patients/data-access/patients-api.service';
import type { Patient } from '../../../patients/models/patient.models';
import { ScheduleStore } from '../../data-access/schedule.store';
import {
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  type Appointment,
  type AppointmentStatus,
} from '../../models/schedule.models';
import {
  formatDateTime,
  formatTime,
  fromDateAndTimeInputs,
  addMinutes,
  snapToSlot,
  toDateInputValue,
  toTimeInputValue,
} from '../../utils/appointment-time.utils';
import { AppointmentStatusBadge } from '../appointment-status-badge/appointment-status-badge';

interface StatusAction {
  status: Exclude<AppointmentStatus, 'CANCELLED'>;
  label: string;
  icon: string;
}

/** Operational actions in workflow order; rendered only when allowed. */
const STATUS_ACTIONS: readonly StatusAction[] = [
  { status: 'CONFIRMED', label: 'Confirm', icon: 'event_available' },
  { status: 'ARRIVED', label: 'Patient arrived', icon: 'login' },
  { status: 'WAITING', label: 'Move to waiting', icon: 'chair' },
  { status: 'IN_TREATMENT', label: 'Start treatment', icon: 'medical_services' },
  { status: 'COMPLETED', label: 'Complete', icon: 'task_alt' },
  { status: 'NO_SHOW', label: 'No-show', icon: 'person_off' },
];

/**
 * Right-side drawer for creating and working an appointment.
 *
 * In `edit` mode the form doubles as the detail view, with the status workflow
 * and cancellation underneath. All persistence goes through the store.
 */
@Component({
  selector: 'app-appointment-drawer',
  imports: [ReactiveFormsModule, RouterLink, AppointmentStatusBadge],
  templateUrl: './appointment-drawer.html',
  styleUrl: './appointment-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentDrawer {
  protected readonly store = inject(ScheduleStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly patientsApi = inject(PatientsApiService);

  protected readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');

  protected readonly form = this.fb.group({
    patientSearch: [''],
    appointmentTypeId: ['', Validators.required],
    date: ['', Validators.required],
    startTime: ['', Validators.required],
    durationMinutes: [30, [Validators.required, Validators.min(5), Validators.max(480)]],
    note: ['', Validators.maxLength(1000)],
  });

  protected readonly cancelReason = this.fb.control('', [
    Validators.minLength(2),
    Validators.maxLength(500),
  ]);

  protected readonly submitted = signal(false);
  protected readonly selectedPatient = signal<Patient | null>(null);
  protected readonly searchOpen = signal(false);
  protected readonly cancelPanelOpen = signal(false);
  protected readonly moreActionsOpen = signal(false);

  private readonly formValue = toSignal(this.form.valueChanges);

  protected readonly endPreview = computed(() => {
    this.formValue();
    const { date, startTime, durationMinutes } = this.form.getRawValue();
    if (!date || !startTime) {
      return null;
    }
    return formatTime(addMinutes(fromDateAndTimeInputs(date, startTime), durationMinutes));
  });

  protected readonly computedEndTime = this.endPreview;

  protected readonly searchTerm = toSignal(
    this.form.controls.patientSearch.valueChanges.pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );

  protected readonly searchResults = toSignal(
    this.form.controls.patientSearch.valueChanges.pipe(
      startWith(this.form.controls.patientSearch.value ?? ''),
      debounceTime(200),
      distinctUntilChanged(),
      switchMap((term: string) => {
        if (this.selectedPatient()) {
          return of<Patient[]>([]);
        }
        const trimmed = (term || '').trim();
        return this.patientsApi
          .list({
            page: 1,
            limit: 8,
            search: trimmed,
            status: 'ACTIVE',
            sortBy: 'name',
            sortOrder: 'asc',
          })
          .pipe(switchMap((result) => of(result.items)));
      }),
    ),
    { initialValue: [] as Patient[] },
  );

  protected readonly showNoResults = computed(
    () =>
      this.searchOpen() &&
      !this.selectedPatient() &&
      (this.searchTerm()?.trim().length ?? 0) >= 2 &&
      this.searchResults().length === 0,
  );

  protected readonly mode = this.store.drawerMode;
  protected readonly appointment = this.store.selectedAppointment;

  protected readonly allowedActions = computed(() => {
    const current = this.appointment();
    if (!current) {
      return [];
    }
    const allowed = STATUS_TRANSITIONS[current.status];
    return STATUS_ACTIONS.filter((action) => allowed.includes(action.status));
  });

  protected readonly primaryAction = computed(() => {
    const current = this.appointment();
    if (!current) return null;
    const next: Partial<Record<AppointmentStatus, StatusAction['status']>> = {
      SCHEDULED: 'CONFIRMED',
      CONFIRMED: 'ARRIVED',
      ARRIVED: 'WAITING',
      WAITING: 'IN_TREATMENT',
      IN_TREATMENT: 'COMPLETED',
    };
    return STATUS_ACTIONS.find((action) => action.status === next[current.status]) ?? null;
  });

  protected readonly secondaryActions = computed(() => {
    const primary = this.primaryAction();
    return this.allowedActions().filter((action) => action.status !== primary?.status);
  });

  protected readonly canCancel = computed(() => {
    const current = this.appointment();
    return current ? STATUS_TRANSITIONS[current.status].includes('CANCELLED') : false;
  });

  protected readonly isClosed = computed(() => {
    const current = this.appointment();
    return current ? STATUS_TRANSITIONS[current.status].length === 0 : false;
  });

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatTime = formatTime;

  constructor() {
    // Re-seed the form whenever the drawer opens or its subject changes.
    effect(() => {
      const mode = this.mode();
      if (mode === 'create') {
        this.seedCreateForm();
      } else if (mode === 'edit') {
        this.seedEditForm();
      }
      if (mode) {
        setTimeout(() => this.firstField()?.nativeElement.focus(), 0);
      }
    });

    // Selecting an appointment type defaults the duration from that type.
    this.form.controls.appointmentTypeId.valueChanges.subscribe((typeId) => {
      const type = this.store.appointmentTypes().find((candidate) => candidate.id === typeId);
      if (type && !this.isClosed()) {
        this.form.controls.durationMinutes.setValue(type.durationMinutes);
      }
    });
  }

  // --- patient selection ---------------------------------------------------

  selectPatient(patient: Patient): void {
    this.selectedPatient.set(patient);
    this.form.controls.patientSearch.setValue(patient.fullName);
    this.searchOpen.set(false);
  }

  clearPatient(): void {
    this.selectedPatient.set(null);
    this.form.controls.patientSearch.setValue('');
    this.searchOpen.set(true);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const [first] = this.searchResults();
      if (first) {
        this.selectPatient(first);
      }
    }
  }

  // --- submit --------------------------------------------------------------

  async submit(): Promise<void> {
    this.submitted.set(true);
    const patient = this.selectedPatient();
    if (this.form.invalid || !patient) {
      this.form.markAllAsTouched();
      return;
    }

    const { appointmentTypeId, date, startTime, durationMinutes, note } = this.form.getRawValue();
    const startAt = fromDateAndTimeInputs(date, startTime);
    const payload = {
      patientId: patient.id,
      appointmentTypeId,
      startAt,
      durationMinutes,
      note: note.trim() ? note.trim() : null,
    };

    if (this.mode() === 'create') {
      await this.store.createAppointment(payload);
    } else {
      const current = this.appointment();
      if (current) {
        await this.store.updateAppointment(current.id, payload);
      }
    }
  }

  async applyStatus(status: Exclude<AppointmentStatus, 'CANCELLED'>): Promise<void> {
    const current = this.appointment();
    if (current) {
      await this.store.changeStatus(current.id, status);
    }
  }

  async confirmCancel(): Promise<void> {
    const current = this.appointment();
    if (!current) {
      return;
    }
    const reason = this.cancelReason.value.trim();
    await this.store.cancelAppointment(current.id, reason ? reason : null);
    this.cancelPanelOpen.set(false);
    this.moreActionsOpen.set(false);
    this.cancelReason.setValue('');
  }

  async confirmOverbooking(): Promise<void> {
    await this.store.confirmOverbooking();
  }

  close(): void {
    this.cancelPanelOpen.set(false);
    this.moreActionsOpen.set(false);
    this.store.closeDrawer();
  }

  // --- seeding -------------------------------------------------------------

  private seedCreateForm(): void {
    const slot = this.store.draftSlot();
    const defaultType = this.store.activeTypes()[0] ?? null;
    const slotMinutes = this.store.clinicSchedule().slotMinutes;
    const startIso =
      slot?.startAt ?? this.nextBookableSlot(defaultType?.durationMinutes ?? slotMinutes);

    this.submitted.set(false);
    this.selectedPatient.set(null);
    this.cancelPanelOpen.set(false);
    this.form.reset({
      patientSearch: '',
      appointmentTypeId: defaultType?.id ?? '',
      date: toDateInputValue(startIso),
      startTime: toTimeInputValue(startIso),
      durationMinutes: defaultType?.durationMinutes ?? slotMinutes,
      note: '',
    });
    this.searchOpen.set(true);
  }

  private nextBookableSlot(durationMinutes: number): string {
    const schedule = this.store.clinicSchedule();
    const now = new Date();
    for (let offset = 0; offset < 8; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      const day = schedule.workingHours.find((entry) => entry.weekday === date.getDay());
      if (!day || day.isClosed) continue;
      const [openHour = 8, openMinute = 0] = day.opensAt.split(':').map(Number);
      const [closeHour = 18, closeMinute = 0] = day.closesAt.split(':').map(Number);
      const opens = new Date(date);
      opens.setHours(openHour, openMinute, 0, 0);
      const closes = new Date(date);
      closes.setHours(closeHour, closeMinute, 0, 0);
      const candidate = offset === 0 && now > opens ? new Date(snapToSlot(now.toISOString(), schedule.slotMinutes)) : opens;
      if (candidate.getTime() + durationMinutes * 60_000 <= closes.getTime()) {
        return candidate.toISOString();
      }
    }
    return snapToSlot(now.toISOString(), schedule.slotMinutes);
  }

  private seedEditForm(): void {
    const appointment = this.appointment();
    if (!appointment) {
      return;
    }

    this.submitted.set(false);
    this.cancelPanelOpen.set(false);
    this.selectedPatient.set(
      appointment.patient
        ? ({
            id: appointment.patient.id,
            fullName: appointment.patient.fullName,
            phone: appointment.patient.phone,
            age: appointment.patient.age,
            primaryGuardian: null,
          } as unknown as Patient)
        : null,
    );
    this.form.reset({
      patientSearch: appointment.patient?.fullName ?? '',
      appointmentTypeId: appointment.appointmentTypeId,
      date: toDateInputValue(appointment.startAt),
      startTime: toTimeInputValue(appointment.startAt),
      durationMinutes: appointment.durationMinutes,
      note: appointment.note ?? '',
    });
    this.searchOpen.set(false);
  }

  protected patientMeta(patient: Patient): string {
    const parts: string[] = [];
    if (patient.age !== null && patient.age !== undefined) {
      parts.push(`${patient.age} years`);
    }
    if (patient.phone) {
      parts.push(patient.phone);
    }
    return parts.join(' • ');
  }

  protected trackAppointment(appointment: Appointment | null): string {
    return appointment?.id ?? '';
  }

  protected activityLabel(action: string): string {
    const labels: Record<string, string> = {
      'appointment.created': 'Appointment created',
      'appointment.updated': 'Details updated',
      'appointment.rescheduled': 'Time changed',
      'appointment.duration_changed': 'Duration changed',
      'appointment.status_changed': 'Status changed',
      'appointment.cancelled': 'Appointment cancelled',
      'appointment.no_show': 'Marked no-show',
      'appointment.overbooked': 'Overbooking approved',
    };
    return labels[action] ?? action.replace('appointment.', '').replaceAll('_', ' ');
  }
}
