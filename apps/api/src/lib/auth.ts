import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");
    if (!token) return res.status(401).json({ error: "No token" });

    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
