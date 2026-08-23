import { A11yModule } from '@angular/cdk/a11y';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { ConsentsApiService } from '../../data-access/consents-api.service';
import {
  CONSENT_CATEGORIES,
  CONSENT_CATEGORY_LABELS,
  type ConsentCategory,
  type ConsentTemplate,
} from '../../models/consent.models';

interface TemplateFamily {
  code: string;
  latest: ConsentTemplate;
  versions: ConsentTemplate[];
}

@Component({
  selector: 'app-settings-consent-templates',
  imports: [A11yModule, DatePipe],
  templateUrl: './settings-consent-templates.html',
  styleUrl: './settings-consent-templates.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsConsentTemplates {
  private readonly api = inject(ConsentsApiService);
  readonly canEdit = input(false);
  readonly templates = signal<ConsentTemplate[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly editorOpen = signal(false);
  readonly editing = signal<ConsentTemplate | null>(null);
  readonly code = signal('');
  readonly title = signal('');
  readonly category = signal<ConsentCategory>('GENERAL');
  readonly content = signal('');
  readonly saving = signal(false);
  readonly actionTarget = signal<ConsentTemplate | null>(null);
  readonly action = signal<'activate' | 'archive' | 'version' | null>(null);

  readonly categories = CONSENT_CATEGORIES;
  readonly categoryLabels = CONSENT_CATEGORY_LABELS;
  readonly families = computed<TemplateFamily[]>(() => {
    const groups = new Map<string, ConsentTemplate[]>();
    for (const template of this.templates()) {
      groups.set(template.code, [...(groups.get(template.code) ?? []), template]);
    }
    return [...groups.entries()]
      .map(([code, versions]) => {
        versions.sort((a, b) => b.version - a.version);
        return { code, latest: versions[0], versions };
      })
      .sort((a, b) => a.latest.title.localeCompare(b.latest.title));
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.templates.set(await firstValueFrom(this.api.listTemplates()));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.code.set('');
    this.title.set('');
    this.category.set('GENERAL');
    this.content.set('');
    this.editorOpen.set(true);
  }

  openEdit(template: ConsentTemplate): void {
    if (template.status !== 'DRAFT') return;
    this.editing.set(template);
    this.code.set(template.code);
    this.title.set(template.title);
    this.category.set(template.category);
    this.content.set(template.content);
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (!this.saving()) this.editorOpen.set(false);
  }

  async save(): Promise<void> {
    const code = this.code().trim().toUpperCase();
    const title = this.title().trim();
    const content = this.content().trim();
    if (!/^[A-Z][A-Z0-9_-]{1,47}$/.test(code) || title.length < 2 || content.length < 20) {
      this.error.set('Use a valid code, title, and at least 20 characters of clinic-approved content.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const current = this.editing();
      const saved = current
        ? await firstValueFrom(
            this.api.updateTemplate(current.id, { title, category: this.category(), content }),
          )
        : await firstValueFrom(
            this.api.createTemplate({ code, title, category: this.category(), content }),
          );
      this.templates.update((items) =>
        current ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items],
      );
      this.notice.set(current ? 'Draft updated.' : 'Draft template created.');
      this.editorOpen.set(false);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  requestAction(template: ConsentTemplate, action: 'activate' | 'archive' | 'version'): void {
    this.actionTarget.set(template);
    this.action.set(action);
  }

  closeAction(): void {
    if (!this.saving()) {
      this.actionTarget.set(null);
      this.action.set(null);
    }
  }

  async confirmAction(): Promise<void> {
    const target = this.actionTarget();
    const action = this.action();
    if (!target || !action) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(
        action === 'activate'
          ? this.api.activateTemplate(target.id)
          : action === 'archive'
            ? this.api.archiveTemplate(target.id)
            : this.api.createVersion(target.id),
      );
      await this.load();
      this.notice.set(
        action === 'activate'
          ? `${saved.versionLabel} activated.`
          : action === 'archive'
            ? `${saved.versionLabel} archived.`
            : `${saved.versionLabel} created as a draft.`,
      );
      this.closeAction();
      if (action === 'version') this.openEdit(saved);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
      this.actionTarget.set(null);
      this.action.set(null);
    }
  }

  setText(target: { set(value: string): void }, event: Event): void {
    target.set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  setCategory(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value as ConsentCategory);
  }
}
