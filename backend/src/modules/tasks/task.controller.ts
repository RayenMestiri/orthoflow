import type { FastifyReply, FastifyRequest } from 'fastify';
import { toPaginationParams } from '../../common/utils/pagination.js';
import { requireAuthUser, requireTenant } from '../../common/utils/request-context.js';
import { taskService, type TaskService } from './task.service.js';
import type { CancelTaskInput, CompleteTaskInput, CreateTaskInput, TaskListFilters, UpdateTaskInput } from './task.types.js';

export class TaskController {
  constructor(private readonly tasks: TaskService = taskService) {}

  async listTasks(
    req: FastifyRequest<{
      Querystring: TaskListFilters & { page: number; limit: number };
    }>,
    reply: FastifyReply,
  ) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const { page, limit, ...filters } = req.query;
    const pagination = toPaginationParams({ page, limit });
    const result = await this.tasks.list(tenant.clinicId, user.id, tenant.role, filters, pagination);
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

  async getTask(
    req: FastifyRequest<{
      Params: { taskId: string };
    }>,
    reply: FastifyReply,
  ) {
    const tenant = requireTenant(req);
    const data = await this.tasks.getById(tenant.clinicId, req.params.taskId);
    return reply.status(200).send({ success: true, data });
  }

  async createTask(
    req: FastifyRequest<{
      Body: CreateTaskInput;
    }>,
    reply: FastifyReply,
  ) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const data = await this.tasks.create(tenant.clinicId, user.id, req.body);
    return reply.status(201).send({ success: true, data });
  }

  async updateTask(
    req: FastifyRequest<{
      Params: { taskId: string };
      Body: UpdateTaskInput;
    }>,
    reply: FastifyReply,
  ) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const data = await this.tasks.update(tenant.clinicId, user.id, req.params.taskId, req.body);
    return reply.status(200).send({ success: true, data });
  }

  async startTask(
    req: FastifyRequest<{
      Params: { taskId: string };
    }>,
    reply: FastifyReply,
  ) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const data = await this.tasks.start(tenant.clinicId, user.id, req.params.taskId);
    return reply.status(200).send({ success: true, data });
  }

  async completeTask(
    req: FastifyRequest<{
      Params: { taskId: string };
      Body: CompleteTaskInput;
    }>,
    reply: FastifyReply,
  ) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const data = await this.tasks.complete(tenant.clinicId, user.id, req.params.taskId, req.body);
    return reply.status(200).send({ success: true, data });
  }

  async cancelTask(
    req: FastifyRequest<{
      Params: { taskId: string };
      Body: CancelTaskInput;
    }>,
    reply: FastifyReply,
  ) {
    const tenant = requireTenant(req);
    const user = requireAuthUser(req);
    const data = await this.tasks.cancel(tenant.clinicId, user.id, req.params.taskId, req.body);
    return reply.status(200).send({ success: true, data });
  }
}

export const taskController = new TaskController();
