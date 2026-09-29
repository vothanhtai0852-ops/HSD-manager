import "server-only";

import nodemailer from "nodemailer";

const gmailUser =
  process.env.GMAIL_USER;

const gmailAppPassword =
  process.env.GMAIL_APP_PASSWORD;

if (
  !gmailUser ||
  !gmailAppPassword
) {
  throw new Error(
    "Thiếu cấu hình Gmail SMTP."
  );
}

export const mailer =
  nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,

    auth: {
      user: gmailUser,
      pass: gmailAppPassword.replace(
        /\s+/g,
        ""
      ),
    },
  });

export const gmailSender =
  gmailUser;