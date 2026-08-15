import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { ClinicalVisitsApiService } from '../../data-access/clinical-visits-api.service';
import {
  clinicalLabel,
  type ClinicalVisitSummary,
} from '../../models/clinical-visit.models';

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
  protected readonly visits = signal<ClinicalVisitSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly label = clinicalLabel;

  constructor() {
    queueMicrotask(() => void this.load());
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.visits.set(await firstValueFrom(this.api.listForPatient(this.patientId())));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
