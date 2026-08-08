import { z } from 'zod';
import { PLATFORM_ROLE_VALUES } from '../../common/constants/roles.js';
import { objectIdSchema } from '../../common/validation/common.schemas.js';
import { USER_STATUS_VALUES } from './user.types.js';

/** Public user representation — mirrors {@link import('./user.types.js').UserDto}. */
export const userDtoSchema = z.object({
  id: objectIdSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  platformRole: z.enum(PLATFORM_ROLE_VALUES),
  status: z.enum(USER_STATUS_VALUES),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
