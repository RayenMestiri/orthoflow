import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import type { PatientListQuery, PatientStatus } from '../../models/patient.models';
import { PatientsStore } from '../../data-access/patients.store';

@Component({
  selector: 'app-patients-list-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './patients-list-page.html',
  styleUrl: './patients-list-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientsListPage {
  readonly store = inject(PatientsStore);
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionService);
  readonly canCreate = this.permissions.can(PERMISSIONS.PATIENTS_CREATE);
  readonly search = new FormControl('', { nonNullable: true });

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(280), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((search) => void this.store.load({ search, page: 1 }));

    effect(() => {
      const clinicId = this.auth.activeClinicId();
      if (clinicId) {
        untracked(() => {
          this.store.reset();
          this.search.setValue('', { emitEvent: false });
          void this.store.load();
        });
      }
    });
  }

  setStatus(event: Event): void {
    void this.store.load({
      status: (event.target as HTMLSelectElement).value as PatientStatus,
      page: 1,
    });
  }

  setSort(event: Event): void {
    const [sortBy, sortOrder] = (event.target as HTMLSelectElement).value.split(':') as [
      PatientListQuery['sortBy'],
      PatientListQuery['sortOrder'],
    ];
    void this.store.load({ sortBy, sortOrder, page: 1 });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.store.pages() && page !== this.store.query().page) {
      void this.store.load({ page });
    }
  }

  clearSearch(): void {
    this.search.setValue('');
  }

  initials(firstName: string, lastName: string): string {
    return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  }

  relationshipLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }
}
