import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReportSeriesChart } from './report-series-chart';

describe('ReportSeriesChart', () => {
  it('maps each series point to an accessible bar and data row', async () => {
    await TestBed.configureTestingModule({ imports: [ReportSeriesChart] }).compileComponents();
    const fixture = TestBed.createComponent(ReportSeriesChart);
    fixture.componentRef.setInput('title', 'Appointments per day');
    fixture.componentRef.setInput('series', [
      { bucket: '2026-08-01T00:00:00.000Z', value: 4 },
      { bucket: '2026-08-02T00:00:00.000Z', value: 7 },
    ]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('svg rect')).toHaveLength(2);
    expect(element.querySelector('svg')?.getAttribute('aria-label')).toBe('Appointments per day');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(element.textContent).toContain('7');
  });

  it('renders an explicit no-activity state for an empty series', async () => {
    await TestBed.configureTestingModule({ imports: [ReportSeriesChart] }).compileComponents();
    const fixture = TestBed.createComponent(ReportSeriesChart);
    fixture.componentRef.setInput('title', 'Cash per month');
    fixture.componentRef.setInput('series', []);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Aucune activité sur cette période',
    );
  });
});
