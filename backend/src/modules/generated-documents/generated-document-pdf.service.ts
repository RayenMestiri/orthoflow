import { createOrthoFlowPdf, finalizePdf, renderClinicHeader, renderDocumentFooters, type PdfClinicBranding } from '../../infrastructure/pdf/pdf-runtime.js';
import { DOCUMENT_BLOCK_KINDS, type ResolvedDocumentBlock } from './generated-document.types.js';

export interface GeneratedDocumentPdfInput { title: string; documentRef: string; generatedAt: Date; clinic: PdfClinicBranding; blocks: ResolvedDocumentBlock[] }

function ensureSpace(doc: PDFKit.PDFDocument, height = 50): void {
  if (doc.y + height > doc.page.height - 72) doc.addPage();
}

export class GeneratedDocumentPdfService {
  async render(input: GeneratedDocumentPdfInput): Promise<Buffer> {
    const doc = createOrthoFlowPdf({ Title: input.title, Subject: input.documentRef, CreationDate: input.generatedAt });
    renderClinicHeader(doc, input.clinic);
    doc.fontSize(20).fillColor('#173F38').text(input.title, { align: 'left' });
    doc.moveDown(0.3).fontSize(9).fillColor('#56635F').text(`${input.documentRef}  ·  ${input.generatedAt.toISOString()}`);
    doc.moveDown(1.2);
    for (const block of input.blocks) {
      ensureSpace(doc, block.kind === DOCUMENT_BLOCK_KINDS.DATA_TABLE ? 90 : 45);
      if (block.kind === DOCUMENT_BLOCK_KINDS.HEADING) {
        doc.fontSize(block.level === 1 ? 15 : 12).fillColor('#173F38').text(block.text ?? '');
        doc.moveDown(0.45);
      } else if (block.kind === DOCUMENT_BLOCK_KINDS.PARAGRAPH) {
        doc.fontSize(10.5).fillColor('#263B37').text(block.text ?? '', { lineGap: 3 });
        doc.moveDown(0.7);
      } else if (block.kind === DOCUMENT_BLOCK_KINDS.DIVIDER) {
        doc.moveDown(0.35).strokeColor('#DCE5E2').moveTo(doc.x, doc.y).lineTo(doc.page.width - 54, doc.y).stroke().moveDown(0.7);
      } else if (block.kind === DOCUMENT_BLOCK_KINDS.KEY_VALUE) {
        doc.fontSize(9).fillColor('#6A7773').text(block.label ?? '', { continued: true }).fillColor('#263B37').text(`  ${block.value ?? '—'}`);
        doc.moveDown(0.35);
      } else if (block.kind === DOCUMENT_BLOCK_KINDS.SIGNATURE_LINE) {
        doc.moveDown(1.8).strokeColor('#87938F').moveTo(doc.x, doc.y).lineTo(doc.x + 190, doc.y).stroke();
        doc.moveDown(0.25).fontSize(8.5).fillColor('#56635F').text(block.label ?? 'Authorized signature');
      } else if (block.kind === DOCUMENT_BLOCK_KINDS.DATA_TABLE) {
        const columns = block.columns ?? [];
        const width = (doc.page.width - 108) / Math.max(columns.length, 1);
        doc.fontSize(8).fillColor('#173F38');
        const headerY = doc.y;
        columns.forEach((column, index) => doc.text(column.label, doc.x + index * width, headerY, { width, continued: false }));
        doc.y = headerY + 18;
        doc.strokeColor('#BFCBC7').moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).stroke();
        doc.moveDown(0.4);
        for (const row of block.rows ?? []) {
          ensureSpace(doc, 28);
          const rowY = doc.y;
          const cells = new Map(row.cells.map((cell) => [cell.key, cell.value]));
          columns.forEach((column, index) => doc.fontSize(8).fillColor('#263B37').text(cells.get(column.key) ?? '—', 54 + index * width, rowY, { width: width - 6 }));
          doc.y = Math.max(doc.y, rowY + 24);
        }
        doc.moveDown(0.6);
      }
    }
    renderDocumentFooters(doc, input.documentRef, input.generatedAt.toISOString());
    return finalizePdf(doc);
  }
}

export const generatedDocumentPdfService = new GeneratedDocumentPdfService();
