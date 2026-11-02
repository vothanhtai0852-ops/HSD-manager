import "server-only";

export type AlertSendMode =
  | "TEST"
  | "LIVE";

function getAlertSendMode(): AlertSendMode {
  const rawMode =
    process.env.ALERT_SEND_MODE
      ?.trim()
      .toUpperCase();

  if (
    rawMode !== "TEST" &&
    rawMode !== "LIVE"
  ) {
    throw new Error(
      "ALERT_SEND_MODE phải là TEST hoặc LIVE."
    );
  }

  return rawMode;
}

export function resolveAlertRecipient(
  originalRecipientEmail: string
): {
  mode: AlertSendMode;
  originalRecipientEmail: string;
  actualRecipientEmail: string;
} {
  const mode =
    getAlertSendMode();

  const original =
    originalRecipientEmail
      .trim()
      .toLowerCase();

  if (!original) {
    throw new Error(
      "Email người nhận cảnh báo không hợp lệ."
    );
  }

  if (mode === "LIVE") {
    return {
      mode,
      originalRecipientEmail:
        original,
      actualRecipientEmail:
        original,
    };
  }

  const gmailUser =
    process.env.GMAIL_USER
      ?.trim()
      .toLowerCase();

  if (!gmailUser) {
    throw new Error(
      "Thiếu GMAIL_USER cho chế độ TEST."
    );
  }

  return {
    mode,
    originalRecipientEmail:
      original,

    actualRecipientEmail:
      gmailUser,
  };
}