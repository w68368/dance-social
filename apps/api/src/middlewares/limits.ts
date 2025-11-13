import { rateLimit } from "express-rate-limit";

/**
 * /auth/forgot — запрос письма для сброса пароля
 *  - до 5 запросов в час с одного IP
 */
export const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many reset requests from this IP. Please try again later.",
  },
});

/**
 * /auth/reset — установка нового пароля по токену
 *  - до 10 попыток в час с одного IP
 */
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many reset attempts from this IP. Please try again later.",
  },
});

/**
 * /auth/login — попытки входа
 *  - до 20 попыток за 15 минут
 * (дополняет вашу внутреннюю блокировку по счётчику)
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many login attempts. Please try again later.",
  },
});

/**
 * /auth/register-start — старт регистрации (отправка кода)
 *  - до 5 запросов в час
 */
export const registerStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many register attempts. Please try again later.",
  },
});

/**
 * /auth/register-verify — проверка кода (ввод 6-значного кода)
 *  - до 15 попыток в час
 */
export const registerVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many verification attempts. Please try again later.",
  },
});
