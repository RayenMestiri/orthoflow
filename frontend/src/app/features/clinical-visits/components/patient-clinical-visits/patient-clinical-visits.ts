import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { PatientsApiService } from '../../../patients/data-access/patients-api.service';
import type { PatientAppointment } from '../../../patients/models/patient.models';
import { ScheduleApiService } from '../../../schedule/data-access/schedule-api.service';
import { ClinicalVisitsApiService } from '../../data-access/clinical-visits-api.service';
import {
  clinicalLabel,
  type ClinicalVisitSummary,
} from '../../models/clinical-visit.models';

export type VisitFilterOption = 'ALL' | 'COMPLETED' | 'ACTIVE' | 'WITH_NOTES';

export interface UnifiedVisitItem {
  id: string;
  appointmentId: string;
  startAt: string;
  endAt: string | null;
  durationMinutes: number;
  appointmentStatus: string;
  appointmentTypeName: string;
  appointmentTypeColor: string | null;
  doctorName: string;
  treatment: { id: string; label: string; status: string } | null;
  clinicalVisit: {
    id: string;
    status: 'DRAFT' | 'COMPLETED';
    reasonCode: string | null;
    reasonOther: string | null;
    procedures: string[];
    observations: string | null;
    nextStepNote: string | null;
    completedAt: string | null;
    clinicianName: string;
  } | null;
  note: string | null;
}

