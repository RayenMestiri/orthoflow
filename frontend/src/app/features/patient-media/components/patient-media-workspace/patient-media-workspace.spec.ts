import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientMediaApiService } from '../../data-access/patient-media-api.service';
import type { PatientMedia } from '../../models/patient-media.models';
import { PatientMediaWorkspace } from './patient-media-workspace';

function media(overrides: Partial<PatientMedia> = {}): PatientMedia {
  return {
    id: 'media-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    treatmentId: null,
    category: 'PROGRESS_PHOTO',
    mediaType: 'IMAGE',
    title: 'Progress month 6',
    description: 'Routine progress record.',
    storageProvider: 'CLOUDINARY',
    secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/progress.jpg',
    originalFileName: 'progress.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 1024,
    format: 'jpg',
    width: 1200,
    height: 900,
    capturedAt: '2026-08-01T12:00:00.000Z',
    uploadedAt: '2026-08-02T09:00:00.000Z',
    uploadedByUserId: 'user-1',
    status: 'ACTIVE',
    archivedAt: null,
    archivedByUserId: null,
    archiveReason: null,
    createdAt: '2026-08-02T09:00:00.000Z',
    updatedAt: '2026-08-02T09:00:00.000Z',
    ...overrides,
  };
}

describe('PatientMediaWorkspace', () => {
  let fixture: ComponentFixture<PatientMediaWorkspace>;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  async function render(items: PatientMedia[], canManage = true): Promise<HTMLElement> {
    api['listForPatient']?.mockReturnValue(of({ items, total: items.length }));
    fixture = TestBed.createComponent(PatientMediaWorkspace);
    fixture.componentRef.setInput('patientId', 'patient-1');
    fixture.componentRef.setInput('canManage', canManage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    api = {
      listForPatient: vi.fn(() => of({ items: [], total: 0 })),
      upload: vi.fn(() => of({ kind: 'complete', media: media() })),
      update: vi.fn(() => of(media())),
      archive: vi.fn(() => of(media({ status: 'ARCHIVED' }))),
    };
    TestBed.configureTestingModule({
      imports: [PatientMediaWorkspace],
      providers: [{ provide: PatientMediaApiService, useValue: api }],
    });
  });

  it('shows a useful empty state and opens the upload drawer', async () => {
    const element = await render([]);
    expect(element.textContent).toContain('No documents or photos yet');
    (element.querySelector('.media-empty .media-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Upload document');
    expect(element.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('renders images as a gallery and PDFs as compact rows', async () => {
    const element = await render([
      media(),
      media({
        id: 'pdf-1',
        category: 'CONSENT',
        mediaType: 'PDF',
        title: 'Signed consent',
        mimeType: 'application/pdf',
        originalFileName: 'consent.pdf',
        width: null,
        height: null,
      }),
    ]);
    expect(element.querySelectorAll('.media-card')).toHaveLength(1);
    expect(element.querySelectorAll('.media-document-row')).toHaveLength(1);
    expect(element.textContent).toContain('Signed consent');
  });

  it('rejects an unsupported file before calling the API', async () => {
    const element = await render([]);
    (element.querySelector('.media-empty .media-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = element.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['text'], 'notes.txt', { type: 'text/plain' })],
    });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).toContain('JPEG, PNG, WebP or PDF');
    expect(api['upload']).not.toHaveBeenCalled();
  });

  it('opens a preview and archive confirmation for an active image', async () => {
    const element = await render([media()]);
    (element.querySelector('.media-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Open original');
    (
      element.querySelector('.media-preview__actions .media-btn--danger') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Archive “Progress month 6”?');
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    const allowed = (element.querySelector('.media-dialog') as HTMLFormElement).dispatchEvent(
      submit,
    );
    await fixture.whenStable();
    expect(allowed).toBe(false);
    expect(api['archive']).toHaveBeenCalledWith('media-1', null);
  });

  it('drops an archived file from the active list and shows it under Archived', async () => {
    // The full workflow the archive bug broke: confirm, wait for the request,
    // and land on a list that reflects the new state — all without a reload.
    const element = await render([media()]);
    (element.querySelector('.media-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    (
      element.querySelector('.media-preview__actions .media-btn--danger') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    (element.querySelector('.media-dialog') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    // Gone from the active gallery, and the dialog closed itself.
    expect(element.querySelectorAll('.media-card')).toHaveLength(0);
    expect(element.querySelector('.media-dialog')).toBeNull();

    // Switching to Archived re-queries the server and shows it again.
    api['listForPatient']?.mockReturnValueOnce(
      of({ items: [media({ status: 'ARCHIVED', archiveReason: 'Duplicate scan' })], total: 1 }),
    );
    const archivedFilter = [
      ...element.querySelectorAll<HTMLButtonElement>('.media-filters button'),
    ].find((button) => button.textContent?.trim() === 'Archived');
    archivedFilter?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api['listForPatient']).toHaveBeenLastCalledWith(
      'patient-1',
      expect.objectContaining({ status: 'ARCHIVED' }),
    );
    expect(element.textContent).toContain('Archived');
  });

  it('searches without letting the browser navigate away from the profile', async () => {
    // Same failure mode as the archive dialog: a native submit reloads the page
    // and abandons the in-flight request. A cancelled event proves it cannot.
    const element = await render([media()]);
    const form = element.querySelector('.media-search') as HTMLFormElement;
    (form.querySelector('input[type="search"]') as HTMLInputElement).value = 'consent';

    const submit = new Event('submit', { bubbles: true, cancelable: true });
    const allowed = form.dispatchEvent(submit);
    await fixture.whenStable();

    expect(allowed).toBe(false);
  });

  it('limits secretary uploads to administrative documents', async () => {
    const element = await render([]);
    fixture.componentRef.setInput('manageableCategories', ['ADMINISTRATIVE']);
    fixture.detectChanges();
    (element.querySelector('.media-empty .media-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const options = [
      ...element.querySelectorAll<HTMLOptionElement>('#patient-media-category option'),
    ];
    expect(options.map((option) => option.value)).toEqual(['ADMINISTRATIVE']);
  });
});
