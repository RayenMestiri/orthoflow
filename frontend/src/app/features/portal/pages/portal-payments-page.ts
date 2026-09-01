import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildSummary, PortalFinance, PortalReceipt } from '../models/portal.models';

@Component({
  selector: 'app-portal-payments-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="portal-page">
      <header class="page-header">
        <p class="portal-kicker">
          <span class="material-icons kicker-icon" aria-hidden="true">receipt_long</span>
          Comptabilité & Justificatifs
        </p>
        <h1 class="portal-title">Paiements & Reçus</h1>
        <p class="portal-lede">
          Retrouvez l'état récapitulatif de vos règlements enregistrés au cabinet et téléchargez vos reçus officiels.
        </p>

        <!-- Child Selector Tabs -->
        @if (eligible().length > 1) {
          <div class="patient-selector-tabs" role="tablist">
            @for (child of eligible(); track child.id) {
              <button
                type="button"
                class="patient-tab-btn"
                [class.active]="selectedChildId() === child.id"
                (click)="selectChild(child.id)"
              >
                <span class="p-avatar">{{ child.fullName.charAt(0) }}</span>
                <span>{{ child.fullName }}</span>
              </button>
            }
          </div>
        }
      </header>

      @if (loading()) {
        <div class="skeleton-stack">
          <div class="portal-skeleton skeleton-metrics"></div>
          <div class="portal-skeleton skeleton-card"></div>
        </div>
      } @else if (!eligible().length) {
        <div class="portal-empty">
          <span class="material-icons empty-icon" aria-hidden="true">lock</span>
          <h3>Information financière restreinte</h3>
          <p>Les données financières sont réservées au représentant légal désigné comme responsable financier du dossier.</p>
        </div>
      } @else if (finance(); as data) {
        <!-- 1. Executive Metrics Grid -->
        <div class="metrics-grid">
          <article class="metric-card">
            <span class="metric-label">Montant convenu</span>
            <h2 class="metric-val">
              {{ data.summary.agreedAmountMinor !== null ? money(data.summary.agreedAmountMinor, data.summary.currency) : 'Non défini' }}
            </h2>
            <span class="metric-desc">Devis global de traitement</span>
          </article>

          <article class="metric-card metric-card--paid">
            <span class="metric-label">Total versé au cabinet</span>
            <h2 class="metric-val metric-val--paid">
              {{ money(data.summary.recordedAmountMinor, data.summary.currency) }}
            </h2>
            <span class="metric-desc">{{ data.summary.recordCount }} versement(s) enregistré(s)</span>
          </article>

          <article class="metric-card metric-card--rem">
            <span class="metric-label">Solde restant</span>
            <h2 class="metric-val metric-val--rem">
              {{ data.summary.remainingAmountMinor !== null ? money(data.summary.remainingAmountMinor, data.summary.currency) : '—' }}
            </h2>
            <span class="metric-desc">Reste à régler au fil des séances</span>
          </article>
        </div>

        <!-- Progress Bar -->
        @if (data.summary.agreedAmountMinor && data.summary.agreedAmountMinor > 0) {
          <div class="progress-section">
            <div class="progress-labels">
              <span>Progression du règlement</span>
              <strong>{{ calcProgress(data.summary.recordedAmountMinor, data.summary.agreedAmountMinor) }}% réglé</strong>
            </div>
            <div class="progress-track">
              <div
                class="progress-fill"
                [style.width.%]="calcProgress(data.summary.recordedAmountMinor, data.summary.agreedAmountMinor)"
              ></div>
            </div>
          </div>
        }

        <!-- 2. Payment Records & Receipts History -->
        <section class="payments-history-section" aria-labelledby="history-title">
          <div class="history-header">
            <h3 id="history-title" class="history-title">
              <span class="material-icons" aria-hidden="true">history</span>
              <span>Historique des règlements & Reçus</span>
            </h3>
            <span class="history-badge">{{ data.payments.length }} versement(s)</span>
          </div>

          <div class="payments-list">
            @for (item of data.payments; track item.id) {
              <article class="payment-row-card" [class.payment-row-card--cancelled]="item.status === 'CANCELLED'">
                <div class="p-method-icon">
                  <span class="material-icons" aria-hidden="true">
                    {{ methodIcon(item.paymentMethod) }}
                  </span>
                </div>

                <div class="p-main-info">
                  <div class="p-top-line">
                    <strong class="p-amount">{{ money(item.amountMinor, item.currency) }}</strong>
                    <span class="status-pill status-pill--{{ item.status === 'CANCELLED' ? 'error' : 'confirmed' }}">
                      {{ friendlyStatus(item.status) }}
                    </span>
                  </div>
                  <p class="p-meta">
                    Reçu le {{ item.receivedAt | date: 'dd MMMM yyyy' }} · Mode : <strong>{{ friendlyMethod(item.paymentMethod) }}</strong>
                  </p>
                </div>

                <div class="p-actions">
                  @if (item.receiptId) {
                    <button
                      type="button"
                      class="portal-btn portal-btn--secondary"
                      (click)="viewReceipt(item.receiptId)"
                      title="Afficher le reçu officiel"
                    >
                      <span class="material-icons" aria-hidden="true">receipt</span>
                      <span>Voir le reçu</span>
                    </button>
                  }
                </div>
              </article>
            } @empty {
              <div class="portal-empty">
                <span class="material-icons empty-icon" aria-hidden="true">receipt</span>
                <h3>Aucun versement enregistré</h3>
                <p>Vos paiements enregistrés lors de vos visites au cabinet apparaîtront ici.</p>
              </div>
            }
          </div>
        </section>
      }

      <!-- Receipt Viewer Dialog -->
      @if (receipt(); as item) {
        <div class="receipt-overlay" (click)="closeReceipt()">
          <article class="receipt-dialog" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="r-dialog-title">
            <button type="button" class="receipt-close-btn" aria-label="Fermer le reçu" (click)="closeReceipt()">
              <span class="material-icons" aria-hidden="true">close</span>
            </button>

            <header class="r-dialog-header">
              <div class="r-clinic-badge">
                <span class="material-icons" aria-hidden="true">verified</span>
                <span>{{ item.clinicName }}</span>
              </div>
              <h2 id="r-dialog-title" class="r-dialog-title">Reçu N° {{ item.receiptNumber }}</h2>
              <p class="r-dialog-date">Émis le {{ item.issuedAt | date: 'dd MMMM yyyy à HH:mm' }}</p>
            </header>

            @if (item.status === 'CANCELLED') {
              <div class="portal-error receipt-cancel-alert">
                <span class="material-icons" aria-hidden="true">warning</span>
                <span>Reçu annulé{{ item.cancellationReason ? ' : ' + item.cancellationReason : '' }}</span>
              </div>
            }

            <div class="r-table">
              <div class="r-row">
                <span class="r-lbl">Patient</span>
                <strong class="r-val">{{ item.patientName }}</strong>
              </div>
              <div class="r-row">
                <span class="r-lbl">Montant réglé</span>
                <strong class="r-val r-val--highlight">{{ item.amountFormatted }}</strong>
              </div>
              <div class="r-row">
                <span class="r-lbl">Mode de paiement</span>
                <span class="r-val">{{ friendlyMethod(item.paymentMethod) }}</span>
              </div>
              @if (item.treatmentLabel) {
                <div class="r-row">
                  <span class="r-lbl">Traitement</span>
                  <span class="r-val">{{ item.treatmentLabel }}</span>
                </div>
              }
              @if (item.payerName) {
                <div class="r-row">
                  <span class="r-lbl">Payeur</span>
                  <span class="r-val">{{ item.payerName }}</span>
                </div>
              }
            </div>

            <footer class="r-dialog-footer">
              <p class="r-clinic-info">
                {{ item.clinicAddress }}{{ item.clinicPhone ? ' · Tél : ' + item.clinicPhone : '' }}
              </p>
              <button type="button" class="portal-btn portal-btn--secondary" (click)="closeReceipt()">
                <span>Fermer</span>
              </button>
            </footer>
          </article>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .page-header {
        margin-bottom: 28px;
      }
      .kicker-icon {
        font-size: 16px;
      }
      .patient-selector-tabs {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .patient-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 99px;
        border: 1px solid #dce2de;
        background: #fffefb;
        color: #56635f;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .p-avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
        font-size: 11px;
        font-weight: 700;
      }
      .patient-tab-btn.active {
        background: #173f38;
        border-color: #173f38;
        color: #fffefb;
      }
      .patient-tab-btn.active .p-avatar {
        background: #df8b70;
        color: #fffefb;
      }

      /* Metrics Grid */
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 20px;
        margin-bottom: 24px;
      }
      .metric-card {
        padding: 24px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 18px;
        box-shadow: 0 6px 20px rgba(13, 41, 37, 0.03);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .metric-label {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #84918d;
      }
      .metric-val {
        margin: 0;
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: #0d2925;
      }
      .metric-val--paid {
        color: #1e4620;
      }
      .metric-val--rem {
        color: #c86445;
      }
      .metric-desc {
        font-size: 12px;
        color: #56635f;
      }

      /* Progress */
      .progress-section {
        padding: 20px 24px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 18px;
        margin-bottom: 28px;
        box-shadow: 0 4px 16px rgba(13, 41, 37, 0.02);
      }
      .progress-labels {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        font-size: 13px;
        color: #56635f;
      }
      .progress-labels strong {
        color: #173f38;
      }
      .progress-track {
        height: 10px;
        border-radius: 99px;
        background: #e8efeb;
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #173f38, #52b788);
        border-radius: 99px;
        transition: width 0.5s ease;
      }

      /* Payments History */
      .history-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .history-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: #0d2925;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .history-title .material-icons {
        font-size: 20px;
        color: #173f38;
      }
      .history-badge {
        font-size: 12px;
        font-weight: 700;
        color: #56635f;
        background: #e8efeb;
        padding: 4px 10px;
        border-radius: 99px;
      }

      .payments-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .payment-row-card {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 18px;
        align-items: center;
        padding: 18px 22px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 16px;
        box-shadow: 0 4px 14px rgba(13, 41, 37, 0.02);
        transition: transform 0.15s ease;
      }
      .payment-row-card:hover {
        transform: translateY(-1px);
      }
      .payment-row-card--cancelled {
        opacity: 0.7;
        background: #fff7f5;
      }

      .p-method-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .p-method-icon .material-icons {
        font-size: 22px;
      }

      .p-main-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .p-top-line {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .p-amount {
        font-size: 16px;
        font-weight: 800;
        color: #0d2925;
      }
      .p-meta {
        margin: 0;
        font-size: 13px;
        color: #56635f;
      }

      /* Status Pill */
      .status-pill {
        display: inline-flex;
        padding: 3px 8px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .status-pill--confirmed {
        background: #edf7ed;
        color: #1e4620;
      }
      .status-pill--error {
        background: #fff7f5;
        color: #a33d3d;
      }

      /* Receipt Dialog */
      .receipt-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(13, 41, 37, 0.7);
        backdrop-filter: blur(8px);
        display: grid;
        place-items: center;
        padding: 20px;
      }
      .receipt-dialog {
        background: #fffefb;
        width: min(100%, 520px);
        border-radius: 24px;
        box-shadow: 0 32px 80px rgba(13, 41, 37, 0.35);
        padding: 32px;
        position: relative;
        border: 1px solid #dce2de;
      }
      .receipt-close-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 0;
        background: #f6f3ec;
        color: #173f38;
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      .r-dialog-header {
        margin-bottom: 20px;
      }
      .r-clinic-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 700;
        color: #173f38;
        margin-bottom: 6px;
      }
      .r-clinic-badge .material-icons {
        font-size: 16px;
        color: #52b788;
      }
      .r-dialog-title {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        color: #0d2925;
      }
      .r-dialog-date {
        margin: 2px 0 0;
        font-size: 13px;
        color: #56635f;
      }

      .r-table {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 18px 0;
        border-top: 1px solid #e8efeb;
        border-bottom: 1px solid #e8efeb;
        margin-bottom: 20px;
      }
      .r-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .r-lbl {
        font-size: 13px;
        color: #84918d;
      }
      .r-val {
        font-size: 14px;
        color: #17201e;
      }
      .r-val--highlight {
        font-size: 20px;
        font-weight: 800;
        color: #173f38;
      }

      .r-dialog-footer {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .r-clinic-info {
        margin: 0;
        font-size: 12px;
        color: #84918d;
        line-height: 1.4;
      }

      /* Skeleton */
      .skeleton-stack {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .skeleton-metrics {
        height: 120px;
        border-radius: 18px;
      }
      .skeleton-card {
        height: 200px;
        border-radius: 18px;
      }

      @media (max-width: 768px) {
        .metrics-grid {
          grid-template-columns: 1fr;
        }
        .payment-row-card {
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .p-actions {
          display: flex;
          justify-content: flex-start;
        }
        .receipt-dialog {
          padding: 24px 20px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalPaymentsPage implements OnInit {
  private readonly api = inject(PortalApiService);

  protected readonly selectedChildId = signal('');
  protected readonly eligible = signal<PortalChildSummary[]>([]);
  protected readonly finance = signal<PortalFinance | null>(null);
  protected readonly receipt = signal<PortalReceipt | null>(null);
  protected readonly loading = signal(true);

  async ngOnInit() {
    try {
      const children = (await firstValueFrom(this.api.children())).filter(
        (item) => item.canViewFinance,
      );
      this.eligible.set(children);
      if (children[0]) {
        await this.loadChildFinance(children[0].id);
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async selectChild(id: string) {
    this.selectedChildId.set(id);
    await this.loadChildFinance(id);
  }

  private async loadChildFinance(id: string) {
    this.selectedChildId.set(id);
    this.receipt.set(null);
    try {
      this.finance.set(await firstValueFrom(this.api.finance(id)));
    } catch {
      this.finance.set(null);
    }
  }

  protected async viewReceipt(receiptId: string) {
    this.receipt.set(await firstValueFrom(this.api.receipt(this.selectedChildId(), receiptId)));
  }

  protected closeReceipt() {
    this.receipt.set(null);
  }

  protected methodIcon(method: string): string {
    switch (method.toUpperCase()) {
      case 'CASH':
        return 'payments';
      case 'CARD':
        return 'credit_card';
      case 'TRANSFER':
        return 'account_balance';
      case 'CHECK':
        return 'edit_note';
      default:
        return 'receipt';
    }
  }

  protected friendlyMethod(method: string): string {
    switch (method.toUpperCase()) {
      case 'CASH':
        return 'Espèces';
      case 'CARD':
        return 'Carte bancaire';
      case 'TRANSFER':
        return 'Virement bancaire';
      case 'CHECK':
        return 'Chèque';
      default:
        return method;
    }
  }

  protected friendlyStatus(status: string): string {
    switch (status.toUpperCase()) {
      case 'ISSUED':
      case 'RECEIVED':
      case 'CONFIRMED':
        return 'Enregistré';
      case 'CANCELLED':
        return 'Annulé';
      default:
        return status;
    }
  }

  protected money(minor: number, currency: string): string {
    const digits =
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      minor / 10 ** digits,
    );
  }

  protected calcProgress(paid: number, total: number): number {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.round((paid / total) * 100));
  }
}
