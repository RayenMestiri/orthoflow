import { A11yModule } from '@angular/cdk/a11y';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { GeneratedDocumentsApiService } from '../../data-access/generated-documents-api.service';
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, type DocumentBlock, type DocumentCategory, type DocumentTemplate } from '../../models/generated-document.models';

const VARIABLES: Readonly<Record<DocumentCategory, readonly string[]>> = {
  ATTENDANCE_CERTIFICATE: ['patient.fullName', 'appointment.date', 'appointment.time', 'appointment.type', 'clinic.name', 'doctor.fullName'],
  PATIENT_SUMMARY: ['patient.fullName', 'patient.birthDate', 'patient.referenceNumber', 'guardian.fullName', 'treatment.type', 'treatment.status', 'retention.status'],
  TREATMENT_SUMMARY: ['patient.fullName', 'treatment.type', 'treatment.status', 'treatment.startDate', 'treatment.expectedEndDate', 'treatment.completedAt'],
  REFERRAL_LETTER: ['patient.fullName', 'referral.recipient', 'referral.reason', 'referral.message', 'treatment.type', 'doctor.fullName'],
  PAYMENT_STATEMENT: ['patient.fullName', 'finance.periodStart', 'finance.periodEnd', 'finance.totalRecorded', 'finance.currency', 'finance.recordCount'],
  RETENTION_SUMMARY: ['patient.fullName', 'retention.status', 'retention.startedAt', 'retention.nextControlAt', 'treatment.type'],
  GENERAL: ['patient.fullName', 'patient.birthDate', 'patient.referenceNumber', 'clinic.name', 'clinic.address', 'clinic.phone', 'clinic.email', 'doctor.fullName', 'document.generatedAt'],
};
@Component({ selector: 'app-settings-document-templates', imports: [A11yModule, DatePipe], templateUrl: './settings-document-templates.html', styleUrl: '../../../consents/components/settings-consent-templates/settings-consent-templates.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class SettingsDocumentTemplates implements OnInit {
  private readonly api = inject(GeneratedDocumentsApiService);
  readonly canEdit = input(false);
  protected readonly categories = DOCUMENT_CATEGORIES;
  protected readonly categoryLabels = DOCUMENT_CATEGORY_LABELS;
  protected readonly templates = signal<DocumentTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<DocumentTemplate | null>(null);
  protected readonly code = signal(''); protected readonly title = signal(''); protected readonly category = signal<DocumentCategory>('GENERAL'); protected readonly definition = signal<DocumentBlock[]>([]);
  protected readonly actionTarget = signal<DocumentTemplate | null>(null); protected readonly action = signal<'activate' | 'archive' | 'version' | null>(null);
  protected readonly availableVariables = computed(() => VARIABLES[this.category()]);
  protected readonly families = computed(() => { const groups = new Map<string, DocumentTemplate[]>(); for (const template of this.templates()) groups.set(template.code, [...(groups.get(template.code) ?? []), template]); return [...groups.entries()].map(([code, versions]) => ({ code, versions: versions.sort((a, b) => b.version - a.version), latest: versions.sort((a, b) => b.version - a.version)[0]! })); });
  ngOnInit(): void { void this.load(); }
  protected async load(): Promise<void> { this.loading.set(true); try { this.templates.set(await firstValueFrom(this.api.listTemplates())); } catch (error) { this.error.set(getApiProblem(error).message); } finally { this.loading.set(false); } }
  protected openCreate(): void { this.editing.set(null); this.code.set(''); this.title.set(''); this.category.set('GENERAL'); this.definition.set([{ kind: 'HEADING', level: 1, text: 'Document for {{patient.fullName}}' }, { kind: 'PARAGRAPH', text: 'Enter clinic-approved wording.' }, { kind: 'SIGNATURE_LINE', label: 'Authorized signature' }]); this.editorOpen.set(true); }
  protected openEdit(template: DocumentTemplate): void { this.editing.set(template); this.code.set(template.code); this.title.set(template.title); this.category.set(template.category); this.definition.set(template.definition.map((block) => ({ ...block, columns: block.columns?.map((column) => ({ ...column })) }))); this.editorOpen.set(true); }
  protected closeEditor(): void { if (!this.saving()) this.editorOpen.set(false); }
  protected setText(target: { set(value: string): void }, event: Event): void { target.set((event.target as HTMLInputElement).value); }
  protected setCategory(event: Event): void { this.category.set((event.target as HTMLSelectElement).value as DocumentCategory); }
  protected addBlock(kind: DocumentBlock['kind']): void { const block: DocumentBlock = kind === 'HEADING' ? { kind, level: 2, text: 'Section heading' } : kind === 'PARAGRAPH' ? { kind, text: 'Clinic-approved wording' } : kind === 'KEY_VALUE' ? { kind, label: 'Label', value: '{{patient.fullName}}' } : kind === 'SIGNATURE_LINE' ? { kind, label: 'Authorized signature' } : { kind }; this.definition.update((items) => [...items, block]); }
  protected addTable(): void { const category = this.category(); const table = category === 'PAYMENT_STATEMENT' ? { source: 'FINANCE_RECORDS' as const, columns: [{ key: 'date', label: 'Date' }, { key: 'receipt', label: 'Receipt' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }] } : category === 'TREATMENT_SUMMARY' ? { source: 'TREATMENT_MILESTONES' as const, columns: [{ key: 'date', label: 'Date' }, { key: 'milestone', label: 'Milestone' }, { key: 'type', label: 'Type' }] } : { source: 'RETENTION_DEVICES' as const, columns: [{ key: 'type', label: 'Retainer' }, { key: 'arch', label: 'Arch' }, { key: 'delivered', label: 'Delivered' }, { key: 'status', label: 'Status' }] }; this.definition.update((items) => [...items, { kind: 'DATA_TABLE', ...table }]); }
  protected canAddTable(): boolean { return ['PAYMENT_STATEMENT', 'TREATMENT_SUMMARY', 'RETENTION_SUMMARY'].includes(this.category()); }
  protected updateBlock(index: number, field: 'text' | 'label' | 'value', event: Event): void { const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value; this.definition.update((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)); }
  protected removeBlock(index: number): void { this.definition.update((items) => items.filter((_, itemIndex) => itemIndex !== index)); }
  protected moveBlock(index: number, offset: number): void { const target = index + offset; if (target < 0 || target >= this.definition().length) return; this.definition.update((items) => { const copy = [...items]; [copy[index], copy[target]] = [copy[target]!, copy[index]!]; return copy; }); }
  protected async save(): Promise<void> { const input = { code: this.code().trim().toUpperCase(), title: this.title().trim(), category: this.category(), definition: this.definition() }; if (!/^[A-Z][A-Z0-9_-]{1,47}$/.test(input.code) || input.title.length < 2 || !input.definition.length) { this.error.set('Use a valid code, title and at least one structured block.'); return; } this.saving.set(true); try { const current = this.editing(); const saved = current ? await firstValueFrom(this.api.updateTemplate(current.id, { title: input.title, category: input.category, definition: input.definition })) : await firstValueFrom(this.api.createTemplate(input)); this.templates.update((items) => current ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]); this.notice.set(current ? 'Draft updated.' : 'Draft template created.'); this.editorOpen.set(false); } catch (error) { this.error.set(getApiProblem(error).message); } finally { this.saving.set(false); } }
  protected requestAction(template: DocumentTemplate, action: 'activate' | 'archive' | 'version'): void { this.actionTarget.set(template); this.action.set(action); }
  protected closeAction(): void { if (!this.saving()) { this.actionTarget.set(null); this.action.set(null); } }
  protected async confirmAction(): Promise<void> { const target = this.actionTarget(); const action = this.action(); if (!target || !action) return; this.saving.set(true); try { const saved = await firstValueFrom(action === 'activate' ? this.api.activateTemplate(target.id) : action === 'archive' ? this.api.archiveTemplate(target.id) : this.api.createVersion(target.id)); await this.load(); this.notice.set(`${saved.versionLabel} ${action === 'activate' ? 'activated' : action === 'archive' ? 'archived' : 'created as a draft'}.`); this.closeAction(); if (action === 'version') this.openEdit(saved); } catch (error) { this.error.set(getApiProblem(error).message); } finally { this.saving.set(false); this.actionTarget.set(null); this.action.set(null); } }
}
