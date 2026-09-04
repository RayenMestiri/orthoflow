import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  model,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { GlobalSearchApiService } from './global-search.api';
import type {
  GlobalSearchCategory,
  GlobalSearchGroup,
  GlobalSearchResultItem,
  GlobalSearchResultType,
} from './global-search.models';

export interface SmartActionItem {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  category: 'CLINICAL' | 'ADMIN' | 'NAVIGATION';
  shortcutBadge: string;
  shortcutModifier?: string;
  shortcutKey?: string;
  route: string[];
  queryParams?: Record<string, string>;
  accent: 'pine' | 'appointment' | 'receipt' | 'today' | 'task' | 'followup' | 'report' | 'settings';
}

export interface QuickScopeItem {
  id: string;
  label: string;
  icon: string;
  prefix?: string;
  hint?: string;
}

export const SMART_ACTIONS: SmartActionItem[] = [
  {
    id: 'new-patient',
    icon: 'person_add',
    title: 'Nouveau Patient',
    subtitle: 'Créer un dossier patient et fiche administrative',
    category: 'CLINICAL',
    shortcutBadge: 'Alt + N',
    shortcutModifier: 'Alt',
    shortcutKey: 'N',
    route: ['/app/patients/new'],
    accent: 'pine',
  },
  {
    id: 'new-appointment',
    icon: 'event_available',
    title: 'Nouveau Rendez-vous',
    subtitle: 'Planifier une consultation ou une séance de soin',
    category: 'CLINICAL',
    shortcutBadge: 'Alt + A',
    shortcutModifier: 'Alt',
    shortcutKey: 'A',
    route: ['/app/schedule'],
    queryParams: { action: 'new' },
    accent: 'appointment',
  },
  {
    id: 'new-payment',
    icon: 'payments',
    title: 'Enregistrer un Paiement',
    subtitle: 'Émettre un reçu financier ou enregistrer un règlement',
    category: 'ADMIN',
    shortcutBadge: 'Ctrl + P',
    shortcutModifier: 'Ctrl',
    shortcutKey: 'P',
    route: ['/app/cash-records'],
    queryParams: { action: 'new' },
    accent: 'receipt',
  },
  {
    id: 'waiting-room',
    icon: 'meeting_room',
    title: "Salle d'attente du jour",
    subtitle: "Pointer les présences et file d'attente active",
    category: 'CLINICAL',
    shortcutBadge: 'Alt + S',
    shortcutModifier: 'Alt',
    shortcutKey: 'S',
    route: ['/app/today'],
    accent: 'today',
  },
  {
    id: 'tasks',
    icon: 'assignment_turned_in',
    title: 'Tâches & Délégations',
    subtitle: 'Consulter et attribuer les instructions de travail',
    category: 'CLINICAL',
    shortcutBadge: 'Alt + T',
    shortcutModifier: 'Alt',
    shortcutKey: 'T',
    route: ['/app/tasks'],
    accent: 'task',
  },
  {
    id: 'follow-ups',
    icon: 'ring_volume',
    title: 'Suivis & Relances',
    subtitle: 'Contacter les patients avec soins ou devis en attente',
    category: 'CLINICAL',
    shortcutBadge: 'Alt + F',
    shortcutModifier: 'Alt',
    shortcutKey: 'F',
    route: ['/app/follow-ups'],
    accent: 'followup',
  },
  {
    id: 'reports',
    icon: 'analytics',
    title: 'Rapports & Statistiques',
    subtitle: "Indicateurs d'activité, affluence et revenus",
    category: 'ADMIN',
    shortcutBadge: 'Alt + E',
    shortcutModifier: 'Alt',
    shortcutKey: 'E',
    route: ['/app/reports'],
    accent: 'report',
  },
  {
    id: 'settings',
    icon: 'settings',
    title: 'Configuration Cabinet',
    subtitle: 'Fauteuils, praticiens, actes et préférences',
    category: 'ADMIN',
    shortcutBadge: 'Alt + G',
    shortcutModifier: 'Alt',
    shortcutKey: 'G',
    route: ['/app/settings'],
    accent: 'settings',
  },
];

