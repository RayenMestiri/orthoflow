import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  AppointmentStatus,
  FlowGroup,
  ReceptionBoard,
  ReceptionRow,
} from '../models/reception.models';
import { ReceptionApiService } from './reception.api';

/** How often the board re-reads the server. */
const POLL_INTERVAL_MS = 45_000;
/** How often displayed durations tick. Local only — no request. */
const CLOCK_INTERVAL_MS = 30_000;

/**
 * Owns today's clinic flow.
 *
 * TWO SEPARATE TIMERS, ON PURPOSE. The board is refetched every 45s because
 * another member of staff may have moved someone; the displayed durations tick
 * every 30s from a local clock. Sending a request just to turn "12 min" into
 * "13 min" would put a whole clinic's reception on a per-minute poll for a
 * number the browser can already work out.
 *
 * Both are cleared through `DestroyRef`, so leaving the page stops the polling.
 */
@Injectable()
export class ReceptionStore {
  private readonly api = inject(ReceptionApiService);

  private readonly boardState = signal<ReceptionBoard | null>(null);
  private readonly loadingState = signal(false);
  private readonly loadedState = signal(false);
  private readonly errorState = signal<string | null>(null);
  /** Per-row in-flight action, so one row's spinner never blocks another. */
  private readonly pendingState = signal<Record<string, boolean>>({});
  private readonly rowErrorState = signal<Record<string, string>>({});
  /** Ticks so duration computeds re-evaluate. */
  private readonly nowState = signal(Date.now());

  private requestId = 0;

  readonly board = this.boardState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly isLoaded = this.loadedState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly now = this.nowState.asReadonly();

  readonly summary = computed(() => this.boardState()?.summary ?? null);
  readonly rows = computed(() => this.boardState()?.rows ?? []);
  readonly isEmptyDay = computed(() => this.loadedState() && this.rows().length === 0);

  /** Rows bucketed by section, so the template does no grouping work. */
  readonly byGroup = computed<Record<FlowGroup, ReceptionRow[]>>(() => {
    const grouped: Record<FlowGroup, ReceptionRow[]> = {
      IN_TREATMENT: [],
      WAITING: [],
      ARRIVED: [],
      LATE: [],
      UPCOMING: [],
      COMPLETED: [],
      CLOSED: [],
    };
    for (const row of this.rows()) {
      grouped[row.flowGroup].push(row);
    }
    return grouped;
  });

  /**
   * The next patient due.
   *
   * Whoever is already waiting comes first — they are here — and only then the
   * earliest upcoming slot.
   */
  readonly nextPatient = computed<ReceptionRow | null>(() => {
    const grouped = this.byGroup();
    return grouped.WAITING[0] ?? grouped.ARRIVED[0] ?? grouped.UPCOMING[0] ?? null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    const poll = setInterval(() => void this.load(true), POLL_INTERVAL_MS);
    const clock = setInterval(() => this.nowState.set(Date.now()), CLOCK_INTERVAL_MS);

    destroyRef.onDestroy(() => {
      clearInterval(poll);
      clearInterval(clock);
    });
  }

  isPending(appointmentId: string): boolean {
    return this.pendingState()[appointmentId] === true;
  }

  rowError(appointmentId: string): string | null {
    return this.rowErrorState()[appointmentId] ?? null;
  }

  /**
   * Reads the board.
   *
   * `background` refreshes keep the current rows on screen while the request is
   * in flight, so a poll never blanks a board someone is working from.
   */
  async load(background = false): Promise<void> {
    const requestId = ++this.requestId;
    if (!background) {
      this.loadingState.set(true);
    }
    this.errorState.set(null);
    try {
      const board = await firstValueFrom(this.api.today());
      if (requestId !== this.requestId) return;
      this.boardState.set(board);
      this.loadedState.set(true);
      this.nowState.set(Date.now());
    } catch (error) {
      if (requestId !== this.requestId) return;
      // A failed background poll must not wipe a board that is still readable.
      if (!background || !this.loadedState()) {
        this.errorState.set(getApiProblem(error).message);
      }
    } finally {
      if (requestId === this.requestId) this.loadingState.set(false);
    }
  }

  /**
   * Moves one appointment along the lifecycle.
   *
   * The row is marked pending rather than optimistically restyled: an arrival
   * that silently failed is worse than one that took a moment, because the desk
   * would believe the patient is checked in.
   */
  async changeStatus(appointmentId: string, status: AppointmentStatus): Promise<boolean> {
    if (this.isPending(appointmentId)) {
      return false;
    }
    this.setPending(appointmentId, true);
    this.clearRowError(appointmentId);
    try {
      await firstValueFrom(this.api.changeStatus(appointmentId, status));
      await this.load(true);
      return true;
    } catch (error) {
      this.setRowError(appointmentId, getApiProblem(error).message);
      return false;
    } finally {
      this.setPending(appointmentId, false);
    }
  }

  async cancel(appointmentId: string, reason: string): Promise<boolean> {
    if (this.isPending(appointmentId)) {
      return false;
    }
    this.setPending(appointmentId, true);
    this.clearRowError(appointmentId);
    try {
      await firstValueFrom(this.api.cancel(appointmentId, reason));
      await this.load(true);
      return true;
    } catch (error) {
      this.setRowError(appointmentId, getApiProblem(error).message);
      return false;
    } finally {
      this.setPending(appointmentId, false);
    }
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  clearRowError(appointmentId: string): void {
    this.rowErrorState.update((errors) => {
      const next = { ...errors };
      delete next[appointmentId];
      return next;
    });
  }

  private setPending(appointmentId: string, pending: boolean): void {
    this.pendingState.update((state) => ({ ...state, [appointmentId]: pending }));
  }

  private setRowError(appointmentId: string, message: string): void {
    this.rowErrorState.update((errors) => ({ ...errors, [appointmentId]: message }));
  }
}
