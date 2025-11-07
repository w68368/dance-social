import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST || "";
const PORT = Number(process.env.SMTP_PORT || 2525);
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || "no-reply@localhost";

export const mailer = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: false, // <===== ОБЯЗАТЕЛЬНО ДЛЯ MAILTRAP SANDBOX
  auth: {
    user: USER,
    pass: PASS,
  },
});

export async function sendVerificationCode(to: string, code: string) {
  const subject = "Ваш код подтверждения";
  const text = `Ваш код: ${code} (действует 10 минут).`;
  const html = `
    <p>Ваш код: <b style="font-size: 24px">${code}</b></p>
    <p>Срок действия: 10 минут.</p>
  `;

  console.log("[mailer] TRY SEND", { HOST, PORT, USER, PASS, FROM });
  await mailer.sendMail({
    from: FROM,
    to,
    subject,
    text,
    html,
  });
}

// Проверим SMTP при старте
mailer
  .verify()
  .then(() => {
    console.log("[mailer] SMTP connection OK");
  })
  .catch((e) => {
    console.error("[mailer] SMTP error:", e);
  });
