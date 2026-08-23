import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ReportPreset, ReportQuery } from '../../models/reports.models';

@Component({
  selector: 'app-report-period-selector',
  imports: [FormsModule],
  templateUrl: './period-selector.html',
  styleUrl: './period-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportPeriodSelector {
  readonly query = input.required<ReportQuery>();
  readonly queryChange = output<ReportQuery>();
  readonly customOpen = signal(false);
  readonly customFrom = signal('');
  readonly customTo = signal('');

  readonly presets: { value: ReportPreset; label: string }[] = [
    { value: 'this-month', label: 'Ce mois' },
    { value: 'last-month', label: 'Mois dernier' },
    { value: 'last-3-months', label: '3 derniers mois' },
    { value: 'last-6-months', label: '6 derniers mois' },
    { value: 'this-year', label: 'Cette année' },
    { value: 'custom', label: 'Période personnalisée' },
  ];

  constructor() {
    effect(() => {
      const query = this.query();
      if (query.from) this.customFrom.set(query.from);
      if (query.to) this.customTo.set(query.to);
      this.customOpen.set(query.preset === 'custom');
    });
  }

  choose(value: string): void {
    const preset = value as ReportPreset;
    this.customOpen.set(preset === 'custom');
    if (preset !== 'custom') this.queryChange.emit({ preset });
  }

  applyCustom(): void {
    const from = this.customFrom();
    const to = this.customTo();
    if (!from || !to || from > to) return;
    this.queryChange.emit({ preset: 'custom', from, to });
  }
}
