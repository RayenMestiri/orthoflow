import { z } from 'zod';
import { CLINIC_ROLE_VALUES, MEMBERSHIP_STATUS_VALUES } from '../../common/constants/roles.js';
import {
  emailSchema,
  objectIdSchema,
  passwordSchema,
  personNameSchema,
  phoneSchema,
} from '../../common/validation/common.schemas.js';
import { successSchema } from '../../common/validation/api-schemas.js';
import {
  clinicDtoSchema,
  clinicNameSchema,
  currencySchema,
  timezoneSchema,
} from '../clinics/clinic.schema.js';
import { userDtoSchema } from '../users/user.schema.js';

// --- Requests ---------------------------------------------------------------

export const registerBodySchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.nullable().optional(),
  clinic: z.object({
    name: clinicNameSchema,
    legalName: z.string().trim().max(160).nullable().optional(),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    timezone: timezoneSchema.optional(),
    currency: currencySchema.optional(),
  }),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  // Not `passwordSchema`: an existing password must not be re-validated against
  // a policy that may have tightened since the account was created.
  password: z.string().min(1, 'is required').max(128),
});

export const refreshBodySchema = z
  .object({
    /** Optional — browser clients send the httpOnly cookie instead. */
    refreshToken: z.string().min(1).max(4096).optional(),
  })
  .optional();

export const logoutBodySchema = z
  .object({
    allDevices: z.boolean().default(false),
  })
  .optional();

export const authCodeSchema = z.string().regex(/^\d{6}$/, 'must contain exactly 6 digits');

export const emailActionBodySchema = z.object({ email: emailSchema });

export const verifyEmailBodySchema = emailActionBodySchema.extend({ code: authCodeSchema });

export const resetPasswordBodySchema = verifyEmailBodySchema.extend({ password: passwordSchema });

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
export type EmailActionBody = z.infer<typeof emailActionBodySchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

// --- Responses --------------------------------------------------------------

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive().meta({ description: 'Access token lifetime in seconds' }),
});

export const membershipSummarySchema = z.object({
  clinicId: objectIdSchema,
  clinicName: z.string(),
  clinicSlug: z.string(),
  role: z.enum(CLINIC_ROLE_VALUES),
  status: z.enum(MEMBERSHIP_STATUS_VALUES),
});

export const registerResponseSchema = successSchema(
  z.object({
    user: userDtoSchema,
    clinic: clinicDtoSchema,
    memberships: z.array(membershipSummarySchema),
    tokens: authTokensSchema,
    verification: z.object({
      required: z.literal(true),
      delivery: z.enum(['SENT', 'UNAVAILABLE']),
    }),
  }),
);

export const loginResponseSchema = successSchema(
  z.object({
    user: userDtoSchema,
    memberships: z.array(membershipSummarySchema),
    tokens: authTokensSchema,
  }),
);

export const refreshResponseSchema = successSchema(z.object({ tokens: authTokensSchema }));

export const currentUserResponseSchema = successSchema(
  z.object({
    user: userDtoSchema,
    memberships: z.array(membershipSummarySchema),
  }),
);

export const logoutResponseSchema = successSchema(z.object({ loggedOut: z.literal(true) }));

export const acceptedResponseSchema = successSchema(z.object({ accepted: z.literal(true) }));
export const verifyEmailResponseSchema = successSchema(z.object({ verified: z.literal(true) }));
export const resetPasswordResponseSchema = successSchema(
  z.object({ passwordReset: z.literal(true) }),
);
