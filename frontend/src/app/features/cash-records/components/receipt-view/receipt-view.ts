import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { PAYMENT_METHOD_LABELS } from '../../models/cash-record.model';
import type { ReceiptDocument } from '../../models/receipt.model';

/**
 * The printable receipt.
 *
 * Printing is the browser's, not a PDF library's: a receipt is a page of text
 * and a clinic already has a printer. `@media print` in the stylesheet hides
 * the app chrome so only this document reaches the paper. PDF export is a
 * native feature via Print -> Save as PDF.
 *
 * The closing line claims only what OrthoFlow can honestly claim — that the
 * clinic recorded this amount as received. No tax or legal assertion.
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  protected print(): void {
    window.print();
  }

  protected close(): void {
    this.closed.emit();
  }
}
