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
  readonly currentQuery = signal<string>('');

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
      }
    });

    // Reactive debounced search with switchMap to prevent stale responses
    this.searchControl.valueChanges
      .pipe(
        tap((value) => this.currentQuery.set(value)),
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

  private scrollActiveItemIntoView(): void {
    setTimeout(() => {
      const el = document.querySelector('.cmd-item--selected');
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);
  }
}
