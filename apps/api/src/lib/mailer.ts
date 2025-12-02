import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST || "";
const PORT = Number(process.env.SMTP_PORT || 2525);
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || "no-reply@localhost";

const APP_NAME = process.env.APP_NAME || "StepUnity";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

export const mailer = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: false,
  auth: {
    user: USER,
    pass: PASS,
  },
});

/* =========================================================
   ✅ Function: send email verification code (registration)
   ========================================================= */
export async function sendVerificationCode(to: string, code: string) {
  const subject = `${APP_NAME}: Your verification code`;
  const text = `Your verification code: ${code} (valid for 10 minutes).`;

  const html = `
    <p style="font-size:16px;">
      Your verification code:
      <b style="font-size:24px;">${code}</b>
    </p>
    <p>The code is valid for 10 minutes.</p>
    <p>If you did not request this — simply ignore this email.</p>
  `;

  console.log("[mailer] sendVerificationCode →", to);

  await mailer.sendMail({
    from: FROM,
    to,
    subject,
    text,
    html,
  });
}


/* =========================================================
   ✅ Function: send password reset email (Forgot → Reset)
   ========================================================= */
export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const subject = `${APP_NAME}: Reset your password`;

  const text = [
    `You requested a password reset.`,
    `If this wasn’t you — simply ignore this email.`,
    ``,
    `Password reset link (valid for a limited time):`,
    resetUrl,
  ].join("\n");

  const html = `
    <p>You requested a password reset.</p>
    <p>If this wasn’t you — simply ignore this email.</p>
    <p>
      <a href="${resetUrl}" style="font-size:18px;">
        Reset password
      </a>
      <br />
      (The link is valid for a limited time)
    </p>
  `;

  console.log("[mailer] sendPasswordResetEmail →", to, resetUrl);

  await mailer.sendMail({
    from: FROM,
    to,
    subject,
    text,
    html,
  });
}


/* =========================================================
   SMTP check at API startup
   ========================================================= */
mailer
  .verify()
  .then(() => {
    console.log("[mailer] SMTP connection OK");
  })
  .catch((e) => {
    console.error("[mailer] SMTP error:", e);
  });
