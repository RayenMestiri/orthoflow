import {
  createOrthoFlowPdf,
  finalizePdf,
  renderClinicHeader,
  renderDocumentFooters,
} from '../../infrastructure/pdf/pdf-runtime.js';

export interface FinalizedConsentPdfInput {
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  consentRef: string;
  title: string;
  templateVersion: number;
  patientName: string;
  signerName: string;
  signerRelationship: string | null;
  presentedByName: string;
  signedAtLabel: string;
  content: string;
  signaturePng: Buffer;
}

/** Server-side authoritative rendering; the browser never supplies HTML. */
export class ConsentPdfService {
  async generate(input: FinalizedConsentPdfInput): Promise<Buffer> {
    const document = createOrthoFlowPdf({
      Title: `${input.consentRef} — ${input.title}`,
      Author: input.clinicName,
      Subject: 'Finalized signed consent',
    });
    renderClinicHeader(document, {
      clinicName: input.clinicName,
      doctorName: null,
      address: input.clinicAddress,
      phone: input.clinicPhone,
      email: null,
    });

    document.fillColor('#C86445').fontSize(9).text('SIGNED CONSENT', { characterSpacing: 1.2 });
    document.fillColor('#17201E').fontSize(20).text(input.title);
    document.fillColor('#56635F').fontSize(9).text(
      `${input.consentRef} · Version v${input.templateVersion}`,
    );
    document.moveDown(1);

    const metadata = [
      ['Patient', input.patientName],
      ['Signer', input.signerName],
      ['Relationship', input.signerRelationship ?? 'Patient'],
      ['Signed', input.signedAtLabel],
      ['Presented by', input.presentedByName],
    ] as const;
    for (const [label, value] of metadata) {
      document.fillColor('#56635F').fontSize(8).text(label.toUpperCase(), { continued: true });
      document.fillColor('#17201E').fontSize(10).text(`  ${value}`);
    }

    document.moveDown(1.2);
    document.fillColor('#17201E').fontSize(10.5).text(input.content, {
      align: 'left',
      lineGap: 3,
    });
    document.moveDown(1.5);

    if (document.y > 650) document.addPage();
    document.fillColor('#56635F').fontSize(8).text('CAPTURED SIGNATURE');
    document.moveDown(0.4);
    const signatureTop = document.y;
    document
      .roundedRect(54, signatureTop, 250, 100, 7)
      .strokeColor('#DCE2DE')
      .stroke();
    document.image(input.signaturePng, 66, signatureTop + 10, {
      fit: [226, 70],
      align: 'center',
      valign: 'center',
    });
    document.y = signatureTop + 112;
    document
      .fillColor('#56635F')
      .fontSize(8)
      .text('This document records a captured handwritten signature. It is not described as a qualified or certified digital signature.');

    return finalizePdf(document, () => {
      renderDocumentFooters(document, input.consentRef, input.signedAtLabel);
    });
  }
}

export const consentPdfService = new ConsentPdfService();
