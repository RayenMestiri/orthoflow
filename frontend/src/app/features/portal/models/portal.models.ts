export interface PortalTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
export interface PortalProfile {
  id: string;
  email: string;
  fullName: string;
  guardianId: string;
  clinic: { id: string; name: string; timezone: string; currency: string };
}
export interface PortalSession {
  user: PortalProfile;
  tokens: PortalTokens;
}
export interface PortalAppointment {
  id: string;
  patientId: string;
  childName: string;
  startAt: string;
  endAt: string;
  typeLabel: string;
  treatmentLabel: string | null;
  status: 'SCHEDULED' | 'CONFIRMED' | 'VISIT_IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
}
export interface PortalChildSummary {
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
  nextAppointment: PortalAppointment | null;
}
export interface PortalChildOverview {
  child: PortalChildSummary;
  latestVisit: {
    id: string;
    visitAt: string;
    visitLabel: string;
    patientInstructions: string | null;
    nextRecommendedVisitAt: string | null;
  } | null;
  clinic: {
    name: string;
    phone: string | null;
    email: string | null;
    timezone: string;
    currency: string;
  };
}
export interface PortalFinance {
  summary: {
    patientId: string;
    treatmentId: string | null;
    currency: string;
    agreedAmountMinor: number | null;
    recordedAmountMinor: number;
    remainingAmountMinor: number | null;
    recordCount: number;
    cancelledCount: number;
  };
  payments: {
    id: string;
    amountMinor: number;
    currency: string;
    paymentMethod: string;
    receivedAt: string;
    status: string;
    receiptId: string | null;
    countsTowardBalance: boolean;
  }[];
}
export interface PortalDocument {
  id: string;
  patientId: string;
  title: string;
  category: string;
  status: string;
  generatedAt: string;
  sharedAt: string;
  downloadPath: string;
}
export interface PortalConsent {
  id: string;
  patientId: string;
  title: string;
  category: string;
  status: string;
  signedAt: string;
  signerName: string;
  downloadPath: string;
}
export interface PortalReceipt {
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
export interface ApiEnvelope<T> {
  success: true;
  data: T;
}
