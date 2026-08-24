import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { ReportSeriesPoint } from '../../models/reports.models';

export interface ChartBarViewModel {
  bucket: string;
  value: number;
  rate: number | null | undefined;
  denominator: number | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
  dateLabel: string;
  dayOfWeek: string;
  displayValue: string;
  subLabel?: string;
  isZero: boolean;
}

export interface YTickViewModel {
  value: number;
  displayLabel: string;
  y: number;
}

@Component({
  selector: 'app-report-series-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-series-chart.html',
  styleUrl: './report-series-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportSeriesChart {
  readonly title = input.required<string>();
  readonly series = input.required<ReportSeriesPoint[]>();
  readonly tone = input<'pine' | 'coral'>('pine');
  readonly isMoney = input(false);
  readonly isRate = input(false);
  readonly currency = input('EUR');
  readonly valueSuffix = input('');

  readonly hoveredIndex = signal<number | null>(null);

  private readonly plotBounds = {
    left: 62,
    right: 710,
    top: 36,
    bottom: 200,
    height: 164,
  };

  readonly maxScaleValue = computed(() => {
    const rows = this.series();
    if (!rows.length) return 5;
    const rawMax = Math.max(0, ...rows.map((r) => (this.isMoney() ? r.value / 100 : r.value)));
    if (rawMax <= 0) return 5;
    if (rawMax <= 5) return 5;
    if (rawMax <= 10) return 10;
    if (rawMax <= 20) return 20;
    if (rawMax <= 50) return 50;
    if (rawMax <= 100) return 100;
    // Round up to nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    return Math.ceil(rawMax / magnitude) * magnitude;
  });

  readonly yTicks = computed<YTickViewModel[]>(() => {
    const max = this.maxScaleValue();
    const count = 4;
    const ticks: YTickViewModel[] = [];
    for (let i = 0; i <= count; i++) {
      const val = Math.round((max / count) * i);
      const y = this.plotBounds.bottom - (val / max) * this.plotBounds.height;
      let displayLabel = val.toString();
      if (this.isMoney()) {
        displayLabel = val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)} k€` : `${val} €`;
      }
      ticks.push({ value: val, displayLabel, y });
    }
    return ticks;
  });

  readonly bars = computed<ChartBarViewModel[]>(() => {
    const rows = this.series();
    if (!rows.length) return [];

    const max = this.maxScaleValue();
    const availableWidth = this.plotBounds.right - this.plotBounds.left;
    const slotWidth = availableWidth / rows.length;
    const barWidth = Math.max(8, Math.min(48, slotWidth * 0.65));

    return rows.map((row, index) => {
      const rawVal = this.isMoney() ? row.value / 100 : row.value;
      const height = Math.max(0, (rawVal / max) * this.plotBounds.height);
      const x = this.plotBounds.left + index * slotWidth + (slotWidth - barWidth) / 2;
      const y = this.plotBounds.bottom - height;
      const labelX = x + barWidth / 2;
      const labelY = Math.max(22, y - 6);

      let displayValue: string;
      if (this.isMoney()) {
        displayValue = this.formatCurrency(row.value);
      } else if (this.isRate() && row.rate !== undefined && row.rate !== null) {
        displayValue = `${row.value} (${row.rate}%)`;
      } else {
        displayValue = `${row.value}${this.valueSuffix()}`;
      }

      let subLabel: string | undefined;
      if (row.rate !== undefined && row.rate !== null && !this.isRate()) {
        subLabel = `${row.rate}%`;
      }

      const dateObj = new Date(row.bucket);
      const dateLabel = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
      }).format(dateObj);

      const dayOfWeek = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short',
      }).format(dateObj);

      return {
        bucket: row.bucket,
        value: row.value,
        rate: row.rate,
        denominator: row.denominator,
        x,
        y,
        width: barWidth,
        height,
        labelX,
        labelY,
        dateLabel,
        dayOfWeek,
        displayValue,
        subLabel,
        isZero: row.value === 0,
      };
    });
  });

  setHover(index: number | null): void {
    this.hoveredIndex.set(index);
  }

  formatBucket(value: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'long',
    }).format(new Date(value));
  }

  formatCurrency(minor: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: this.currency(),
      maximumFractionDigits: 0,
    }).format(minor / 100);
  }
}
