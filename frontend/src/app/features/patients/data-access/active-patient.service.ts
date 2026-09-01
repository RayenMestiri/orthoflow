import { Injectable, signal } from '@angular/core';

export interface ActivePatientSummary {
  id: string;
  fullName: string;
  activeTab?: string;
}

@Injectable({ providedIn: 'root' })
export class ActivePatientService {
  readonly activePatient = signal<ActivePatientSummary | null>(null);

  setPatient(patient: ActivePatientSummary | null): void {
    this.activePatient.set(patient);
  }

  setActiveTab(tab: string): void {
    const current = this.activePatient();
    if (current) {
      this.activePatient.set({ ...current, activeTab: tab });
    }
  }

  clear(): void {
    this.activePatient.set(null);
  }
}
