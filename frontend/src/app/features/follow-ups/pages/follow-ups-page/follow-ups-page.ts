import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { getApiProblem } from '../../../../core/http/api-error';
import { FollowUpsApiService } from '../../data-access/follow-ups-api.service';
import type { FollowUpFilter, FollowUpResult, FollowUpSort } from '../../models/follow-up.models';

@Component({
  selector: 'app-follow-ups-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './follow-ups-page.html',
  styleUrl: './follow-ups-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FollowUpsPage {
  private readonly api = inject(FollowUpsApiService);
  private readonly permissions = inject(PermissionService);
  protected readonly result = signal<FollowUpResult | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<FollowUpFilter>('NEEDS_SCHEDULING');
  protected readonly sort = signal<FollowUpSort>('MOST_OVERDUE');
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly canOpenSource = this.permissions.can(PERMISSIONS.CLINICAL_VISITS_VIEW);
  protected readonly canSchedule = this.permissions.can(PERMISSIONS.APPOINTMENTS_UPDATE);
  protected readonly filters: { value: FollowUpFilter; label: string }[] = [
    { value: 'NEEDS_SCHEDULING', label: 'Needs scheduling' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'DUE_SOON', label: 'Due soon' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'ALL', label: 'All' },
  ];
  protected readonly emptyTitle = computed(() =>
    this.filter() === 'ALL' ? 'No follow-ups yet' : 'You’re all caught up',
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.result.set(
        await firstValueFrom(
          this.api.list({
            page: this.page(),
            limit: 20,
            filter: this.filter(),
            sort: this.sort(),
            ...(this.search().trim() ? { search: this.search().trim() } : {}),
          }),
        ),
      );
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected chooseFilter(filter: FollowUpFilter): void {
    this.filter.set(filter);
    this.page.set(1);
    void this.load();
  }

  protected searchChanged(value: string): void {
    this.search.set(value);
    this.page.set(1);
    void this.load();
  }

  protected sortChanged(value: string): void {
    this.sort.set(value as FollowUpSort);
    this.page.set(1);
    void this.load();
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    void this.load();
  }

  protected stateLabel(state: string): string {
    return state
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (letter) => letter.toUpperCase());
  }
}
