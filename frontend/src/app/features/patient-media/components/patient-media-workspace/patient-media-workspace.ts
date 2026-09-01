import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { PatientMediaStore } from '../../data-access/patient-media.store';
import {
  PATIENT_MEDIA_CATEGORIES,
  patientMediaCategoryLabel,
  patientMediaDefaultTitle,
  type PatientMedia,
  type PatientMediaCategory,
  type TreatmentMediaOption,
} from '../../models/patient-media.models';
import {
  createLocalPreview,
  formatPatientMediaSize,
  patientMediaPreviewUrl,
  patientMediaThumbnailUrl,
  revokeLocalPreview,
  validatePatientMediaFile,
} from '../../utils/patient-media.utils';

export type WorkspaceFilter = 'ALL' | 'PHOTOS' | 'XRAYS' | 'DOCUMENTS' | 'ARCHIVED';
export type DrawerMode = 'upload' | 'preview' | 'edit';
export type SortOrder = 'newest' | 'oldest';

const DOCUMENT_CATEGORIES: ReadonlySet<PatientMediaCategory> = new Set([
  'PRESCRIPTION',
  'CONSENT',
  'REFERRAL',
  'REPORT',
  'ADMINISTRATIVE',
  'OTHER',
]);

const PHOTO_CATEGORIES: ReadonlySet<PatientMediaCategory> = new Set([
  'PROFILE_PHOTO',
  'EXTRAORAL_PHOTO',
  'INTRAORAL_PHOTO',
  'PROGRESS_PHOTO',
]);

const XRAY_CATEGORIES: ReadonlySet<PatientMediaCategory> = new Set(['XRAY', 'SCAN']);