@Component({
  selector: 'app-patient-clinical-visits',
  imports: [DatePipe, RouterLink],
  templateUrl: './patient-clinical-visits.html',
  styleUrl: './patient-clinical-visits.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientClinicalVisits {
  readonly patientId = input.required<string>();

  private readonly api = inject(ClinicalVisitsApiService);
  private readonly patientsApi = inject(PatientsApiService);
  private readonly scheduleApi = inject(ScheduleApiService);
  private readonly router = inject(Router);

  protected readonly appointments = signal<PatientAppointment[]>([]);
  protected readonly visits = signal<ClinicalVisitSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly activeFilter = signal<VisitFilterOption>('ALL');
  protected readonly startingVisitId = signal<string | null>(null);

  protected readonly label = clinicalLabel;

  protected readonly unifiedVisits = computed<UnifiedVisitItem[]>(() => {
    const appts = this.appointments();
    const directVisits = this.visits();
    const apptIds = new Set(appts.map((a) => a.id));

    const items: UnifiedVisitItem[] = appts.map((appt) => ({
      id: appt.id,
      appointmentId: appt.id,
      startAt: appt.startAt,
      endAt: appt.endAt,
      durationMinutes: appt.durationMinutes,
      appointmentStatus: appt.status,
      appointmentTypeName: appt.appointmentType.name,
      appointmentTypeColor: appt.appointmentType.color ?? null,
      doctorName: appt.doctor.name,
      treatment: appt.treatment,
      clinicalVisit: appt.clinicalVisit,
      note: appt.note,
    }));

    // Add any standalone clinical visit that doesn't correspond to an appointment already listed
    for (const v of directVisits) {
      if (!apptIds.has(v.appointmentId)) {
        items.push({
          id: v.id,
          appointmentId: v.appointmentId,
          startAt: v.startedAt,
          endAt: v.completedAt,
          durationMinutes: 30,
          appointmentStatus: v.status === 'COMPLETED' ? 'COMPLETED' : 'IN_TREATMENT',
          appointmentTypeName: v.reasonOther || this.label(v.reasonCode),
          appointmentTypeColor: null,
          doctorName: v.clinicianName,
          treatment: null,
          clinicalVisit: {
            id: v.id,
            status: v.status,
            reasonCode: v.reasonCode,
            reasonOther: v.reasonOther,
            procedures: v.procedures,
            observations: null,
            nextStepNote: v.nextStepNote,
            completedAt: v.completedAt,
            clinicianName: v.clinicianName,
          },
          note: null,
        });
      }
    }

    return items.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  });

  protected readonly filteredVisits = computed(() => {
    const list = this.unifiedVisits();
    const filter = this.activeFilter();
    switch (filter) {
      case 'COMPLETED':
        return list.filter(
          (item) =>
            item.appointmentStatus === 'COMPLETED' || item.clinicalVisit?.status === 'COMPLETED',
        );
      case 'ACTIVE':
        return list.filter(
          (item) =>
            ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'WAITING', 'IN_TREATMENT'].includes(
              item.appointmentStatus,
            ) && item.appointmentStatus !== 'COMPLETED',
        );
      case 'WITH_NOTES':
        return list.filter((item) => item.clinicalVisit !== null);
      case 'ALL':
      default:
        return list;
    }
  });

  protected readonly totalCount = computed(() => this.unifiedVisits().length);
  protected readonly completedCount = computed(
    () =>
      this.unifiedVisits().filter(
        (item) =>
          item.appointmentStatus === 'COMPLETED' || item.clinicalVisit?.status === 'COMPLETED',
      ).length,
  );
  protected readonly notesCount = computed(
    () => this.unifiedVisits().filter((item) => item.clinicalVisit !== null).length,
  );

  constructor() {
    queueMicrotask(() => void this.load());
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const patientId = this.patientId();
      const [appointments, visits] = await Promise.all([
        firstValueFrom(this.patientsApi.listPatientAppointments(patientId)),
        firstValueFrom(this.api.listForPatient(patientId)).catch(() => [] as ClinicalVisitSummary[]),
      ]);
      this.appointments.set(appointments);
      this.visits.set(visits);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected setFilter(filter: VisitFilterOption): void {
    this.activeFilter.set(filter);
  }

  protected async startOrOpenNote(item: UnifiedVisitItem): Promise<void> {
    if (item.clinicalVisit) {
      await this.router.navigate(['/app/clinical-visits', item.clinicalVisit.id]);
      return;
    }

    if (!item.appointmentId) return;

    this.startingVisitId.set(item.id);
    try {
      if (
        ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'WAITING'].includes(item.appointmentStatus)
      ) {
        await firstValueFrom(this.scheduleApi.changeStatus(item.appointmentId, 'IN_TREATMENT'));
      }
      await this.router.navigate(['/app/clinical-visits/appointments', item.appointmentId]);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.startingVisitId.set(null);
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'COMPLETED':
        return 'Terminé';
      case 'IN_TREATMENT':
        return 'En soins';
      case 'WAITING':
        return 'Salle d’attente';
      case 'ARRIVED':
        return 'Arrivé';
      case 'CONFIRMED':
        return 'Confirmé';
      case 'SCHEDULED':
        return 'Planifié';
      case 'CANCELLED':
        return 'Annulé';
      case 'NO_SHOW':
        return 'Non présenté';
      default:
        return status;
    }
  }

  protected procedureLabel(code: string): string {
    switch (code) {
      case 'EXAMINATION':
        return 'Examen clinique';
      case 'WIRE_CHANGE':
        return 'Changement d’arc';
      case 'ARCHWIRE_ADJUSTMENT':
        return 'Ajustement d’arc';
      case 'BRACKET_REPAIR':
        return 'Recollage boîtier';
      case 'ELASTICS_INSTRUCTION':
        return 'Pose élastiques';
      case 'APPLIANCE_FITTING':
        return 'Pose appareil';
      case 'APPLIANCE_REMOVAL':
        return 'Dépose appareil';
      case 'RETAINER_CHECK':
        return 'Contrôle contention';
      case 'SCAN_OR_IMPRESSION':
        return 'Empreinte / Scan';
      case 'PHOTOGRAPHS':
        return 'Photographies';
      case 'OTHER':
        return 'Autre acte';
      default:
        return code;
    }
  }

  protected paymentQueryParams(item: UnifiedVisitItem): Record<string, string> {
    const params: Record<string, string> = {
      tab: 'payments',
      action: 'record-payment',
      appointmentId: item.appointmentId,
    };
    if (item.treatment?.id) {
      params['treatmentId'] = item.treatment.id;
    }
    return params;
  }
}
