import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ReportSeriesPoint } from '../../models/reports.models';

@Component({
  selector: 'app-report-series-chart',
  templateUrl: './report-series-chart.html',
  styleUrl: './report-series-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportSeriesChart {
  readonly title = input.required<string>();
  readonly series = input.required<ReportSeriesPoint[]>();
  readonly tone = input<'pine' | 'coral'>('pine');
  readonly valueSuffix = input('');

  readonly bars = computed(() => {
    const rows = this.series();
    const max = Math.max(1, ...rows.map((row) => row.value));
    const width = rows.length ? 620 / rows.length : 620;
    return rows.map((row, index) => {
      const height = (row.value / max) * 154;
      return {
        ...row,
        x: 58 + index * width + width * 0.16,
        y: 184 - height,
        width: Math.max(3, width * 0.68),
        height,
      };
    });
  });

  formatBucket(value: string): string {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value));
  }
}
