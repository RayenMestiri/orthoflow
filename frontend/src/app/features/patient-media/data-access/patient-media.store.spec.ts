import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientMedia } from '../models/patient-media.models';
import { PatientMediaApiService } from './patient-media-api.service';
import { PatientMediaStore } from './patient-media.store';

function media(overrides: Partial<PatientMedia> = {}): PatientMedia {
  return {
    id: 'media-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    treatmentId: null,
    category: 'PROGRESS_PHOTO',
    mediaType: 'IMAGE',
    title: 'Progress month 6',
    description: null,
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

describe('PatientMediaStore', () => {
  let store: PatientMediaStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      listForPatient: vi.fn(() => of({ items: [media()], total: 1 })),
      upload: vi.fn(() =>
        of(
          { kind: 'progress' as const, progress: 62 },
          { kind: 'complete' as const, media: media({ id: 'uploaded' }) },
        ),
      ),
      update: vi.fn(() => of(media({ title: 'Renamed file' }))),
      archive: vi.fn(() => of(media({ status: 'ARCHIVED' }))),
    };
    TestBed.configureTestingModule({
      providers: [PatientMediaStore, { provide: PatientMediaApiService, useValue: api }],
    });
    store = TestBed.inject(PatientMediaStore);
  });

  it('loads one patient media history once', async () => {
    await store.load('patient-1');
    await store.load('patient-1');
    expect(api['listForPatient']).toHaveBeenCalledTimes(1);
    expect(store.items()).toHaveLength(1);
  });

  it('keeps the newest filter result when requests finish out of order', async () => {
    const activeResult = new Subject<{ items: PatientMedia[]; total: number }>();
    const archivedResult = new Subject<{ items: PatientMedia[]; total: number }>();
    api['listForPatient']?.mockReturnValueOnce(activeResult).mockReturnValueOnce(archivedResult);

    const activeLoad = store.load('patient-1');
    const archivedLoad = store.load('patient-1', { status: 'ARCHIVED' }, true);
    archivedResult.next({ items: [media({ id: 'archived', status: 'ARCHIVED' })], total: 1 });
    archivedResult.complete();
    await archivedLoad;
    activeResult.next({ items: [media({ id: 'active' })], total: 1 });
    activeResult.complete();
    await activeLoad;

    expect(store.items().map((item) => item.id)).toEqual(['archived']);
  });

  it('adds an upload only after the backend completion event', async () => {
    await store.load('patient-1');
    const saved = await store.upload({
      file: new File(['image'], 'progress.jpg', { type: 'image/jpeg' }),
      category: 'PROGRESS_PHOTO',
      title: 'Progress month 6',
    });
    expect(saved?.id).toBe('uploaded');
    expect(store.items()[0]?.id).toBe('uploaded');
    expect(store.uploadProgress()).toBeNull();
  });

  it('surfaces a safe upload failure and keeps existing state', async () => {
    await store.load('patient-1');
    api['upload']?.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 503,
            error: { error: { code: 'MEDIA_UPLOAD_FAILED', message: 'Upload unavailable' } },
          }),
      ),
    );
    expect(
      await store.upload({
        file: new File(['image'], 'progress.jpg', { type: 'image/jpeg' }),
        category: 'PROGRESS_PHOTO',
        title: 'Progress',
      }),
    ).toBeNull();
    expect(store.error()).toBe('Upload unavailable');
    expect(store.items()).toHaveLength(1);
  });

  it('updates metadata in place', async () => {
    await store.load('patient-1');
    await store.update('media-1', { title: 'Renamed file' });
    expect(store.items()[0]?.title).toBe('Renamed file');
  });

  it('removes an archived item from the active result without deleting it', async () => {
    await store.load('patient-1');
    const archived = await store.archive('media-1', 'Duplicate');
    expect(archived?.status).toBe('ARCHIVED');
    expect(store.items()).toEqual([]);
  });
});
