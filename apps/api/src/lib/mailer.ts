import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST || "";
const PORT = Number(process.env.SMTP_PORT || 2525);
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || "no-reply@localhost";

const APP_NAME = process.env.APP_NAME || "StepUnity";
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

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
   ✅ Function: send email verification code
   (registration / email change)
   ========================================================= */

type VerificationEmailContext = "register" | "change-email";

export async function sendVerificationCode(
  to: string,
  code: string,
  context: VerificationEmailContext = "register"
) {
  const subjectMap: Record<VerificationEmailContext, string> = {
    register: `${APP_NAME}: Your verification code`,
    "change-email": `${APP_NAME}: Confirm your new email`,
  };

  const descriptionMap: Record<VerificationEmailContext, string> = {
    register: "Your verification code:",
    "change-email": "Confirmation code for your new email:",
  };

  const subject = subjectMap[context];
  const description = descriptionMap[context];

  const text = [
    description,
    code,
    "",
    "The code is valid for 10 minutes.",
    "If you did not request this — simply ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;">
      <p style="font-size:16px;">${description}</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:2px;">
        ${code}
      </p>
      <p>The code is valid for <b>10 minutes</b>.</p>
      <p style="color:#666;">
        If you did not request this — simply ignore this email.
      </p>
    </div>
  `;

  console.log("[mailer] sendVerificationCode →", {
    to,
    context,
  });

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

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
) {
  const subject = `${APP_NAME}: Reset your password`;

  const text = [
    `You requested a password reset.`,
    `If this wasn’t you — simply ignore this email.`,
    ``,
    `Password reset link (valid for a limited time):`,
    resetUrl,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;">
      <p>You requested a password reset.</p>
      <p>If this wasn’t you — simply ignore this email.</p>
      <p style="margin-top:16px;">
        <a href="${resetUrl}" style="font-size:18px;">
          Reset password
        </a>
        <br />
        <small>(The link is valid for a limited time)</small>
      </p>
    </div>
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
   ✅ Function: send change password email (Settings → link)
   ========================================================= */
export async function sendChangePasswordEmail(to: string, resetUrl: string) {
  const subject = `${APP_NAME}: Change your password`;

  const text = [
    `You requested to change your password.`,
    `If this wasn’t you — you can ignore this email.`,
    ``,
    `Change password link (valid for a limited time):`,
    resetUrl,
  ].join("\n");

  const html = `
    <p>You requested to change your password.</p>
    <p>If this wasn’t you — you can ignore this email.</p>
    <p>
      <a href="${resetUrl}" style="font-size:18px;">
        Change password
      </a>
      <br />
      (The link is valid for a limited time)
    </p>
  `;

  console.log("[mailer] sendChangePasswordEmail →", to, resetUrl);

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
