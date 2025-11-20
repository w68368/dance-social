import type { Request, Response, NextFunction } from "express";
import { verifyAccess } from "../lib/tokens.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  const token = header.slice("bearer ".length);

  try {
    const payload = verifyAccess(token);
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
}

// 🆕 Необязательная авторизация: если токен есть и валиден — проставляем userId,
// если нет/битый — просто идём дальше без 401
export function optionalAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
) {
  const header = req.get("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice("bearer ".length);
    try {
      const payload = verifyAccess(token);
      req.userId = payload.sub;
    } catch {
      // токен невалидный — просто игнорируем
    }
  }
  return next();
}