export const QUICK_SCOPES: QuickScopeItem[] = [
  { id: 'all', label: 'Tous', icon: 'auto_awesome', prefix: '', hint: 'Recherche globale' },
  { id: 'patients', label: 'Patients', icon: 'person', prefix: '', hint: 'Nom ou tél.' },
  { id: 'receipts', label: 'Reçus (REC-...)', icon: 'receipt_long', prefix: 'REC-', hint: 'Reçus financiers' },
  { id: 'treatments', label: 'Traitements', icon: 'medical_services', prefix: 'TRT-', hint: 'Plans de traitement' },
  { id: 'appointments', label: 'Rendez-vous', icon: 'event', prefix: 'RDV', hint: 'Agenda' },
];

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.scss',
})
export class GlobalSearchComponent {
  private readonly searchApi = inject(GlobalSearchApiService);
  private readonly router = inject(Router);

  readonly isOpen = model<boolean>(false);

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly groups = signal<GlobalSearchGroup[]>([]);
  readonly selectedIndex = signal<number>(0);
  readonly selectedSmartActionIndex = signal<number>(0);
  readonly activeScope = signal<string>('all');
  readonly currentQuery = signal<string>('');

  readonly smartActions: SmartActionItem[] = SMART_ACTIONS;
  readonly quickScopes: QuickScopeItem[] = QUICK_SCOPES;

  readonly flattenedItems = computed<GlobalSearchResultItem[]>(() => {
    return this.groups().flatMap((g) => g.items);
  });

  readonly hasResults = computed<boolean>(() => {
    return this.flattenedItems().length > 0;
  });

  readonly isQueryTooShort = computed<boolean>(() => {
    return this.currentQuery().trim().length < 2;
  });

