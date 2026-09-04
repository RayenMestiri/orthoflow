import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalSearchApiService } from './global-search.api';
import { GlobalSearchComponent } from './global-search.component';
import type { GlobalSearchResponse } from './global-search.models';

describe('GlobalSearchComponent (Command Center)', () => {
  let component: GlobalSearchComponent;
  let fixture: ComponentFixture<GlobalSearchComponent>;
  let searchApi: GlobalSearchApiService;
  let router: Router;

  const mockResponse: GlobalSearchResponse = {
    query: 'rayen',
    totalMatches: 2,
    groups: [
      {
        category: 'PATIENTS',
        label: 'Patients',
        items: [
          {
            id: 'pat-1',
            type: 'PATIENT',
            title: 'Rayen Mestiri',
            subtitle: '15 ans · +216 22 000 000',
            badge: 'PAT-0001',
            meta: '+216 22 000 000',
            patientId: 'pat-1',
            patientName: 'Rayen Mestiri',
            targetId: 'pat-1',
            target: 'PATIENT_PROFILE',
            route: ['/app/patients', 'pat-1'],
            queryParams: null,
          },
        ],
      },
      {
        category: 'RECEIPTS',
        label: 'Reçus & Règlements',
        items: [
          {
            id: 'rec-1',
            type: 'RECEIPT',
            title: 'REC-2026-000052',
            subtitle: '200.000 TND · Rayen Mestiri',
            badge: 'Émis',
            meta: '12 août 2026',
            patientId: 'pat-1',
            patientName: 'Rayen Mestiri',
            targetId: 'rec-1',
            target: 'RECEIPT_DETAIL',
            route: ['/app/patients', 'pat-1'],
            queryParams: { tab: 'payments' },
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [GlobalSearchComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: {
            navigate: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GlobalSearchComponent);
    component = fixture.componentInstance;
    searchApi = TestBed.inject(GlobalSearchApiService);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on Ctrl+K and closes on Escape', () => {
    expect(component.isOpen()).toBe(false);

    // Trigger Ctrl+K
    const ctrlKEvent = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    window.dispatchEvent(ctrlKEvent);
    expect(component.isOpen()).toBe(true);

    // Trigger Escape
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(escEvent);
    expect(component.isOpen()).toBe(false);
  });

  it('debounces search input and populates results', async () => {
    vi.spyOn(searchApi, 'search').mockReturnValue(of(mockResponse));

    component.open();
    fixture.detectChanges();

    component.searchControl.setValue('rayen');
    vi.advanceTimersByTime(250);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(searchApi.search).toHaveBeenCalledWith('rayen', 5);
    expect(component.groups().length).toBe(2);
    expect(component.flattenedItems().length).toBe(2);
    expect(component.hasResults()).toBe(true);
  });

  it('supports keyboard navigation with ArrowDown, ArrowUp and Enter', async () => {
    vi.spyOn(searchApi, 'search').mockReturnValue(of(mockResponse));

    component.open();
    fixture.detectChanges();

    component.searchControl.setValue('rayen');
    vi.advanceTimersByTime(250);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedIndex()).toBe(0);

    // Arrow down moves to second item (Receipt)
    const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    window.dispatchEvent(downEvent);
    expect(component.selectedIndex()).toBe(1);

    // Arrow up moves back to first item (Patient)
    const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    window.dispatchEvent(upEvent);
    expect(component.selectedIndex()).toBe(0);

    // Enter selects the first item
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    window.dispatchEvent(enterEvent);

    expect(router.navigate).toHaveBeenCalledWith(['/app/patients', 'pat-1']);
    expect(component.isOpen()).toBe(false);
  });

  it('handles query parameters on item selection (e.g. Receipt tab)', async () => {
    vi.spyOn(searchApi, 'search').mockReturnValue(of(mockResponse));

    component.open();
    fixture.detectChanges();

    component.searchControl.setValue('rayen');
    vi.advanceTimersByTime(250);
    fixture.detectChanges();
    await fixture.whenStable();

    // Select the receipt item directly
    const receiptItem = mockResponse.groups[1].items[0];
    component.selectItem(receiptItem);

    expect(router.navigate).toHaveBeenCalledWith(['/app/patients', 'pat-1'], {
      queryParams: { tab: 'payments' },
    });
    expect(component.isOpen()).toBe(false);
  });

  it('displays error state and provides retry action on failure', async () => {
    vi.spyOn(searchApi, 'search').mockReturnValue(throwError(() => new Error('Server error')));

    component.open();
    fixture.detectChanges();

    component.searchControl.setValue('rayen');
    vi.advanceTimersByTime(250);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.error()).toBe('La recherche est temporairement indisponible.');
    expect(component.groups().length).toBe(0);

    // Retry with success
    vi.spyOn(searchApi, 'search').mockReturnValue(of(mockResponse));
    component.retry();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.error()).toBeNull();
    expect(component.groups().length).toBe(2);
  });

  it('renders empty result state when no matches are found', async () => {
    vi.spyOn(searchApi, 'search').mockReturnValue(
      of({ query: 'nonexistent', totalMatches: 0, groups: [] }),
    );

    component.open();
    fixture.detectChanges();

    component.searchControl.setValue('nonexistent');
    vi.advanceTimersByTime(250);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasResults()).toBe(false);
    expect(component.isQueryTooShort()).toBe(false);
  });

  it('renders Smart Moves and Quick Scopes when query is empty', () => {
    component.open();
    fixture.detectChanges();

    expect(component.isQueryTooShort()).toBe(true);
    expect(component.smartActions.length).toBeGreaterThanOrEqual(6);
    expect(component.quickScopes.length).toBeGreaterThanOrEqual(4);

    const el: HTMLElement = fixture.nativeElement;
    const smartCards = el.querySelectorAll('.cmd-smart-card');
    const scopeChips = el.querySelectorAll('.cmd-scope-chip');

    expect(smartCards.length).toBe(component.smartActions.length);
    expect(scopeChips.length).toBe(component.quickScopes.length);
  });

  it('supports keyboard navigation and execution for Smart Moves when query is empty', () => {
    component.open();
    fixture.detectChanges();

    expect(component.selectedSmartActionIndex()).toBe(0);

    // Arrow down moves to next Smart Move
    const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    window.dispatchEvent(downEvent);
    expect(component.selectedSmartActionIndex()).toBe(1);

    // Arrow up moves back to first Smart Move
    const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    window.dispatchEvent(upEvent);
    expect(component.selectedSmartActionIndex()).toBe(0);

    // Enter executes the first Smart Move (Nouveau Patient)
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    window.dispatchEvent(enterEvent);

    expect(router.navigate).toHaveBeenCalledWith(['/app/patients/new']);
    expect(component.isOpen()).toBe(false);
  });

  it('executes smart action with queryParams (e.g. nouveau rdv or paiement)', () => {
    component.open();
    fixture.detectChanges();

    const appointmentAction = component.smartActions.find((a) => a.id === 'new-appointment');
    expect(appointmentAction).toBeDefined();

    if (appointmentAction) {
      component.executeSmartAction(appointmentAction);
      expect(router.navigate).toHaveBeenCalledWith(['/app/schedule'], {
        queryParams: { action: 'new' },
      });
      expect(component.isOpen()).toBe(false);
    }
  });

  it('applies scope filter and updates search control on scope click', () => {
    component.open();
    fixture.detectChanges();

    const receiptScope = component.quickScopes.find((s) => s.prefix === 'REC-');
    expect(receiptScope).toBeDefined();

    if (receiptScope) {
      component.applyScopeFilter(receiptScope);
      expect(component.activeScope()).toBe(receiptScope.id);
      expect(component.searchControl.value).toBe('REC-');
    }
  });

  it('triggers payment action on Ctrl+P key combination', () => {
    component.open();
    fixture.detectChanges();

    const ctrlPEvent = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true });
    window.dispatchEvent(ctrlPEvent);

    expect(router.navigate).toHaveBeenCalledWith(['/app/cash-records'], {
      queryParams: { action: 'new' },
    });
    expect(component.isOpen()).toBe(false);
  });
});
