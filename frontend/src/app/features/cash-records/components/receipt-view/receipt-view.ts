import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { PAYMENT_METHOD_LABELS } from '../../models/cash-record.model';
import type { ReceiptDocument } from '../../models/receipt.model';

/**
 * A professional, high-end Black & White medical cabinet receipt.
 *
 * Designed to strictly fit on a single A4/Letter page without spilling,
 * using crisp monochrome typography, dental cabinet header, structured details table,
 * prominent amount box, and a dedicated stamp & signature area.
 */
@Component({
  selector: 'app-receipt-view',
  imports: [DatePipe],
  templateUrl: './receipt-view.html',
  styleUrl: './receipt-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptView {
  readonly receipt = input.required<ReceiptDocument>();
  readonly closed = output<void>();

  protected readonly methodLabels = PAYMENT_METHOD_LABELS;

  protected readonly methodLabelsFr: Record<string, string> = {
    CASH: 'Espèces (Cash)',
    CARD_AT_CLINIC: 'Carte bancaire (TPE)',
    BANK_TRANSFER: 'Virement bancaire',
    OTHER: 'Autre mode de règlement',
  };

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  /**
   * Cleans and deduplicates address strings (e.g. repeated street or city names).
   */
  cleanAddress(address: string | null | undefined): string {
    if (!address) return '';
    const parts = address
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    const uniqueParts: string[] = [];

    for (const part of parts) {
      const normalized = part.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueParts.push(part);
      }
    }

    return uniqueParts.join(', ');
  }

  /**
   * Formats telephone numbers nicely with legible spacing.
   */
  cleanPhone(phone: string | null | undefined): string {
    if (!phone) return '';
    const cleaned = phone.trim();
    if (cleaned.startsWith('+216') && cleaned.length === 12) {
      return `+216 ${cleaned.slice(4, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
    }
    return cleaned;
  }

  /**
   * Prints the receipt using an isolated hidden iframe.
   * This guarantees:
   *  1. Exactly 1 single page without multi-page spillover or background app bleed.
   *  2. Clean document title for "Save as PDF" (e.g. Recu_REC-2026-000015_Rayen_Mestiri.pdf).
   *  3. Crisp monochrome rendering on all printers.
   */
  protected print(): void {
    const printArea = document.getElementById('receipt-print-area');
    if (!printArea) {
      window.print();
      return;
    }

    let iframe = document.getElementById('receipt-print-iframe') as HTMLIFrameElement | null;
    if (iframe) {
      iframe.remove();
    }

    iframe = document.createElement('iframe');
    iframe.id = 'receipt-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const receipt = this.receipt();
    const patientSlug = receipt.patientName.replace(/\s+/g, '_');
    const title = `Recu_${receipt.receiptNumber}_${patientSlug}`;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 13px;
            line-height: 1.45;
          }
          ${this.getPrintCss()}
        </style>
      </head>
      <body>
        <article class="receipt">
          ${printArea.innerHTML}
        </article>
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      }
    }, 200);
  }

  protected close(): void {
    this.closed.emit();
  }

  private getPrintCss(): string {
    return `
      .receipt {
        width: 100%;
        max-width: 180mm;
        margin: 0 auto;
        padding: 8mm 10mm;
        border: 2px solid #000000;
        background: #ffffff;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .receipt__void-banner {
        border: 2px solid #000000;
        padding: 8px 12px;
        margin-bottom: 14px;
        text-align: center;
        text-transform: uppercase;
        font-weight: bold;
      }
      .receipt__cabinet-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 12px;
        border-bottom: 2px solid #000000;
        margin-bottom: 14px;
        gap: 16px;
      }
      .cabinet-brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .cabinet-symbol svg {
        stroke: #000000;
      }
      .cabinet-name {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #000000;
      }
      .cabinet-sub {
        margin: 2px 0 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #333333;
        text-transform: uppercase;
      }
      .cabinet-contact {
        text-align: right;
        font-size: 11px;
        color: #222222;
        line-height: 1.4;
      }
      .cabinet-contact p {
        margin: 2px 0;
      }
      .cabinet-label {
        font-weight: 700;
      }
      .receipt__doc-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        border: 1px solid #000000;
        background: #fbfbfb;
        margin-bottom: 14px;
      }
      .doc-meta__title h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .doc-meta__title .sub-title {
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.1em;
        color: #555555;
      }
      .doc-meta__box {
        text-align: right;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .meta-item {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        font-size: 11.5px;
      }
      .meta-label {
        color: #444444;
      }
      .meta-value {
        font-weight: 700;
      }
      .meta-mono {
        font-family: monospace;
        font-size: 12.5px;
      }
      .receipt__table-wrapper {
        margin-bottom: 14px;
      }
      .receipt__table {
        width: 100%;
        border-collapse: collapse;
      }
      .receipt__table tr {
        border-bottom: 1px solid #cccccc;
      }
      .receipt__table tr:first-child {
        border-top: 1px solid #000000;
      }
      .receipt__table tr:last-child {
        border-bottom: 1px solid #000000;
      }
      .receipt__table th {
        padding: 7px 10px;
        text-align: left;
        font-size: 11.5px;
        font-weight: 700;
        color: #333333;
        width: 38%;
        background: #fafafa;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .receipt__table td {
        padding: 7px 10px;
        font-size: 12.5px;
        color: #000000;
      }
      .receipt__amount-box {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 2px solid #000000;
        padding: 10px 16px;
        background: #f7f7f7;
        margin-bottom: 16px;
      }
      .amount-title {
        display: block;
        font-size: 12.5px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .amount-sub {
        display: block;
        font-size: 9.5px;
        font-weight: 600;
        color: #555555;
      }
      .amount-figures {
        font-size: 20px;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
        color: #000000;
      }
      .receipt__closing {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        padding-top: 8px;
        margin-bottom: 12px;
      }
      .closing-declaration {
        flex: 1;
        font-size: 11px;
        line-height: 1.45;
        color: #333333;
      }
      .attestation-text {
        margin: 0 0 4px;
      }
      .mention-legal {
        margin: 0;
        font-size: 10px;
        color: #666666;
        font-style: italic;
      }
      .closing-stamp-box {
        width: 60mm;
        text-align: center;
      }
      .stamp-title {
        display: block;
        font-size: 10.5px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .stamp-frame {
        height: 24mm;
        border: 1px dashed #000000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
      }
      .stamp-placeholder {
        font-size: 9px;
        color: #888888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .receipt__bottom-note {
        border-top: 1px solid #e0e0e0;
        padding-top: 6px;
        text-align: center;
        font-size: 9px;
        color: #777777;
      }
    `;
  }
}
