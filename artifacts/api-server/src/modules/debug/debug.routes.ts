import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import { authenticate, requireRole } from "../../middlewares/auth.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const router = Router();

router.use(authenticate, requireRole("admin"));

/**
 * @openapi
 * /api/debug/gemini-test:
 *   post:
 *     tags: [Debug]
 *     summary: Testa a integração Gemini diretamente (admin only)
 *     description: |
 *       Faz uma chamada simples ao provider de IA configurado e retorna a
 *       resposta bruta. Útil para diagnosticar problemas de key, endpoint ou model.
 *       **Requer role admin.**
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 default: "Escreva uma frase curta sobre esperança."
 *     responses:
 *       200:
 *         description: Diagnóstico completo
 */
router.post("/gemini-test", async (req: Request, res: Response) => {
  const prompt = (req.body as { prompt?: string }).prompt
    ?? "Escreva uma frase curta sobre esperança.";

  const PROVIDER_BASE_URLS: Record<string, string> = {
    openrouter: "https://openrouter.ai/api/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  };

  const provider = env.aiProvider;
  const model = env.aiModel || (
    provider === "gemini" ? "gemini-1.5-flash"
    : provider === "openrouter" ? "openai/gpt-4o-mini"
    : "gpt-4o-mini"
  );
  const baseURL = PROVIDER_BASE_URLS[provider];
  const keyPreview = env.aiApiKey ? `${env.aiApiKey.slice(0, 8)}…` : "(não definida)";
  const keySet = Boolean(env.aiApiKey);

  logger.info("debug/gemini-test called", { provider, model, baseURL, keyPreview });

  const config = { provider, model, baseURL: baseURL ?? "(openai default)", keyPreview, keySet };

  if (!keySet) {
    res.status(200).json({
      success: false,
      config,
      error: "AI_API_KEY não definida — sem key não é possível chamar a API",
      response: null,
    });
    return;
  }

  try {
    const client = new OpenAI({ apiKey: env.aiApiKey, baseURL });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.5,
    });

    const text = completion.choices[0]?.message.content?.trim() ?? "";
    logger.info("debug/gemini-test: success", { provider, model, chars: text.length });

    res.status(200).json({
      success: true,
      config,
      response: {
        text,
        model: completion.model,
        usage: completion.usage,
        finish_reason: completion.choices[0]?.finish_reason,
      },
    });
  } catch (err) {
    const apiErr = err as {
      status?: number;
      message?: string;
      error?: unknown;
      code?: string;
    };

    logger.error("debug/gemini-test: failed", {
      provider, model,
      status: apiErr.status,
      message: apiErr.message,
      errorBody: apiErr.error,
      code: apiErr.code,
    });

    res.status(200).json({
      success: false,
      config,
      error: {
        status: apiErr.status,
        message: apiErr.message,
        body: apiErr.error,
        code: apiErr.code,
      },
      response: null,
    });
  }
});

export default router;