  constructor() {
    // Focus search input when opened
    effect(() => {
      if (this.isOpen()) {
        this.selectedSmartActionIndex.set(0);
        setTimeout(() => {
          this.searchInputRef?.nativeElement?.focus();
          this.searchInputRef?.nativeElement?.select();
        }, 50);
      } else {
        this.searchControl.setValue('');
        this.groups.set([]);
        this.error.set(null);
        this.currentQuery.set('');
        this.selectedIndex.set(0);
        this.selectedSmartActionIndex.set(0);
        this.activeScope.set('all');
      }
    });

    // Reactive debounced search with switchMap to prevent stale responses
    this.searchControl.valueChanges
      .pipe(
        tap((value) => {
          this.currentQuery.set(value);
          if (!value) {
            this.activeScope.set('all');
          }
        }),
        debounceTime(220),
        distinctUntilChanged(),
        tap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < 2) {
            this.groups.set([]);
            this.loading.set(false);
            this.error.set(null);
            this.selectedIndex.set(0);
          } else {
            this.loading.set(true);
            this.error.set(null);
          }
        }),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < 2) {
            return of(null);
          }
          return this.searchApi.search(trimmed, 5).pipe(
            catchError(() => {
              this.error.set('La recherche est temporairement indisponible.');
              this.loading.set(false);
              return of(null);
            }),
          );
        }),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (res) {
          this.groups.set(res.groups);
          this.selectedIndex.set(0);
        }
      });
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        this.open();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    // Direct key combinations: Ctrl+P or Alt+P -> Payment
    if (
      ((event.ctrlKey || event.metaKey) && (event.key === 'p' || event.key === 'P')) ||
      (event.altKey && (event.key === 'p' || event.key === 'P'))
    ) {
      event.preventDefault();
      const action = this.smartActions.find((a) => a.id === 'new-payment');
      if (action) this.executeSmartAction(action);
      return;
    }

    // Alt+A (Agenda - no NVIDIA clash!) or Alt+R -> Appointment
    if (
      (event.altKey && (event.key === 'a' || event.key === 'A' || event.key === 'r' || event.key === 'R')) ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'a' || event.key === 'A'))
    ) {
      event.preventDefault();
      const action = this.smartActions.find((a) => a.id === 'new-appointment');
      if (action) this.executeSmartAction(action);
      return;
    }

    // Alt+N -> New Patient
    if (event.altKey && (event.key === 'n' || event.key === 'N')) {
      event.preventDefault();
      const action = this.smartActions.find((a) => a.id === 'new-patient');
      if (action) this.executeSmartAction(action);
      return;
    }

    // Keyboard navigation when search is in empty query state (Smart Moves)
    if (this.isQueryTooShort()) {
      const actions = this.smartActions;
      if (actions.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = (this.selectedSmartActionIndex() + 1) % actions.length;
        this.selectedSmartActionIndex.set(nextIndex);
        this.scrollActiveSmartActionIntoView();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prevIndex = (this.selectedSmartActionIndex() - 1 + actions.length) % actions.length;
        this.selectedSmartActionIndex.set(prevIndex);
        this.scrollActiveSmartActionIntoView();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const selected = actions[this.selectedSmartActionIndex()];
        if (selected) {
          this.executeSmartAction(selected);
        }
      }
      return;
    }

    const items = this.flattenedItems();
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (this.selectedIndex() + 1) % items.length;
      this.selectedIndex.set(nextIndex);
      this.scrollActiveItemIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = (this.selectedIndex() - 1 + items.length) % items.length;
      this.selectedIndex.set(prevIndex);
      this.scrollActiveItemIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = items[this.selectedIndex()];
      if (selected) {
        this.selectItem(selected);
      }
    }
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.activeScope.set('all');
    this.searchInputRef?.nativeElement?.focus();
  }

  retry(): void {
    const query = this.searchControl.value.trim();
    if (query.length >= 2) {
      this.loading.set(true);
      this.error.set(null);
      this.searchApi
        .search(query, 5)
        .pipe(
          catchError(() => {
            this.error.set('La recherche est temporairement indisponible.');
            this.loading.set(false);
            return of(null);
          }),
        )
        .subscribe((res) => {
          this.loading.set(false);
          if (res) {
            this.groups.set(res.groups);
            this.selectedIndex.set(0);
          }
        });
    }
  }

  getItemGlobalIndex(item: GlobalSearchResultItem): number {
    return this.flattenedItems().findIndex((i) => i.id === item.id && i.type === item.type);
  }

  isItemSelected(item: GlobalSearchResultItem): boolean {
    return this.getItemGlobalIndex(item) === this.selectedIndex();
  }

  onItemHover(item: GlobalSearchResultItem): void {
    const idx = this.getItemGlobalIndex(item);
    if (idx !== -1) {
      this.selectedIndex.set(idx);
    }
  }

  selectItem(item: GlobalSearchResultItem): void {
    this.close();
    if (item.queryParams && Object.keys(item.queryParams).length > 0) {
      this.router.navigate(item.route, { queryParams: item.queryParams });
    } else {
      this.router.navigate(item.route);
    }
  }

  getTypeIcon(type: GlobalSearchResultType): string {
    switch (type) {
      case 'PATIENT':
        return 'person';
      case 'RECEIPT':
        return 'receipt_long';
      case 'TREATMENT':
        return 'medical_services';
      case 'APPOINTMENT':
        return 'event';
      case 'DOCUMENT':
        return 'folder_shared';
      default:
        return 'search';
    }
  }

  getCategoryIcon(category: GlobalSearchCategory): string {
    switch (category) {
      case 'PATIENTS':
        return 'people';
      case 'RECEIPTS':
        return 'payments';
      case 'TREATMENTS':
        return 'healing';
      case 'APPOINTMENTS':
        return 'calendar_month';
      case 'DOCUMENTS':
        return 'description';
      default:
        return 'category';
    }
  }

  executeSmartAction(action: SmartActionItem): void {
    this.close();
    if (action.queryParams && Object.keys(action.queryParams).length > 0) {
      this.router.navigate(action.route, { queryParams: action.queryParams });
    } else {
      this.router.navigate(action.route);
    }
  }

  applyScopeFilter(scope: QuickScopeItem): void {
    this.activeScope.set(scope.id);
    if (scope.prefix) {
      this.searchControl.setValue(scope.prefix);
    } else {
      this.searchControl.setValue('');
    }
    this.searchInputRef?.nativeElement?.focus();
  }

  onSmartActionHover(index: number): void {
    this.selectedSmartActionIndex.set(index);
  }

  isSmartActionSelected(index: number): boolean {
    return this.selectedSmartActionIndex() === index;
  }

  private scrollActiveSmartActionIntoView(): void {
    setTimeout(() => {
      const el = document.querySelector('.cmd-smart-card--selected');
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);
  }

  private scrollActiveItemIntoView(): void {
    setTimeout(() => {
      const el = document.querySelector('.cmd-item--selected');
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);
  }
}
