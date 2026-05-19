import type { Request, Response } from "express";
import { messageService } from "./messages.service.js";
import { listMessagesQuerySchema, respondSchema, updateStatusSchema } from "./messages.validators.js";
import { created, noContent, ok, paginated, badRequest } from "../../utils/response.js";
import { logger } from "../../lib/logger.js";
import type { ContactStatus } from "../../models/ContactMessage.js";

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first?.trim() ?? null;
  }
  return req.socket.remoteAddress ?? null;
}

export async function submitContact(req: Request, res: Response): Promise<void> {
  const ip = getClientIp(req);
  const userAgent = (req.headers["user-agent"] ?? null) as string | null;
  const msg = await messageService.createContact(req.body as Parameters<typeof messageService.createContact>[0], ip, userAgent);
  logger.info("Contact message received", { id: msg.id, tipo: msg.tipo, ip });
  created(res, { id: msg.id }, "Mensagem recebida com sucesso");
}

export async function submitPrayerRequest(req: Request, res: Response): Promise<void> {
  const ip = getClientIp(req);
  const userAgent = (req.headers["user-agent"] ?? null) as string | null;
  const msg = await messageService.createPrayerRequest(req.body as Parameters<typeof messageService.createPrayerRequest>[0], ip, userAgent);
  logger.info("Prayer request received", { id: msg.id, ip });
  created(res, { id: msg.id }, "Pedido de oração recebido. Estaremos orando por você!");
}

export async function getAll(req: Request, res: Response): Promise<void> {
  const parsed = listMessagesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, parsed.error.errors.map((e) => e.message).join("; "));
    return;
  }
  const { page, limit, ...filters } = parsed.data;
  const { rows, count } = await messageService.findAll({ page, limit, ...filters });
  paginated(res, rows, count, page, limit);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const msg = await messageService.findById(Number(req.params["id"]));
  ok(res, msg);
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.errors.map((e) => e.message).join("; "));
    return;
  }
  const msg = await messageService.updateStatus(Number(req.params["id"]), parsed.data.status as ContactStatus);
  ok(res, msg, "Status atualizado");
}

export async function respond(req: Request, res: Response): Promise<void> {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.errors.map((e) => e.message).join("; "));
    return;
  }
  const userId = (req as Request & { user?: { id: number } }).user?.id;
  if (!userId) {
    badRequest(res, "Usuário não identificado");
    return;
  }
  const msg = await messageService.respond(Number(req.params["id"]), parsed.data.resposta_admin, userId);
  ok(res, msg, "Resposta registrada");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await messageService.remove(Number(req.params["id"]));
  noContent(res);
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const stats = await messageService.getStats();
  ok(res, stats);
}
