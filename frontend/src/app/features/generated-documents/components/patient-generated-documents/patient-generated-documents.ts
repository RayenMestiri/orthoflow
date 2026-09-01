import { A11yModule } from '@angular/cdk/a11y';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { openAuthenticatedPdf } from '../../../../core/http/authenticated-pdf';
import { ScheduleApiService } from '../../../schedule/data-access/schedule-api.service';
import type { Appointment } from '../../../schedule/models/schedule.models';
import { RetentionApiService } from '../../../treatments/data-access/retention-api.service';
import type { TreatmentMediaOption } from '../../../patient-media/models/patient-media.models';
import { GeneratedDocumentsApiService } from '../../data-access/generated-documents-api.service';
import {
  DOCUMENT_CATEGORY_LABELS,
  type DocumentBlock,
  type DocumentSelection,
  type DocumentTemplate,
  type GeneratedDocument,
  type GeneratedDocumentPreview,
} from '../../models/generated-document.models';

interface GuardianOption {
  id: string;
  fullName: string;
  relationship: string;
}
@Component({
  selector: 'app-patient-generated-documents',
  imports: [A11yModule, DatePipe],
  templateUrl: './patient-generated-documents.html',
  styleUrl: './patient-generated-documents.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientGeneratedDocuments implements OnInit {
  private readonly api = inject(GeneratedDocumentsApiService);
  private readonly schedule = inject(ScheduleApiService);
  private readonly retention = inject(RetentionApiService);
  readonly patientId = input.required<string>();
  readonly guardians = input<GuardianOption[]>([]);
  readonly treatmentOptions = input<TreatmentMediaOption[]>([]);
  readonly canGenerate = input(false);
  readonly canVoid = input(false);
  readonly canShare = input(false);
  protected readonly categoryLabels = DOCUMENT_CATEGORY_LABELS;
  protected readonly documents = signal<GeneratedDocument[]>([]);
  protected readonly templates = signal<DocumentTemplate[]>([]);
  protected readonly appointments = signal<Appointment[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly drawerOpen = signal(false);
  protected readonly templateId = signal('');
  protected readonly guardianId = signal('');
  protected readonly shareGuardianId = signal('');
  protected readonly treatmentId = signal('');
  protected readonly retentionPlanId = signal('');
  protected readonly appointmentId = signal('');
  protected readonly from = signal(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
  );
  protected readonly to = signal(new Date().toISOString().slice(0, 10));
  protected readonly referralRecipient = signal('');
  protected readonly referralReason = signal('');
  protected readonly referralMessage = signal('');
  protected readonly activeFilter = signal<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL');
  protected readonly archiveTarget = signal<GeneratedDocument | null>(null);
  protected readonly preview = signal<GeneratedDocumentPreview | null>(null);
  protected readonly voidTarget = signal<GeneratedDocument | null>(null);
  protected readonly voidReason = signal('');
  protected readonly totalCount = computed(() => this.documents().length);
  protected readonly activeCount = computed(
    () => this.documents().filter((d) => !d.isExpired && d.status !== 'EXPIRED').length,
  );
  protected readonly expiredCount = computed(
    () => this.documents().filter((d) => d.isExpired || d.status === 'EXPIRED').length,
  );
  protected readonly filteredDocuments = computed(() => {
    const filter = this.activeFilter();
    const docs = this.documents();
    if (filter === 'ACTIVE') return docs.filter((d) => !d.isExpired && d.status !== 'EXPIRED');
    if (filter === 'EXPIRED') return docs.filter((d) => d.isExpired || d.status === 'EXPIRED');
    return docs;
  });
  protected readonly selectedTemplate = computed(
    () => this.templates().find((item) => item.id === this.templateId()) ?? null,
  );
  protected readonly eligibleAppointments = computed(() =>
    this.appointments().filter(
      (item) =>
        item.patientId === this.patientId() &&
        ['ARRIVED', 'WAITING', 'IN_TREATMENT', 'COMPLETED'].includes(item.status),
    ),
  );

  ngOnInit(): void {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 86400000);
      const end = new Date(now.getTime() + 30 * 86400000);
      const [documents, templates, appointments] = await Promise.all([
        firstValueFrom(this.api.listPatientDocuments(this.patientId())),
        firstValueFrom(this.api.listTemplates('ACTIVE')),
        firstValueFrom(
          this.schedule.listAppointments(start.toISOString(), end.toISOString(), this.patientId()),
        ).catch(() => []),
      ]);
      console.log('📄 [Patient Generated Documents] Loaded documents count:', documents.length, documents);
      this.documents.set(documents);
      this.templates.set(templates);
      this.appointments.set(appointments);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }
  protected openCreate(): void {
    const first = this.templates()[0];
    if (first) {
      this.templateId.set(first.id);
    }
    this.resetContext();
    this.drawerOpen.set(true);
  }
  protected closeCreate(): void {
    if (!this.saving()) this.drawerOpen.set(false);
  }
  protected selectTemplate(event: Event): void {
    this.templateId.set((event.target as HTMLSelectElement).value);
    this.preview.set(null);
    this.resetContext();
  }
  protected async previewDocument(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.selectedTemplate()?.category === 'RETENTION_SUMMARY' && this.treatmentId()) {
        const plan = await firstValueFrom(this.retention.getByTreatment(this.treatmentId()));
        this.retentionPlanId.set(plan?.id ?? '');
      }
      this.preview.set(await firstValueFrom(this.api.preview(this.patientId(), this.selection())));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }
  protected async finalizeDocument(): Promise<void> {
    const preview = this.preview();
    if (!preview) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(
        this.api.finalize(this.patientId(), {
          ...this.selection(),
          previewDigest: preview.previewDigest,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      this.documents.update((items) => [saved, ...items]);
      this.notice.set(`${saved.documentRef} finalized and stored.`);
      this.drawerOpen.set(false);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }
  protected async openPdf(item: GeneratedDocument): Promise<void> {
    try {
      await openAuthenticatedPdf(this.api.downloadPdf(item.id));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    }
  }
  protected async shareDocument(item: GeneratedDocument): Promise<void> {
    const guardianId = this.shareGuardianId() || this.guardians()[0]?.id;
    if (!guardianId) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.shareWithGuardian(item.id, guardianId));
      const guardian = this.guardians().find((entry) => entry.id === guardianId);
      this.notice.set(`${item.documentRef} shared with ${guardian?.fullName ?? 'guardian'}.`);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }
  protected requestVoid(item: GeneratedDocument): void {
    this.voidTarget.set(item);
    this.voidReason.set('');
  }
  protected async confirmVoid(): Promise<void> {
    const target = this.voidTarget();
    if (!target || this.voidReason().trim().length < 3) return;
    this.saving.set(true);
    try {
      const updated = await firstValueFrom(
        this.api.voidDocument(target.id, this.voidReason().trim()),
      );
      this.documents.update((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      this.voidTarget.set(null);
      this.notice.set(`${updated.documentRef} marked void.`);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }
  protected setFilter(filter: 'ALL' | 'ACTIVE' | 'EXPIRED'): void {
    this.activeFilter.set(filter);
  }
  protected viewArchive(item: GeneratedDocument): void {
    this.archiveTarget.set(item);
  }
  protected closeArchive(): void {
    this.archiveTarget.set(null);
  }
  protected regenerateDocument(item: GeneratedDocument): void {
    this.archiveTarget.set(null);
    const template =
      this.templates().find((t) => t.id === item.templateId || t.code === item.templateCode) ??
      this.templates()[0];
    if (!template) return;
    this.templateId.set(template.id);
    this.resetContext();
    this.drawerOpen.set(true);
    void this.previewDocument();
  }
  protected cell(
    block: DocumentBlock,
    row: { cells: { key: string; value: string }[] },
    key: string,
  ): string {
    return row.cells.find((item) => item.key === key)?.value ?? '—';
  }
  protected setText(target: { set(value: string): void }, event: Event): void {
    target.set((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value);
    this.preview.set(null);
  }
  protected appointmentLabel(item: Appointment): string {
    return `${new Date(item.startAt).toLocaleString()} · ${item.appointmentType?.name ?? 'Appointment'}`;
  }
  private selection(): DocumentSelection {
    return {
      templateId: this.templateId(),
      ...(this.guardianId() ? { guardianId: this.guardianId() } : {}),
      ...(this.treatmentId() ? { treatmentId: this.treatmentId() } : {}),
      ...(this.retentionPlanId() ? { retentionPlanId: this.retentionPlanId() } : {}),
      ...(this.appointmentId() ? { appointmentId: this.appointmentId() } : {}),
      ...(this.from() ? { from: this.from() } : {}),
      ...(this.to() ? { to: this.to() } : {}),
      ...(this.referralRecipient() ? { referralRecipient: this.referralRecipient() } : {}),
      ...(this.referralReason() ? { referralReason: this.referralReason() } : {}),
      ...(this.referralMessage() ? { referralMessage: this.referralMessage() } : {}),
    };
  }
  private resetContext(): void {
    this.guardianId.set('');
    this.treatmentId.set('');
    this.retentionPlanId.set('');
    this.appointmentId.set('');
    this.referralRecipient.set('');
    this.referralReason.set('');
    this.referralMessage.set('');
    this.preview.set(null);
  }
}
