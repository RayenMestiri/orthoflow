import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortalProfile, PortalSession } from '../models/portal.models';
import { PortalApiService } from './portal-api.service';
import { PortalAuthStore } from './portal-auth.store';

const profile: PortalProfile = {
  id: 'portal-user-1',
  email: 'guardian@example.test',
  fullName: 'Mohamed Mestiri',
  guardianId: 'guardian-1',
  clinic: {
    id: 'clinic-1',
    name: 'OrthoFlow Clinic',
    timezone: 'Africa/Tunis',
    currency: 'TND',
  },
};

const session: PortalSession = {
  user: profile,
  tokens: { accessToken: 'portal-access-token', tokenType: 'Bearer', expiresIn: 900 },
};

describe('PortalAuthStore', () => {
  let store: PortalAuthStore;
  let api: {
    activate: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    me: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      activate: vi.fn(() => of(session)),
      login: vi.fn(() => of(session)),
      refresh: vi.fn(() => of(session.tokens)),
      logout: vi.fn(() => of(undefined)),
      me: vi.fn(() => of(profile)),
    };
    TestBed.configureTestingModule({
      providers: [PortalAuthStore, { provide: PortalApiService, useValue: api }],
    });
    store = TestBed.inject(PortalAuthStore);
  });

  it('initializes from the private refresh cookie without storing a refresh token', async () => {
    await store.ensureInitialized();

    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(store.authenticated()).toBe(true);
    expect(store.token()).toBe('portal-access-token');
    expect(store.profile()).toEqual(profile);
  });

  it('deduplicates concurrent refresh requests', async () => {
    await Promise.all([store.refreshOnce(), store.refreshOnce(), store.refreshOnce()]);

    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(store.token()).toBe('portal-access-token');
  });

  it('clears portal identity when refresh is rejected', async () => {
    api.refresh.mockReturnValue(throwError(() => new Error('revoked')));

    await store.ensureInitialized();

    expect(store.status()).toBe('guest');
    expect(store.authenticated()).toBe(false);
    expect(store.token()).toBeNull();
  });

  it('applies login state and clears it after logout', async () => {
    await store.login('guardian@example.test', 'strong-password');
    expect(store.authenticated()).toBe(true);

    await store.logout();

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(store.status()).toBe('guest');
    expect(store.profile()).toBeNull();
  });
});