@Component({
  selector: 'app-patient-media-workspace',
  imports: [A11yModule, DatePipe, ReactiveFormsModule],
  providers: [PatientMediaStore],
  templateUrl: './patient-media-workspace.html',
  styleUrl: './patient-media-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientMediaWorkspace implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly workspaceFilters: readonly { value: WorkspaceFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'PHOTOS', label: 'Photos' },
    { value: 'XRAYS', label: 'X-rays & Scans' },
    { value: 'DOCUMENTS', label: 'Documents' },
    { value: 'ARCHIVED', label: 'Archived' },
  ];

  protected readonly store = inject(PatientMediaStore);

  readonly patientId = input.required<string>();
  readonly canManage = input(false);
  readonly treatmentOptions = input<TreatmentMediaOption[]>([]);
  readonly manageableCategories = input<readonly PatientMediaCategory[]>(PATIENT_MEDIA_CATEGORIES);

  protected readonly categories = computed(() => this.manageableCategories());
  protected readonly activeFilter = signal<WorkspaceFilter>('ALL');
  protected readonly sortOrder = signal<SortOrder>('newest');
  protected readonly drawerMode = signal<DrawerMode | null>(null);
  protected readonly selected = signal<PatientMedia | null>(null);
  protected readonly archiveTarget = signal<PatientMedia | null>(null);
  protected readonly deleteTarget = signal<PatientMedia | null>(null);
  protected readonly replaceTarget = signal<PatientMedia | null>(null);
  protected readonly replaceSelectedFile = signal<File | null>(null);
  protected readonly replaceFileError = signal<string | null>(null);
  protected readonly replaceLocalPreview = signal<string | null>(null);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly isDragging = signal(false);
  /** Tracks IDs of images that failed to load in the browser to display an elegant fallback */
  protected readonly failedImages = signal<ReadonlySet<string>>(new Set());
  /** Local ObjectURL for image preview before upload. Always string | null. */
  protected readonly localPreviewUrl = signal<string | null>(null);

  /** Template ref for the native file input — needed to reset its value on replaceFile(). */
  @ViewChild('fileInput') private readonly fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('replaceInput') protected readonly replaceInputRef?: ElementRef<HTMLInputElement>;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly archiveReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });
  protected readonly mediaForm = new FormGroup({
    category: new FormControl<PatientMediaCategory>('PROGRESS_PHOTO', { nonNullable: true }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    capturedAt: new FormControl('', { nonNullable: true }),
    treatmentId: new FormControl('', { nonNullable: true }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
  });

  protected isDocumentMedia(item: PatientMedia): boolean {
    return item.mediaType !== 'IMAGE' || DOCUMENT_CATEGORIES.has(item.category);
  }

  protected readonly visibleItems = computed(() => {
    const items = this.store.items();
    const filter = this.activeFilter();
    let filtered: PatientMedia[];
    switch (filter) {
      case 'PHOTOS':
        filtered = items.filter(
          (item) =>
            PHOTO_CATEGORIES.has(item.category) ||
            (item.mediaType === 'IMAGE' &&
              !XRAY_CATEGORIES.has(item.category) &&
              !DOCUMENT_CATEGORIES.has(item.category)),
        );
        break;
      case 'XRAYS':
        filtered = items.filter((item) => XRAY_CATEGORIES.has(item.category));
        break;
      case 'DOCUMENTS':
        filtered = items.filter(
          (item) => item.mediaType !== 'IMAGE' || DOCUMENT_CATEGORIES.has(item.category),
        );
        break;
      default:
        filtered = items;
    }
    // Client-side sort (API returns newest first by default)
    if (this.sortOrder() === 'oldest') {
      return [...filtered].reverse();
    }
    return filtered;
  });

  protected readonly imageItems = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'DOCUMENTS') {
      return [];
    }
    return this.visibleItems().filter((item) => !this.isDocumentMedia(item));
  });

  protected readonly documentItems = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'PHOTOS' || filter === 'XRAYS') {
      return [];
    }
    return this.visibleItems().filter((item) => this.isDocumentMedia(item));
  });

  constructor() {
    effect(() => {
      const patientId = this.patientId();
      if (!patientId) return;
      void this.store.load(patientId).then(() => {
        // Auto-retry once on server errors (transient backend restart)
        if (this.store.error()) {
          setTimeout(() => void this.retryLoad(), 1500);
        }
      });
    });

    // Scroll lock when drawer or archive dialog is open
    effect((onCleanup) => {
      if (this.drawerMode() === null && this.archiveTarget() === null) return;
      const previousOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      onCleanup(() => {
        this.document.body.style.overflow = previousOverflow;
      });
    });

    // Debounced search — no button click needed
    this.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.applySearch());
  }

  ngOnDestroy(): void {
    revokeLocalPreview(this.localPreviewUrl());
  }

  protected categoryLabel(category: PatientMediaCategory): string {
    return patientMediaCategoryLabel(category);
  }

  protected fileSize(bytes: number): string {
    return formatPatientMediaSize(bytes);
  }

  protected thumbnail(media: PatientMedia): string {
    const url = patientMediaThumbnailUrl(media);
    console.log('🖼️ [Patient Media Thumbnail]', {
      id: media.id,
      title: media.title,
      type: media.mediaType,
      contentUrl: media.contentUrl,
      thumbnailUrl: url,
    });
    return url;
  }

  protected previewUrl(media: PatientMedia): string {
    const url = patientMediaPreviewUrl(media);
    console.log('🔍 [Patient Media Full Preview]', {
      id: media.id,
      title: media.title,
      type: media.mediaType,
      contentUrl: media.contentUrl,
      fullPreviewUrl: url,
    });
    return url;
  }

  protected onImageError(mediaId: string): void {
    console.error('❌ [Patient Media Image Load ERROR] Failed to load image thumbnail for media ID:', mediaId);
    this.failedImages.update((set) => new Set([...set, mediaId]));
  }

  protected hasImageError(mediaId: string): boolean {
    return this.failedImages().has(mediaId);
  }

  protected treatmentLabel(treatmentId: string | null): string | null {
    if (!treatmentId) return null;
    return (
      this.treatmentOptions().find((option) => option.id === treatmentId)?.label ?? 'Treatment'
    );
  }

  protected async selectFilter(filter: WorkspaceFilter): Promise<void> {
    this.activeFilter.set(filter);
    await this.store.load(
      this.patientId(),
      {
        status: filter === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        search: this.search.value.trim() || undefined,
        page: 1,
        limit: 60,
      },
      true,
    );
  }

  protected async applySearch(): Promise<void> {
    await this.store.load(
      this.patientId(),
      {
        status: this.activeFilter() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        search: this.search.value.trim() || undefined,
        page: 1,
        limit: 60,
      },
      true,
    );
  }

  /** Re-fetches with the current active filter. Called from the error banner Retry button. */
  protected async retryLoad(): Promise<void> {
    await this.store.load(
      this.patientId(),
      {
        status: this.activeFilter() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        search: this.search.value.trim() || undefined,
        page: 1,
        limit: 60,
      },
      true,
    );
  }

  protected openUpload(): void {
    this.selectedFile.set(null);
    this.fileError.set(null);
    revokeLocalPreview(this.localPreviewUrl());
    this.localPreviewUrl.set(null);
    const defaultCat = this.categories().includes('PROGRESS_PHOTO')
      ? 'PROGRESS_PHOTO'
      : (this.categories().find((c) => c !== 'PROFILE_PHOTO') ?? 'ADMINISTRATIVE');
    this.mediaForm.reset({
      category: defaultCat,
      title: '',
      capturedAt: '',
      treatmentId: '',
      description: '',
    });
    this.drawerMode.set('upload');
  }

  protected openPreview(media: PatientMedia): void {
    this.selected.set(media);
    this.drawerMode.set('preview');
  }

  protected openEdit(media: PatientMedia): void {
    if (!this.canManageItem(media)) return;
    this.selected.set(media);
    this.mediaForm.reset({
      category: media.category,
      title: media.title,
      capturedAt: media.capturedAt?.slice(0, 10) ?? '',
      treatmentId: media.treatmentId ?? '',
      description: media.description ?? '',
    });
    this.drawerMode.set('edit');
  }

  protected closeDrawer(): void {
    if (!this.store.isSaving()) {
      this.drawerMode.set(null);
      revokeLocalPreview(this.localPreviewUrl());
      this.localPreviewUrl.set(null);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  protected onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) this.processSelectedFile(file);
  }

  protected fileChanged(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file) this.processSelectedFile(file);
  }

  protected processSelectedFile(file: File): void {
    this.selectedFile.set(file);
    const error = validatePatientMediaFile(file);
    this.fileError.set(error);

    // Auto-switch category from photo to document when a PDF is selected
    if (file.type === 'application/pdf') {
      const photoCategories: PatientMediaCategory[] = [
        'PROFILE_PHOTO',
        'EXTRAORAL_PHOTO',
        'INTRAORAL_PHOTO',
        'PROGRESS_PHOTO',
      ];
      if (photoCategories.includes(this.mediaForm.controls.category.value)) {
        const docCat =
          this.categories().find((c) => !photoCategories.includes(c)) ?? 'ADMINISTRATIVE';
        this.mediaForm.controls.category.setValue(docCat);
      }
    }

    // Revoke old preview and create new one for images
    revokeLocalPreview(this.localPreviewUrl());
    this.localPreviewUrl.set(!error ? createLocalPreview(file) : null);

    if (!error && !this.mediaForm.controls.title.value.trim()) {
      this.mediaForm.controls.title.setValue(
        file.name
          .replace(/\.[^.]+$/, '')
          .replaceAll(/[-_]+/g, ' ')
          .slice(0, 120),
      );
    }
  }

  protected replaceFile(): void {
    revokeLocalPreview(this.localPreviewUrl());
    this.localPreviewUrl.set(null);
    this.selectedFile.set(null);
    this.fileError.set(null);
    if (this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.value = '';
    }
  }

  protected categoryChanged(): void {
    if (!this.mediaForm.controls.title.dirty) {
      this.mediaForm.controls.title.setValue(
        patientMediaDefaultTitle(this.mediaForm.controls.category.value),
      );
    }
  }

  protected async saveUpload(): Promise<void> {
    const file = this.selectedFile();
    if (!file) this.fileError.set('Choose a file to upload.');
    if (this.mediaForm.invalid || !file || this.fileError()) {
      this.mediaForm.markAllAsTouched();
      return;
    }
    const value = this.mediaForm.getRawValue();
    const saved = await this.store.upload({
      file,
      category: value.category,
      title: value.title.trim(),
      description: value.description.trim() || null,
      treatmentId: value.treatmentId || null,
      capturedAt: this.toInstant(value.capturedAt),
    });
    if (saved) {
      revokeLocalPreview(this.localPreviewUrl());
      this.localPreviewUrl.set(null);
      this.drawerMode.set(null);
      this.openPreview(saved);
    }
  }

  protected async saveEdit(): Promise<void> {
    const media = this.selected();
    if (!media || this.mediaForm.invalid) {
      this.mediaForm.markAllAsTouched();
      return;
    }
    const value = this.mediaForm.getRawValue();
    const saved = await this.store.update(media.id, {
      category: value.category,
      title: value.title.trim(),
      description: value.description.trim() || null,
      treatmentId: value.treatmentId || null,
      capturedAt: this.toInstant(value.capturedAt),
    });
    if (saved) {
      this.selected.set(saved);
      this.drawerMode.set('preview');
    }
  }

  protected confirmArchive(media: PatientMedia): void {
    if (!this.canManageItem(media)) return;
    this.archiveReason.reset('');
    this.archiveTarget.set(media);
  }

  protected closeArchive(): void {
    if (!this.store.isSaving()) this.archiveTarget.set(null);
  }

  protected async archive(): Promise<void> {
    const media = this.archiveTarget();
    if (!media || this.archiveReason.invalid) return;
    const saved = await this.store.archive(media.id, this.archiveReason.value.trim() || null);
    if (saved) {
      this.archiveTarget.set(null);
      this.drawerMode.set(null);
      this.selected.set(null);
    }
  }

  protected confirmDelete(media: PatientMedia): void {
    if (!this.canManageItem(media)) return;
    this.deleteTarget.set(media);
  }

  protected closeDelete(): void {
    if (!this.store.isSaving()) this.deleteTarget.set(null);
  }

  protected async executeDelete(): Promise<void> {
    const media = this.deleteTarget();
    if (!media) return;
    const success = await this.store.delete(media.id);
    if (success) {
      this.deleteTarget.set(null);
      if (this.selected()?.id === media.id) {
        this.drawerMode.set(null);
        this.selected.set(null);
      }
    }
  }

  protected async restore(): Promise<void> {
    const media = this.selected();
    if (!media) return;
    const saved = await this.store.restore(media.id);
    if (saved) {
      this.drawerMode.set(null);
      this.selected.set(null);
    }
  }

  /**
   * Restores an archived media item directly from the gallery/list without
   * requiring the preview drawer to be open first.
   * Called from Restore buttons on image cards and document rows.
   */
  protected async restoreItem(media: PatientMedia): Promise<void> {
    if (!this.canManageItem(media)) return;
    await this.store.restore(media.id);
  }

  /** Opens the replace-image file picker for an existing item. */
  protected openReplaceImage(media: PatientMedia): void {
    if (!this.canManageItem(media)) return;
    this.replaceTarget.set(media);
    this.replaceSelectedFile.set(null);
    this.replaceFileError.set(null);
    revokeLocalPreview(this.replaceLocalPreview());
    this.replaceLocalPreview.set(null);
    setTimeout(() => this.replaceInputRef?.nativeElement?.click(), 0);
  }

  protected replaceImageFileChanged(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    const error = validatePatientMediaFile(file);
    this.replaceFileError.set(error);
    this.replaceSelectedFile.set(error ? null : file);
    revokeLocalPreview(this.replaceLocalPreview());
    this.replaceLocalPreview.set(file && !error ? createLocalPreview(file) : null);
    // Reset native input so same file can be selected again if needed
    if (this.replaceInputRef?.nativeElement) this.replaceInputRef.nativeElement.value = '';
  }

  protected cancelReplaceImage(): void {
    revokeLocalPreview(this.replaceLocalPreview());
    this.replaceLocalPreview.set(null);
    this.replaceSelectedFile.set(null);
    this.replaceFileError.set(null);
    this.replaceTarget.set(null);
  }

  protected async saveReplaceImage(): Promise<void> {
    const media = this.replaceTarget();
    const file = this.replaceSelectedFile();
    if (!media || !file || this.replaceFileError()) return;
    const saved = await this.store.replaceFile(media.id, file);
    if (saved) {
      revokeLocalPreview(this.replaceLocalPreview());
      this.replaceLocalPreview.set(null);
      this.replaceTarget.set(null);
      this.replaceSelectedFile.set(null);
      // Update the selected item in case the drawer is open
      if (this.selected()?.id === saved.id) this.selected.set(saved);
    }
  }

  protected setSortOrder(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SortOrder;
    this.sortOrder.set(value);
  }

  /**
   * Native submit would reload the patient profile and abandon the in-flight
   * archive request. These forms carry no `formGroup`/`ngForm`, so no Angular
   * directive cancels the default for us — the handler must do it explicitly.
   */
  protected submitArchive(event: SubmitEvent): void {
    event.preventDefault();
    void this.archive();
  }

  protected canManageItem(media: PatientMedia): boolean {
    return this.canManage() && this.categories().includes(media.category);
  }

  private toInstant(day: string): string | null {
    return day ? new Date(`${day}T12:00:00.000Z`).toISOString() : null;
  }
}
