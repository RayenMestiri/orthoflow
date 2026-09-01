import { describe, expect, it } from 'vitest';
import { PortalTreatmentTimelineComponent } from './portal-treatment-timeline.component';

describe('PortalTreatmentTimelineComponent', () => {
  it('identifies planned step correctly', () => {
    const comp = new PortalTreatmentTimelineComponent();
    comp.data = {
      label: 'Bagues métalliques',
      status: 'PLANNED',
      startDate: null,
      expectedEndDate: null,
      completionDate: null,
    };
    expect(comp['isStepActive'](1)).toBe(true);
    expect(comp['isStepCompleted'](1)).toBe(false);
  });

  it('identifies in-progress step correctly', () => {
    const comp = new PortalTreatmentTimelineComponent();
    comp.data = {
      label: 'Aligners invisibles',
      status: 'IN_PROGRESS',
      startDate: '2026-01-10T10:00:00.000Z',
      expectedEndDate: '2027-01-10T10:00:00.000Z',
      completionDate: null,
    };
    expect(comp['isStepActive'](2)).toBe(true);
    expect(comp['isStepCompleted'](1)).toBe(true);
    expect(comp['isStepCompleted'](2)).toBe(false);
  });

  it('identifies retention step correctly', () => {
    const comp = new PortalTreatmentTimelineComponent();
    comp.data = {
      label: 'Contention',
      status: 'ACTIVE',
      startDate: '2025-01-10T10:00:00.000Z',
      expectedEndDate: null,
      completionDate: null,
      retention: {
        status: 'ACTIVE',
        nextRecommendedControlAt: '2026-11-01T09:00:00.000Z',
      },
    };
    expect(comp['isStepActive'](3)).toBe(true);
    expect(comp['isStepCompleted'](2)).toBe(true);
  });
});
