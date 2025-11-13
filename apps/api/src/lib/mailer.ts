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
  secure: false, // Mailtrap sandbox НЕ использует SSL
  auth: {
    user: USER,
    pass: PASS,
  },
});

/* =========================================================
   ✅ Функция: отправка кода подтверждения e-mail (регистрация)
   ========================================================= */
export async function sendVerificationCode(to: string, code: string) {
  const subject = `${APP_NAME}: Ваш код подтверждения`;
  const text = `Ваш код подтверждения: ${code} (действителен 10 минут).`;

  const html = `
    <p style="font-size:16px;">
      Ваш код подтверждения:
      <b style="font-size:24px;">${code}</b>
    </p>
    <p>Код действует 10 минут.</p>
    <p>Если вы не делали запрос — просто игнорируйте это письмо.</p>
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
   ✅ Функция: отправка письма для сброса пароля (Forgot → Reset)
   ========================================================= */
export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const subject = `${APP_NAME}: Reset your password`;

  const text = [
    `Вы запросили сброс пароля.`,
    `Если это были не вы — просто проигнорируйте письмо.`,
    ``,
    `Ссылка для сброса (действует ограниченное время):`,
    resetUrl,
  ].join("\n");

  const html = `
    <p>Вы запросили сброс пароля.</p>
    <p>Если это были не вы — просто игнорируйте это письмо.</p>
    <p>
      <a href="${resetUrl}" style="font-size:18px;">
        Сбросить пароль
      </a>
      <br />
      (Ссылка действует ограниченное время)
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
   ✅ Проверка SMTP при старте API
   ========================================================= */
mailer
  .verify()
  .then(() => {
    console.log("[mailer] SMTP connection OK");
  })
  .catch((e) => {
    console.error("[mailer] SMTP error:", e);
  });
