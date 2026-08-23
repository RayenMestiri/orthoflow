import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildOverview, PortalConsent, PortalFinance } from '../models/portal.models';
import { PortalDatePipe } from '../presentation/portal-date.pipe';
@Component({
  selector: 'app-portal-child-page',
  imports: [PortalDatePipe],
  template: `<section class="portal-page">
    @if (loading()) {
      <div class="portal-empty">Loading care overview…</div>
    } @else if (error()) {
      <div class="portal-error">{{ error() }}</div>
    } @else if (overview(); as data) {
      <p class="portal-kicker">Care overview</p>
      <h1 class="portal-title">{{ data.child.fullName }}</h1>
      <p class="portal-lede">Last refreshed from {{ data.clinic.name }}.</p>
      <div class="portal-grid">
        <article class="portal-card">
          <h2>Treatment</h2>
          @if (data.child.treatment; as treatment) {
            <p>
              <strong>{{ treatment.label }}</strong>
            </p>
            <span class="portal-status">{{ friendly(treatment.status) }}</span>
            <div class="portal-row">
              <span>Started</span
              ><strong>{{
                treatment.startDate
                  ? (treatment.startDate | portalDate: data.clinic.timezone : 'date')
                  : '—'
              }}</strong>
            </div>
            <div class="portal-row">
              <span>Expected end</span
              ><strong>{{
                treatment.expectedEndDate
                  ? (treatment.expectedEndDate | portalDate: data.clinic.timezone : 'date')
                  : '—'
              }}</strong>
            </div>
          } @else {
            <p class="portal-muted">No active treatment summary.</p>
          }
        </article>
        <article class="portal-card">
          <h2>Next appointment</h2>
          @if (data.child.nextAppointment; as appointment) {
            <p>
              <strong>{{
                appointment.startAt | portalDate: data.clinic.timezone : 'fullDate'
              }}</strong
              ><br />{{ appointment.startAt | portalDate: data.clinic.timezone : 'time' }} ·
              {{ appointment.typeLabel }}
            </p>
            <span class="portal-status">{{ friendly(appointment.status) }}</span>
          } @else {
            <p class="portal-muted">No upcoming appointment.</p>
            <p>Contact {{ data.clinic.name }} when you are ready to schedule.</p>
          }
        </article>
        <article class="portal-card">
          <h2>Latest visit guidance</h2>
          @if (data.latestVisit; as visit) {
            <p class="portal-muted">
              {{ visit.visitAt | portalDate: data.clinic.timezone : 'date' }} ·
              {{ friendly(visit.visitLabel) }}
            </p>
            <p>{{ visit.patientInstructions || 'No patient instructions were shared.' }}</p>
            @if (visit.nextRecommendedVisitAt) {
              <div class="portal-row">
                <span>Next recommended visit</span
                ><strong>{{
                  visit.nextRecommendedVisitAt | portalDate: data.clinic.timezone : 'date'
                }}</strong>
              </div>
            }
          } @else {
            <p class="portal-muted">No completed visit summary.</p>
          }
        </article>
        <article class="portal-card">
          <h2>Retention</h2>
          @if (data.child.retention; as retention) {
            <span class="portal-status">{{ friendly(retention.status) }}</span>
            <div class="portal-row">
              <span>Recommended control</span
              ><strong>{{
                retention.nextRecommendedControlAt
                  ? (retention.nextRecommendedControlAt | portalDate: data.clinic.timezone : 'date')
                  : 'Not set'
              }}</strong>
            </div>
          } @else {
            <p class="portal-muted">No active retention plan.</p>
          }
        </article>
      </div>
      <section class="portal-card" style="margin-top:18px">
        <h2>Payments</h2>
        @if (financeLoading()) {
          <p>Loading payment position…</p>
        } @else if (finance(); as f) {
          <div class="portal-row">
            <span>Recorded at clinic</span
            ><strong>{{ money(f.summary.recordedAmountMinor, f.summary.currency) }}</strong>
          </div>
          <div class="portal-row">
            <span>Remaining balance</span
            ><strong>{{
              f.summary.remainingAmountMinor === null
                ? 'Not available'
                : money(f.summary.remainingAmountMinor, f.summary.currency)
            }}</strong>
          </div>
        } @else if (!data.child.canViewFinance) {
          <p class="portal-muted">
            Financial information is available only to the financially responsible guardian.
          </p>
        } @else {
          <p class="portal-error">
            Payment information is temporarily unavailable. Care information above is unaffected.
          </p>
        }
      </section>
      <section class="portal-card" style="margin-top:18px">
        <h2>Signed consents</h2>
        @for (item of consents(); track item.id) {
          <div class="portal-row">
            <div>
              <strong>{{ item.title }}</strong
              ><br /><small
                >{{ item.signedAt | portalDate: data.clinic.timezone : 'date' }} ·
                {{ friendly(item.status) }}</small
              >
            </div>
            <button class="portal-link" (click)="download(item.downloadPath, item.title)">
              View
            </button>
          </div>
        } @empty {
          <p class="portal-muted">No signed documents are available for this guardian.</p>
        }
      </section>
    }
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalChildPage implements OnInit {
  private api = inject(PortalApiService);
  private id = inject(ActivatedRoute).snapshot.paramMap.get('patientId')!;
  protected overview = signal<PortalChildOverview | null>(null);
  protected finance = signal<PortalFinance | null>(null);
  protected consents = signal<PortalConsent[]>([]);
  protected loading = signal(true);
  protected financeLoading = signal(false);
  protected error = signal('');
  ngOnInit() {
    void this.load();
  }
  private async load() {
    try {
      const data = await firstValueFrom(this.api.overview(this.id));
      this.overview.set(data);
      if (data.child.canViewFinance) {
        this.financeLoading.set(true);
        firstValueFrom(this.api.finance(this.id))
          .then((v) => this.finance.set(v))
          .finally(() => this.financeLoading.set(false));
      }
      firstValueFrom(this.api.consents(this.id))
        .then((v) => this.consents.set(v))
        .catch(() => this.consents.set([]));
    } catch {
      this.error.set('This child profile is unavailable.');
    } finally {
      this.loading.set(false);
    }
  }
  protected friendly(v: string) {
    return v
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (m) => m.toUpperCase());
  }
  protected money(v: number, c: string) {
    const digits =
      new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(
      v / 10 ** digits,
    );
  }
  protected async download(path: string, name: string) {
    const blob = await firstValueFrom(this.api.download(path));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
