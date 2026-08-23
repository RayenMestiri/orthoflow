import { z } from 'zod';
import {
  emailSchema,
  objectIdSchema,
  passwordSchema,
} from '../../common/validation/common.schemas.js';

export const portalActivateBodySchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
});
export const portalLoginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const portalRefreshBodySchema = z
  .object({ refreshToken: z.string().min(1).max(4096).optional() })
  .optional();
export const portalLogoutBodySchema = z
  .object({ allDevices: z.boolean().default(false) })
  .optional();
export const portalGuardianParamSchema = z.object({ guardianId: objectIdSchema });
export const portalChildParamSchema = z.object({ patientId: objectIdSchema });
export const portalReceiptParamSchema = portalChildParamSchema.extend({
  receiptId: objectIdSchema,
});
export const portalDocumentParamSchema = portalChildParamSchema.extend({
  documentId: objectIdSchema,
});
export const portalConsentParamSchema = portalChildParamSchema.extend({
  consentId: objectIdSchema,
});
export const portalRevokeBodySchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const portalShareBodySchema = z.object({ guardianId: objectIdSchema });
export type PortalActivateBody = z.infer<typeof portalActivateBodySchema>;
export type PortalLoginBody = z.infer<typeof portalLoginBodySchema>;
export type PortalRefreshBody = z.infer<typeof portalRefreshBodySchema>;
export type PortalLogoutBody = z.infer<typeof portalLogoutBodySchema>;
export type PortalGuardianParam = z.infer<typeof portalGuardianParamSchema>;
export type PortalChildParam = z.infer<typeof portalChildParamSchema>;
export type PortalReceiptParam = z.infer<typeof portalReceiptParamSchema>;
export type PortalDocumentParam = z.infer<typeof portalDocumentParamSchema>;
export type PortalConsentParam = z.infer<typeof portalConsentParamSchema>;
export type PortalRevokeBody = z.infer<typeof portalRevokeBodySchema>;
export type PortalShareBody = z.infer<typeof portalShareBodySchema>;
