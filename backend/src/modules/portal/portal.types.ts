import type { Types } from 'mongoose';

export const PORTAL_USER_STATUSES = { ACTIVE: 'ACTIVE', REVOKED: 'REVOKED' } as const;
export type PortalUserStatus = (typeof PORTAL_USER_STATUSES)[keyof typeof PORTAL_USER_STATUSES];
export const PORTAL_USER_STATUS_VALUES = Object.values(PORTAL_USER_STATUSES) as [
  PortalUserStatus,
  ...PortalUserStatus[],
];

export const PORTAL_SESSION_REVOKE_REASONS = {
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  ROTATED: 'ROTATED',
  REUSE_DETECTED: 'REUSE_DETECTED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  CLINIC_REVOKED: 'CLINIC_REVOKED',
} as const;
export type PortalSessionRevokeReason =
  (typeof PORTAL_SESSION_REVOKE_REASONS)[keyof typeof PORTAL_SESSION_REVOKE_REASONS];
export const PORTAL_SESSION_REVOKE_REASON_VALUES = Object.values(PORTAL_SESSION_REVOKE_REASONS) as [
  PortalSessionRevokeReason,
  ...PortalSessionRevokeReason[],
];

export interface PortalUserAttributes {
  clinicId: Types.ObjectId;
  guardianId: Types.ObjectId;
  email: string;
  passwordHash: string;
  status: PortalUserStatus;
  emailVerifiedAt: Date;
  lastLoginAt: Date | null;
  revokedAt: Date | null;
  revokedByUserId: Types.ObjectId | null;
  revocationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type PortalUserRecord = PortalUserAttributes & { _id: Types.ObjectId };

export interface PortalSessionAttributes {
  portalUserId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: PortalSessionRevokeReason | null;
  replacedBySessionId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
export type PortalSessionRecord = PortalSessionAttributes & { _id: Types.ObjectId };

export interface PortalInvitationAttributes {
  clinicId: Types.ObjectId;
  guardianId: Types.ObjectId;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  invitedByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
export type PortalInvitationRecord = PortalInvitationAttributes & { _id: Types.ObjectId };

export interface PortalDocumentShareAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  guardianId: Types.ObjectId;
  generatedDocumentId: Types.ObjectId;
  sharedByUserId: Types.ObjectId;
  sharedAt: Date;
  revokedAt: Date | null;
  revokedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
export type PortalDocumentShareRecord = PortalDocumentShareAttributes & { _id: Types.ObjectId };

export interface AuthenticatedPortalUser {
  id: string;
  sessionId: string;
  clinicId: string;
  guardianId: string;
  email: string;
}

export interface PortalTokensDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface PortalRequestContext {
  ip: string | null;
  userAgent: string | null;
}

export type PortalAppointmentStatus =
  'SCHEDULED' | 'CONFIRMED' | 'VISIT_IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'CANCELLED';

export interface PortalAppointmentDto {
  id: string;
  patientId: string;
  childName: string;
  startAt: string;
  endAt: string;
  typeLabel: string;
  treatmentLabel: string | null;
  status: PortalAppointmentStatus;
}

export interface PortalChildSummaryDto {
  id: string;
  fullName: string;
  birthDate: string | null;
  age: number | null;
  relationship: string;
  canViewFinance: boolean;
  treatment: {
    label: string;
    status: string;
    startDate: string | null;
    expectedEndDate: string | null;
    completionDate: string | null;
  } | null;
  retention: { status: string; nextRecommendedControlAt: string | null } | null;
  nextAppointment: PortalAppointmentDto | null;
}

export interface PortalVisitSummaryDto {
  id: string;
  visitAt: string;
  visitLabel: string;
  patientInstructions: string | null;
  nextRecommendedVisitAt: string | null;
}

export interface PortalChildOverviewDto {
  child: PortalChildSummaryDto;
  latestVisit: PortalVisitSummaryDto | null;
  clinic: {
    name: string;
    phone: string | null;
    email: string | null;
    timezone: string;
    currency: string;
  };
}

export interface PortalReceiptDto {
  receiptNumber: string;
  amountMinor: number;
  amountFormatted: string;
  currency: string;
  paymentMethod: string;
  issuedAt: string;
  status: string;
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  patientName: string;
  treatmentLabel: string | null;
  payerName: string | null;
  cancellationReason: string | null;
}

export interface PortalActionItemDto {
  id: string;
  type: 'APPOINTMENT' | 'CONSENT' | 'FOLLOW_UP' | 'DOCUMENT' | 'PAYMENT';
  priority: 'HIGH' | 'NORMAL';
  title: string;
  subtitle: string;
  date: string | null;
  patientId: string;
  patientName: string;
  actionLabel: string;
  actionUrl: string;
}

export interface PortalDashboardDto {
  guardian: {
    id: string;
    fullName: string;
    email: string;
    guardianId: string;
  };
  clinic: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    timezone: string;
    currency: string;
  };
  children: PortalChildSummaryDto[];
  nextAppointment: PortalAppointmentDto | null;
  actionItems: PortalActionItemDto[];
  recentDocumentsCount: number;
}

export interface PortalConsentItemDto {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  category: string;
  status: string;
  signedAt: string;
  signerName: string;
  downloadPath: string;
}
