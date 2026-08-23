import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import { taskController } from './task.controller.js';
import {
  cancelTaskSchema,
  completeTaskSchema,
  createTaskSchema,
  taskDtoSchema,
  taskListQuerySchema,
  taskSummaryDtoSchema,
  updateTaskSchema,
} from './task.schema.js';

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  // GET /api/v1/tasks - List tasks
  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_READ)],
      schema: {
        tags: ['tasks'],
        summary: 'List clinic tasks with summary and filters',
        security: [{ bearerAuth: [] }],
        querystring: taskListQuerySchema,
        response: {
          200: z.object({
            success: z.literal(true),
            data: z.array(taskDtoSchema),
            summary: taskSummaryDtoSchema,
            pagination: z.object({
              page: z.number(),
              limit: z.number(),
              total: z.number(),
              pages: z.number(),
            }),
          }),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    (req, reply) => taskController.listTasks(req as any, reply),
  );

  // GET /api/v1/tasks/summary - Counters summary
  app.get(
    '/summary',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_READ)],
      schema: {
        tags: ['tasks'],
        summary: 'Get compact task counters for user',
        security: [{ bearerAuth: [] }],
        response: {
          200: successSchema(taskSummaryDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    (req, reply) => taskController.getSummary(req as any, reply),
  );

  // GET /api/v1/tasks/:taskId - Single task
  app.get(
    '/:taskId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_READ)],
      schema: {
        tags: ['tasks'],
        summary: 'Get task by ID',
        security: [{ bearerAuth: [] }],
        params: z.object({ taskId: z.string() }),
        response: {
          200: successSchema(taskDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    (req, reply) => taskController.getTask(req as any, reply),
  );

  // POST /api/v1/tasks - Create task
  app.post(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_CREATE)],
      schema: {
        tags: ['tasks'],
        summary: 'Create a new task',
        security: [{ bearerAuth: [] }],
        body: createTaskSchema,
        response: {
          201: successSchema(taskDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    (req, reply) => taskController.createTask(req as any, reply),
  );

  // PATCH /api/v1/tasks/:taskId - Update task
  app.patch(
    '/:taskId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_UPDATE)],
      schema: {
        tags: ['tasks'],
        summary: 'Update task title, priority, due date or assignee',
        security: [{ bearerAuth: [] }],
        params: z.object({ taskId: z.string() }),
        body: updateTaskSchema,
        response: {
          200: successSchema(taskDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    (req, reply) => taskController.updateTask(req as any, reply),
  );

  // POST /api/v1/tasks/:taskId/start - Start task
  app.post(
    '/:taskId/start',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_UPDATE)],
      schema: {
        tags: ['tasks'],
        summary: 'Transition task to IN_PROGRESS',
        security: [{ bearerAuth: [] }],
        params: z.object({ taskId: z.string() }),
        response: {
          200: successSchema(taskDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    (req, reply) => taskController.startTask(req as any, reply),
  );

  // POST /api/v1/tasks/:taskId/complete - Complete task
  app.post(
    '/:taskId/complete',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_UPDATE)],
      schema: {
        tags: ['tasks'],
        summary: 'Complete a task',
        security: [{ bearerAuth: [] }],
        params: z.object({ taskId: z.string() }),
        body: completeTaskSchema,
        response: {
          200: successSchema(taskDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    (req, reply) => taskController.completeTask(req as any, reply),
  );

  // POST /api/v1/tasks/:taskId/cancel - Cancel task
  app.post(
    '/:taskId/cancel',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TASK_CANCEL)],
      schema: {
        tags: ['tasks'],
        summary: 'Cancel a task with reason',
        security: [{ bearerAuth: [] }],
        params: z.object({ taskId: z.string() }),
        body: cancelTaskSchema,
        response: {
          200: successSchema(taskDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    (req, reply) => taskController.cancelTask(req as any, reply),
  );
};
