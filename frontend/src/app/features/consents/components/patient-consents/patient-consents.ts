import { A11yModule } from '@angular/cdk/a11y';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { openAuthenticatedPdf } from '../../../../core/http/authenticated-pdf';
import { RetentionApiService } from '../../../treatments/data-access/retention-api.service';
import { TreatmentsApiService } from '../../../treatments/data-access/treatments-api.service';
import { treatmentTypeLabel } from '../../../treatments/models/treatment.models';
import { ConsentsApiService } from '../../data-access/consents-api.service';
import {
  CONSENT_CATEGORY_LABELS,
  type ConsentGuardianOption,
  type ConsentPreview,
  type ConsentSignerType,
  type ConsentTemplate,
  type SignedConsent,
} from '../../models/consent.models';
import { ConsentSignaturePad } from '../consent-signature-pad/consent-signature-pad';

interface ContextOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-patient-consents',
  imports: [A11yModule, DatePipe, ConsentSignaturePad],
  templateUrl: './patient-consents.html',
  styleUrl: './patient-consents.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientConsents implements OnInit {
  private readonly api = inject(ConsentsApiService);
  private readonly treatmentsApi = inject(TreatmentsApiService);
  private readonly retentionApi = inject(RetentionApiService);
  @ViewChild(ConsentSignaturePad) private signaturePad?: ConsentSignaturePad;

  readonly patientId = input.required<string>();
  readonly patientName = input.required<string>();
  readonly isMinor = input(false);
  readonly guardians = input<ConsentGuardianOption[]>([]);
  readonly canCapture = input(false);
  readonly canRevoke = input(false);
  readonly canVoid = input(false);

  readonly items = signal<SignedConsent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly drawerOpen = signal(false);
  readonly discardConfirmOpen = signal(false);
  readonly step = signal<1 | 2 | 3 | 4 | 5>(1);
  readonly templates = signal<ConsentTemplate[]>([]);
  readonly selectedTemplateId = signal('');
  readonly signerType = signal<ConsentSignerType>('PATIENT');
  readonly guardianId = signal('');
  readonly treatmentId = signal('');
  readonly retentionPlanId = signal('');
  readonly treatmentOptions = signal<ContextOption[]>([]);
  readonly retentionOptions = signal<ContextOption[]>([]);
  readonly preview = signal<ConsentPreview | null>(null);
  readonly signatureFile = signal<File | null>(null);
  readonly signatureHasInk = signal(false);
  readonly acknowledgement = signal(false);
  readonly idempotencyKey = signal('');
  readonly saving = signal(false);
  readonly drawerError = signal<string | null>(null);
  readonly actionTarget = signal<SignedConsent | null>(null);
  readonly actionKind = signal<'revoke' | 'void' | null>(null);
  readonly actionReason = signal('');
  readonly actionSaving = signal(false);

  readonly activeGuardians = computed(() =>
    [...this.guardians()].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
  );
  readonly selectedTemplate = computed(
    () => this.templates().find((item) => item.id === this.selectedTemplateId()) ?? null,
  );
  readonly canAdvance = computed(() => {
    if (this.step() === 1) return Boolean(this.selectedTemplateId());
    if (this.step() === 2) {
      return this.signerType() === 'PATIENT' || Boolean(this.guardianId());
    }
    if (this.step() === 4) return this.signatureHasInk();
    if (this.step() === 5) return this.acknowledgement() && Boolean(this.signatureFile());
    return true;
  });

  readonly categoryLabels = CONSENT_CATEGORY_LABELS;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.listPatientConsents(this.patientId())));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async openCapture(): Promise<void> {
    this.resetCapture();
    this.idempotencyKey.set(crypto.randomUUID());
    this.drawerOpen.set(true);
    this.signerType.set(this.isMinor() ? 'GUARDIAN' : 'PATIENT');
    if (this.isMinor() && this.activeGuardians().length) {
      this.guardianId.set(this.activeGuardians()[0].id);
    }
    try {
      const [templates, treatments] = await Promise.all([
        firstValueFrom(this.api.listTemplates({ status: 'ACTIVE' })),
        firstValueFrom(this.treatmentsApi.listForPatient(this.patientId())),
      ]);
      this.templates.set(templates);
      this.treatmentOptions.set(
        treatments.map((item) => ({
          id: item.id,
          label: treatmentTypeLabel(item.type, item.customTypeLabel),
        })),
      );
      const plans = await Promise.all(
        treatments.map((item) => firstValueFrom(this.retentionApi.getByTreatment(item.id))),
      );
      this.retentionOptions.set(
        plans
          .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan))
          .map((plan) => ({
            id: plan.id,
            label: `Retention · ${this.treatmentOptions().find((item) => item.id === plan.treatmentId)?.label ?? 'Treatment'}`,
          })),
      );
    } catch (error) {
      this.drawerError.set(getApiProblem(error).message);
    }
  }

  requestClose(): void {
    if (this.step() > 1 || this.signaturePad?.hasInk()) {
      this.discardConfirmOpen.set(true);
      return;
    }
    this.closeCapture();
  }

  closeCapture(): void {
    if (this.saving()) return;
    this.drawerOpen.set(false);
    this.discardConfirmOpen.set(false);
    this.resetCapture();
  }

  back(): void {
    const current = this.step();
    if (current > 1) this.step.set((current - 1) as 1 | 2 | 3 | 4);
  }

  async next(): Promise<void> {
    this.drawerError.set(null);
    if (!this.canAdvance()) {
      this.drawerError.set('Complete this step before continuing.');
      return;
    }
    if (this.step() === 2) {
      try {
        this.preview.set(await firstValueFrom(this.api.preview(this.patientId(), this.selection())));
        this.step.set(3);
      } catch (error) {
        this.drawerError.set(getApiProblem(error).message);
      }
      return;
    }
    if (this.step() === 4) {
      const file = await this.signaturePad?.exportFile();
      if (!file) {
        this.drawerError.set('Add a signature before continuing.');
        return;
      }
      this.signatureFile.set(file);
      this.step.set(5);
      return;
    }
    if (this.step() < 5) this.step.set((this.step() + 1) as 2 | 3 | 4 | 5);
  }

  async submit(): Promise<void> {
    const file = this.signatureFile();
    if (!file || !this.acknowledgement() || this.saving()) return;
    this.saving.set(true);
    this.drawerError.set(null);
    try {
      const signed = await firstValueFrom(
        this.api.sign(this.patientId(), this.selection(), file, this.idempotencyKey()),
      );
      this.items.update((items) => [signed, ...items]);
      this.notice.set(`${signed.title} signed and stored as ${signed.consentRef}.`);
      this.drawerOpen.set(false);
      this.resetCapture();
    } catch (error) {
      this.drawerError.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async openPdf(item: SignedConsent): Promise<void> {
    try {
      await openAuthenticatedPdf(this.api.downloadPdf(item.id));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    }
  }

  openAction(item: SignedConsent, kind: 'revoke' | 'void'): void {
    this.actionTarget.set(item);
    this.actionKind.set(kind);
    this.actionReason.set('');
  }

  closeAction(): void {
    if (this.actionSaving()) return;
    this.actionTarget.set(null);
    this.actionKind.set(null);
    this.actionReason.set('');
  }

  async confirmAction(): Promise<void> {
    const target = this.actionTarget();
    const kind = this.actionKind();
    const reason = this.actionReason().trim();
    if (!target || !kind || reason.length < 3) return;
    this.actionSaving.set(true);
    try {
      const updated = await firstValueFrom(
        kind === 'revoke'
          ? this.api.revoke(target.id, reason)
          : this.api.voidConsent(target.id, reason),
      );
      this.items.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      this.notice.set(kind === 'revoke' ? 'Consent revoked.' : 'Consent voided.');
      this.closeAction();
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.actionSaving.set(false);
    }
  }

  setSelect(signalRef: { set(value: string): void }, event: Event): void {
    signalRef.set((event.target as HTMLSelectElement).value);
  }

  setReason(event: Event): void {
    this.actionReason.set((event.target as HTMLTextAreaElement).value);
  }

  private selection() {
    return {
      templateId: this.selectedTemplateId(),
      signerType: this.signerType(),
      guardianId: this.signerType() === 'GUARDIAN' ? this.guardianId() || null : null,
      treatmentId: this.treatmentId() || null,
      retentionPlanId: this.retentionPlanId() || null,
    };
  }

  private resetCapture(): void {
    this.step.set(1);
    this.selectedTemplateId.set('');
    this.signerType.set('PATIENT');
    this.guardianId.set('');
    this.treatmentId.set('');
    this.retentionPlanId.set('');
    this.preview.set(null);
    this.signatureFile.set(null);
    this.signatureHasInk.set(false);
    this.acknowledgement.set(false);
    this.idempotencyKey.set('');
    this.drawerError.set(null);
    this.signaturePad?.clear();
  }
}
