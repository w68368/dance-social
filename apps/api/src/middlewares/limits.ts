import { rateLimit } from "express-rate-limit";

/**
 * /auth/forgot — request a password-reset email
 *  - up to 5 requests per hour from a single IP
 */
export const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many reset requests from this IP. Please try again later.",
  },
});


/**
 * /auth/reset — set a new password using the reset token
 *  - up to 10 attempts per hour from a single IP
 */
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many reset attempts from this IP. Please try again later.",
  },
});

/**
 * /auth/login — login attempts
 *  - up to 20 attempts per 15 minutes
 * (complements your internal lockout counter)
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many login attempts. Please try again later.",
  },
});


/**
 * /auth/register-start — start of registration (sending the code)
 *  - up to 5 requests per hour
 */
export const registerStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many register attempts. Please try again later.",
  },
});


/**
 * /auth/register-verify — verification of the code (entering the 6-digit code)
 *  - up to 15 attempts per hour
 */
export const registerVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many verification attempts. Please try again later.",
  },
});