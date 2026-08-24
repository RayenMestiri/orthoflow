import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { toPaginationParams } from '../../common/utils/pagination.js';
import { requireAuthUser, requireTenant } from '../../common/utils/request-context.js';
import { taskService, type TaskService } from './task.service.js';
import {
  cancelTaskSchema,
  completeTaskSchema,
  createTaskSchema,
  taskListQuerySchema,
  updateTaskSchema,
} from './task.schema.js';

const taskIdParamsSchema = z.object({ taskId: z.string().min(1) });

function toDueAt(value: string | Date | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? new Date(value) : value;
}

export class TaskController {
  constructor(private readonly tasks: TaskService = taskService) {}

  async listTasks(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const { page, limit, ...filters } = taskListQuerySchema.parse(req.query);
    const pagination = toPaginationParams({ page, limit });
    const result = await this.tasks.list(
      tenant.clinicId,
      user.id,
      tenant.role,
      filters,
      pagination,
    );
    return reply.status(200).send({
      success: true,
      data: result.result.items,
      summary: result.summary,
      pagination: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.result.total,
        pages: Math.ceil(result.result.total / result.pagination.limit),
      },
    });
  }

  async getSummary(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const summary = await this.tasks.getSummary(tenant.clinicId, user.id);
    return reply.status(200).send({ success: true, data: summary });
  }

  async getTask(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const { taskId } = taskIdParamsSchema.parse(req.params);
    const data = await this.tasks.getById(tenant.clinicId, taskId);
    return reply.status(200).send({ success: true, data });
  }

  async createTask(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const body = createTaskSchema.parse(req.body);
    const data = await this.tasks.create(tenant.clinicId, user.id, {
      ...body,
      dueAt: toDueAt(body.dueAt),
    });
    return reply.status(201).send({ success: true, data });
  }

  async updateTask(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const { taskId } = taskIdParamsSchema.parse(req.params);
    const body = updateTaskSchema.parse(req.body);
    const data = await this.tasks.update(tenant.clinicId, user.id, taskId, {
      ...body,
      dueAt: toDueAt(body.dueAt),
    });
    return reply.status(200).send({ success: true, data });
  }

  async startTask(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const { taskId } = taskIdParamsSchema.parse(req.params);
    const data = await this.tasks.start(tenant.clinicId, user.id, taskId);
    return reply.status(200).send({ success: true, data });
  }

  async completeTask(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const { taskId } = taskIdParamsSchema.parse(req.params);
    const data = await this.tasks.complete(
      tenant.clinicId,
      user.id,
      taskId,
      completeTaskSchema.parse(req.body),
    );
    return reply.status(200).send({ success: true, data });
  }

  async cancelTask(req: FastifyRequest, reply: FastifyReply) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const { taskId } = taskIdParamsSchema.parse(req.params);
    const data = await this.tasks.cancel(
      tenant.clinicId,
      user.id,
      taskId,
      cancelTaskSchema.parse(req.body),
    );
    return reply.status(200).send({ success: true, data });
  }
}

export const taskController = new TaskController();
