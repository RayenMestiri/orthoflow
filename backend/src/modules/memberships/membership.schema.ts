import { z } from 'zod';
import {
  CLINIC_ROLE_VALUES,
  MEMBERSHIP_STATUS_VALUES,
  MEMBERSHIP_STATUSES,
} from '../../common/constants/roles.js';
import {
  emailSchema,
  objectIdSchema,
  paginationQuerySchema,
  passwordSchema,
  personNameSchema,
  phoneSchema,
} from '../../common/validation/common.schemas.js';
import { userDtoSchema } from '../users/user.schema.js';

/** Roles a clinic owner may grant. Platform roles are never assignable here. */
const assignableRoleSchema = z.enum(CLINIC_ROLE_VALUES);

export const membershipDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  userId: objectIdSchema,
  role: z.enum(CLINIC_ROLE_VALUES),
  status: z.enum(MEMBERSHIP_STATUS_VALUES),
  joinedAt: z.string().nullable(),
  createdAt: z.string(),
  user: userDtoSchema.optional(),
});

export const membershipListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(MEMBERSHIP_STATUS_VALUES).optional(),
  role: z.enum(CLINIC_ROLE_VALUES).optional(),
});

/**
 * One endpoint covers both "invite an existing OrthoFlow user" and "create an
 * account for a new hire": the clinic owner does not know or care whether the
 * person already has an account elsewhere on the platform.
 */
export const addMemberBodySchema = z
  .object({
    email: emailSchema,
    role: assignableRoleSchema,
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    password: passwordSchema.optional(),
  })
  .refine(
    (value) => {
      const accountFields = [value.firstName, value.lastName, value.password];
      const provided = accountFields.filter((field) => field !== undefined).length;
      return provided === 0 || provided === accountFields.length;
    },
    {
      message:
        'firstName, lastName and password must be supplied together when creating a new account',
      path: ['firstName'],
    },
  );

export const updateMemberBodySchema = z
  .object({
    role: assignableRoleSchema.optional(),
    status: z
      .enum([
        MEMBERSHIP_STATUSES.ACTIVE,
        MEMBERSHIP_STATUSES.SUSPENDED,
        MEMBERSHIP_STATUSES.REMOVED,
      ])
      .optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Provide at least one of role or status',
  });

export const membershipParamsSchema = z.object({
  clinicId: objectIdSchema,
  membershipId: objectIdSchema,
});

export const clinicScopedParamsSchema = z.object({
  clinicId: objectIdSchema,
});

export type AddMemberBody = z.infer<typeof addMemberBodySchema>;
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>;
export type MembershipListQuery = z.infer<typeof membershipListQuerySchema>;
export type MembershipParams = z.infer<typeof membershipParamsSchema>;
