import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetentionApiService } from '../../../treatments/data-access/retention-api.service';
import { TreatmentsApiService } from '../../../treatments/data-access/treatments-api.service';
import { ConsentsApiService } from '../../data-access/consents-api.service';
import type { ConsentTemplate, SignedConsent } from '../../models/consent.models';
import { PatientConsents } from './patient-consents';

const template: ConsentTemplate = {
  id: 'template-1', code: 'ORTHO', version: 2, versionLabel: 'v2', title: 'Orthodontic consent',
  category: 'TREATMENT', content: 'Reviewed clinic content for {{patient.fullName}}.', status: 'ACTIVE',
  activatedAt: '2026-08-20T10:00:00.000Z', archivedAt: null,
  createdAt: '2026-08-20T09:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
};

const signed: SignedConsent = {
  id: 'consent-1', patientId: 'patient-1', treatmentId: null, retentionPlanId: null,
  consentRef: 'CNS-2026-000001', templateId: template.id, templateCode: template.code,
  templateVersion: 2, versionLabel: 'v2', category: 'TREATMENT', title: template.title,
  contentSnapshot: 'Reviewed clinic content for Nadia.', patientName: 'Nadia Patient', signerType: 'PATIENT',
  guardianId: null, signerName: 'Nadia Patient', signerRelationship: null, status: 'SIGNED',
  signedAt: '2026-08-23T10:00:00.000Z', presentedByName: 'Dr Aymen', pdfSha256: 'a'.repeat(64),
  pdfByteSize: 2048, pdfDownloadPath: '/api/v1/consents/consent-1/pdf', revokedAt: null,
  revocationReason: null, voidedAt: null, voidReason: null,
};

describe('PatientConsents', () => {
  let fixture: ComponentFixture<PatientConsents>;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      listPatientConsents: vi.fn(() => of([])),
      listTemplates: vi.fn(() => of([template])),
      preview: vi.fn(), sign: vi.fn(), downloadPdf: vi.fn(), revoke: vi.fn(), voidConsent: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [PatientConsents],
      providers: [
        { provide: ConsentsApiService, useValue: api },
        { provide: TreatmentsApiService, useValue: { listForPatient: vi.fn(() => of([])) } },
        { provide: RetentionApiService, useValue: { getByTreatment: vi.fn(() => of(null)) } },
      ],
    });
  });

  async function render(options: { minor?: boolean; items?: SignedConsent[]; capture?: boolean; revoke?: boolean } = {}) {
    api['listPatientConsents']?.mockReturnValue(of(options.items ?? []));
    fixture = TestBed.createComponent(PatientConsents);
    fixture.componentRef.setInput('patientId', 'patient-1');
    fixture.componentRef.setInput('patientName', 'Nadia Patient');
    fixture.componentRef.setInput('isMinor', options.minor ?? false);
    fixture.componentRef.setInput('canCapture', options.capture ?? false);
    fixture.componentRef.setInput('canRevoke', options.revoke ?? false);
    fixture.componentRef.setInput('guardians', [
      { id: 'guardian-1', fullName: 'Karim Guardian', relationship: 'FATHER', isPrimary: true },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a useful empty state and respects capture permission', async () => {
    const element = await render();
    expect(element.textContent).toContain('No signed consent yet');
    expect(element.textContent).not.toContain('Capture consent');
  });

  it('forces a linked guardian for a minor signer', async () => {
    const element = await render({ minor: true, capture: true });
    (element.querySelector('.consents__header .button--primary') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    (element.querySelector('input[name="template"]') as HTMLInputElement).click();
    fixture.detectChanges();
    (element.querySelector('.drawer__footer .button--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const patientRadio = element.querySelector('input[value="PATIENT"]') as HTMLInputElement;
    expect(patientRadio.disabled).toBe(true);
    expect(element.textContent).toContain('Karim Guardian');
  });

  it('shows lifecycle actions only when allowed', async () => {
    const readonlyElement = await render({ items: [signed] });
    expect(readonlyElement.textContent).not.toContain('Revoke');
    const allowedElement = await render({ items: [signed], revoke: true });
    expect(allowedElement.textContent).toContain('Revoke');
    expect(allowedElement.textContent).toContain('CNS-2026-000001');
  });
});
