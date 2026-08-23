import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { formatMinor } from '../../../cash-records/utils/money-format.util';
import { ReportPeriodSelector } from '../../components/period-selector/period-selector';
import { ReportSeriesChart } from '../../components/report-series-chart/report-series-chart';
import { ReportsStore } from '../../data-access/reports.store';
import type { ReportMetric, ReportPreset, ReportQuery } from '../../models/reports.models';

const PRESETS: readonly ReportPreset[] = [
  'this-month',
  'last-month',
  'last-3-months',
  'last-6-months',
  'this-year',
  'custom',
];

@Component({
  selector: 'app-reports-page',
  imports: [ReportPeriodSelector, ReportSeriesChart],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  readonly store = inject(ReportsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly query = signal<ReportQuery>({ preset: 'this-month' });

  readonly hasAnyData = computed(
    () =>
      Boolean(this.store.overview().data) ||
      Boolean(this.store.appointments().data) ||
      Boolean(this.store.treatments().data) ||
      Boolean(this.store.finance().data) ||
      Boolean(this.store.continuity().data),
  );

  readonly hasPeriodActivity = computed(() => {
    const appointments = this.store.appointments().data;
    const overview = this.store.overview().data;
    const treatments = this.store.treatments().data;
    const finance = this.store.finance().data;
    return Boolean(
      (appointments?.booked.value ?? 0) ||
        (overview?.completedClinicalVisits.value ?? 0) ||
        (overview?.newPatients.value ?? 0) ||
        (treatments?.treatments.started.value ?? 0) ||
        (treatments?.retention.started.value ?? 0) ||
        (finance?.paymentCount.value ?? 0),
    );
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const preset = params.get('preset') as ReportPreset | null;
      const from = params.get('from');
      const to = params.get('to');
      const query: ReportQuery =
        from && to
          ? { preset: 'custom', from, to }
          : { preset: preset && PRESETS.includes(preset) ? preset : 'this-month' };
      this.query.set(query);
      void this.store.load(query);
    });
  }

  protected selectPeriod(query: ReportQuery): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams:
        query.preset === 'custom'
          ? { from: query.from, to: query.to }
          : { preset: query.preset ?? 'this-month' },
    });
  }

  protected comparison(metric: ReportMetric): string | null {
    if (metric.previousValue === null || metric.absoluteChange === null) return null;
    const change = metric.percentChange ?? metric.absoluteChange;
    const prefix = change > 0 ? '+' : '';
    const suffix = metric.percentChange === null ? '' : '%';
    return `${prefix}${change}${suffix} vs période précédente`;
  }

  protected formatMoney(amountMinor: number, currency = 'TND'): string {
    return `${formatMinor(amountMinor, currency)} ${currency}`;
  }

  protected reasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      NO_RECENT_VISIT: 'Sans visite clinique récente',
      NO_FUTURE_APPOINTMENT: 'Sans prochain rendez-vous',
      RETENTION_CONTROL_OVERDUE: 'Contrôle de contention en retard',
      MISSED_NOT_REBOOKED: 'Rendez-vous manqué non reprogrammé',
    };
    return labels[reason] ?? reason.replaceAll('_', ' ').toLowerCase();
  }
}
