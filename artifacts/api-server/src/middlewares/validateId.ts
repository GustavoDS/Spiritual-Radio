import type { Request, Response, NextFunction } from "express";
import { HttpError } from "./errorHandler.js";

/**
 * Express `router.param` handler for `:id` params.
 *
 * Usage — add this to every router that accepts `/:id`:
 *   router.param("id", validateIntegerId);
 *
 * Returns HTTP 400 for non-integer or non-positive values,
 * preventing NaN from reaching Sequelize and causing a 500.
 */
export function validateIntegerId(
  _req: Request,
  _res: Response,
  next: NextFunction,
  id: string,
): void {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    next(
      new HttpError(
        `Parâmetro inválido: "id" deve ser um inteiro positivo (recebido: "${id}")`,
        400,
      ),
    );
    return;
  }
  next();
}
