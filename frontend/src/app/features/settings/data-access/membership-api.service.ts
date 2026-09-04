import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';

export type MembershipRole =
  | 'CLINIC_OWNER'
  | 'ORTHODONTIST'
  | 'DENTIST'
  | 'SECRETARY'
  | 'ASSISTANT';

export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

export interface MemberUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface MembershipDto {
  id: string;
  clinicId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string | null;
  createdAt: string;
  user?: MemberUser;
}

export interface AddMemberBody {
  email: string;
  role: MembershipRole;
  firstName?: string;
  lastName?: string;
  password?: string;
}

export interface UpdateMemberBody {
  role?: MembershipRole;
  status?: MembershipStatus;
}

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class MembershipApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(clinicId: string): Observable<MembershipDto[]> {
    return this.http
      .get<PaginatedEnvelope<MembershipDto>>(
        `${this.base}/clinics/${clinicId}/members`,
        { params: { limit: '100' } },
      )
      .pipe(map((r) => r.data));
  }

  addMember(clinicId: string, body: AddMemberBody): Observable<MembershipDto> {
    return this.http
      .post<ApiEnvelope<MembershipDto>>(`${this.base}/clinics/${clinicId}/members`, body)
      .pipe(map((r) => r.data));
  }

  updateMember(
    clinicId: string,
    membershipId: string,
    body: UpdateMemberBody,
  ): Observable<MembershipDto> {
    return this.http
      .patch<ApiEnvelope<MembershipDto>>(
        `${this.base}/clinics/${clinicId}/members/${membershipId}`,
        body,
      )
      .pipe(map((r) => r.data));
  }

  removeMember(clinicId: string, membershipId: string): Observable<MembershipDto> {
    return this.http
      .delete<ApiEnvelope<MembershipDto>>(
        `${this.base}/clinics/${clinicId}/members/${membershipId}`,
      )
      .pipe(map((r) => r.data));
  }
}
