import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import {
  addMemberHandler,
  listMembersHandler,
  removeMemberHandler,
  updateMemberHandler,
} from './membership.controller.js';
import {
  addMemberBodySchema,
  clinicScopedParamsSchema,
  membershipDtoSchema,
  membershipListQuerySchema,
  membershipParamsSchema,
  updateMemberBodySchema,
} from './membership.schema.js';

/** Mounted at `/api/v1/clinics/:clinicId/members`. */
export const membershipRoutes: FastifyPluginAsyncZod = async (app) => {
  // Every route below operates strictly inside the clinic named in the URL.
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic({ param: 'clinicId' }));

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.MEMBERSHIP_READ)],
      schema: {
        tags: ['memberships'],
        summary: 'List clinic staff',
        security: [{ bearerAuth: [] }],
        params: clinicScopedParamsSchema,
        querystring: membershipListQuerySchema,
        response: {
          200: paginatedSchema(membershipDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listMembersHandler,
  );

  app.post(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.MEMBERSHIP_CREATE)],
      schema: {
        tags: ['memberships'],
        summary: 'Add a staff member',
        description:
          'Attaches an existing OrthoFlow account to this clinic. If the email is unknown, ' +
          'supply firstName, lastName and password to create the account at the same time.',
        security: [{ bearerAuth: [] }],
        params: clinicScopedParamsSchema,
        body: addMemberBodySchema,
        response: {
          201: successSchema(membershipDtoSchema),
          ...errorResponses(400, 401, 403, 409, 422),
        },
      },
    },
    addMemberHandler,
  );

  app.patch(
    '/:membershipId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.MEMBERSHIP_UPDATE)],
      schema: {
        tags: ['memberships'],
        summary: 'Change a member role or status',
        security: [{ bearerAuth: [] }],
        params: membershipParamsSchema,
        body: updateMemberBodySchema,
        response: {
          200: successSchema(membershipDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    updateMemberHandler,
  );

  app.delete(
    '/:membershipId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.MEMBERSHIP_REMOVE)],
      schema: {
        tags: ['memberships'],
        summary: 'Remove a member from the clinic',
        description:
          'Sets the membership to REMOVED. Nothing is deleted — past appointments and cash ' +
          'records must keep resolving to the person who handled them.',
        security: [{ bearerAuth: [] }],
        params: membershipParamsSchema,
        response: {
          200: successSchema(membershipDtoSchema),
          ...errorResponses(401, 403, 404, 422),
        },
      },
    },
    removeMemberHandler,
  );
};
