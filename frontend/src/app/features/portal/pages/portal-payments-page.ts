import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildSummary, PortalFinance, PortalReceipt } from '../models/portal.models';

@Component({
  selector: 'app-portal-payments-page',
  imports: [DatePipe],
  template: `
    <section class="portal-page">
      <p class="portal-kicker">Clinic records</p>
      <h1 class="portal-title">Payments & receipts</h1>
      <p class="portal-lede">
        These are payments recorded as received at the clinic—not online transactions.
      </p>
      @if (loading()) {
        <div class="portal-empty">Loading…</div>
      } @else if (!eligible().length) {
        <div class="portal-empty">No financial records are available for this account.</div>
      } @else {
        <div class="portal-card">
          <label for="child">Child</label>
          <select id="child" (change)="select($any($event.target).value)">
            @for (child of eligible(); track child.id) {
              <option [value]="child.id">{{ child.fullName }}</option>
            }
          </select>
        </div>
        @if (finance(); as data) {
          <div class="portal-grid summary-grid">
            <article class="portal-card">
              <small class="portal-muted">Recorded payments</small>
              <h2>{{ money(data.summary.recordedAmountMinor, data.summary.currency) }}</h2>
            </article>
            <article class="portal-card">
              <small class="portal-muted">Remaining balance</small>
              <h2>
                {{
                  data.summary.remainingAmountMinor === null
                    ? 'Not available'
                    : money(data.summary.remainingAmountMinor, data.summary.currency)
                }}
              </h2>
            </article>
          </div>
          <article class="portal-card history">
            <h2>Receipt history</h2>
            @for (item of data.payments; track item.id) {
              <div class="portal-row">
                <div>
                  <strong>{{ money(item.amountMinor, item.currency) }}</strong>
                  <p>
                    {{ item.receivedAt | date: 'mediumDate' }} · {{ friendly(item.paymentMethod)
                    }}<br />
                    <small>Payment recorded at clinic</small>
                  </p>
                </div>
                <div class="receipt-actions">
                  <span class="portal-status">{{ friendly(item.status) }}</span>
                  @if (item.receiptId) {
                    <button
                      class="portal-link portal-link--quiet"
                      type="button"
                      (click)="viewReceipt(item.receiptId)"
                    >
                      View receipt
                    </button>
                  }
                </div>
              </div>
            } @empty {
              <p class="portal-muted">No payments recorded.</p>
            }
          </article>
        }
      }

      @if (receipt(); as item) {
        <div class="receipt-layer">
          <button
            class="receipt-backdrop"
            type="button"
            aria-label="Close receipt"
            (click)="closeReceipt()"
          ></button>
          <article class="receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <button
              class="receipt-close"
              type="button"
              aria-label="Close receipt"
              (click)="closeReceipt()"
            >
              ×
            </button>
            <p class="portal-kicker">{{ item.clinicName }}</p>
            <h2 id="receipt-title">Receipt {{ item.receiptNumber }}</h2>
            @if (item.status === 'CANCELLED') {
              <div class="portal-error">
                Cancelled receipt{{
                  item.cancellationReason ? ' · ' + item.cancellationReason : ''
                }}
              </div>
            }
            <div class="portal-row">
              <span>Patient</span><strong>{{ item.patientName }}</strong>
            </div>
            <div class="portal-row">
              <span>Amount recorded</span><strong>{{ item.amountFormatted }}</strong>
            </div>
            <div class="portal-row">
              <span>Received at clinic</span><strong>{{ item.issuedAt | date: 'medium' }}</strong>
            </div>
            <div class="portal-row">
              <span>Method</span><strong>{{ friendly(item.paymentMethod) }}</strong>
            </div>
            @if (item.treatmentLabel) {
              <div class="portal-row">
                <span>Treatment</span><strong>{{ item.treatmentLabel }}</strong>
              </div>
            }
            @if (item.payerName) {
              <div class="portal-row">
                <span>Received from</span><strong>{{ item.payerName }}</strong>
              </div>
            }
            <p class="portal-muted">
              {{ item.clinicAddress }}{{ item.clinicPhone ? ' · ' + item.clinicPhone : '' }}
            </p>
          </article>
        </div>
      }
    </section>
  `,
  styles: [
    `
      select {
        width: 100%;
        height: 46px;
        margin-top: 8px;
        padding: 0 12px;
        border: 1px solid #bfc9c4;
        border-radius: 8px;
        background: white;
        font: inherit;
      }
      .summary-grid,
      .history {
        margin-top: 18px;
      }
      .receipt-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }
      .portal-link--quiet {
        min-height: 36px;
        padding: 0 11px;
        background: #e8efeb;
        color: #173f38;
      }
      .receipt-layer {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: grid;
        place-items: center;
        padding: 20px;
      }
      .receipt-backdrop {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: rgba(13, 41, 37, 0.6);
      }
      .receipt {
        position: relative;
        z-index: 1;
        width: min(100%, 540px);
        max-height: calc(100vh - 40px);
        overflow: auto;
        padding: 32px;
        border-radius: 18px;
        background: #fffefb;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.24);
      }
      .receipt h2 {
        color: #0d2925;
      }
      .receipt-close {
        position: absolute;
        top: 12px;
        right: 14px;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 50%;
        background: #e8efeb;
        color: #173f38;
        font-size: 26px;
        cursor: pointer;
      }
      @media (max-width: 520px) {
        .portal-row {
          align-items: flex-start;
        }
        .receipt-actions {
          align-items: flex-end;
          flex-direction: column;
        }
        .receipt {
          padding: 26px 20px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalPaymentsPage implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly selectedChildId = signal('');
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
      if (children[0]) await this.load(children[0].id);
    } finally {
      this.loading.set(false);
    }
  }

  protected select(id: string) {
    void this.load(id);
  }

  protected async viewReceipt(receiptId: string) {
    this.receipt.set(await firstValueFrom(this.api.receipt(this.selectedChildId(), receiptId)));
  }

  protected closeReceipt() {
    this.receipt.set(null);
  }

  protected friendly(value: string) {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  protected money(value: number, currency: string) {
    const digits =
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      value / 10 ** digits,
    );
  }

  private async load(id: string) {
    this.selectedChildId.set(id);
    this.receipt.set(null);
    this.finance.set(await firstValueFrom(this.api.finance(id)));
  }
}
