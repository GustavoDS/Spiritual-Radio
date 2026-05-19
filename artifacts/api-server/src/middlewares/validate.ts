import type { Request, Response, NextFunction } from "express";
import { type ZodSchema, ZodError } from "zod";
import { badRequest } from "../utils/response.js";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = (result.error as ZodError).errors
        .map((e) => `${e.path.length > 0 ? e.path.join(".") + ": " : ""}${e.message}`)
        .join("; ");
      badRequest(res, messages);
      return;
    }
    req.body = result.data;
    next();
  };
}
