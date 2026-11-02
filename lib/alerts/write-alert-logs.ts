import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import type {
  AlertProduct,
} from "@/lib/alerts/build-alert-groups";

export type AlertDeliveryStatus =
  | "SENT"
  | "FAILED";

export type AlertLogInput = {
  recipientEmail: string;
  product: AlertProduct;
  status: AlertDeliveryStatus;
  errorMessage?: string | null;
};

export async function writeAlertLogs(
  entries: AlertLogInput[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const sentAt =
    new Date().toISOString();

  const rows =
    entries.map(
      ({
        recipientEmail,
        product,
        status,
        errorMessage,
      }) => ({
        product_id:
          product.id,

        user_id:
          product.ownerUserId,

        recipient_email:
          recipientEmail
            .trim()
            .toLowerCase(),

        alert_type:
          product.reason,

        alert_percent:
          product.percentRemaining,

        threshold_percent:
          product.thresholdPercent,

        sent_at:
          status === "SENT"
            ? sentAt
            : null,

        delivery_status:
          status,

        error_message:
          status === "FAILED"
            ? (
                errorMessage ??
                "Không xác định được lỗi gửi email."
              )
            : null,
      })
    );

  const {
    error,
  } = await supabaseServer
    .from("alert_logs")
    .insert(rows);

  if (error) {
    console.error(
      "WRITE_ALERT_LOGS_ERROR:",
      error
    );

    throw new Error(
      "Không thể ghi lịch sử gửi cảnh báo."
    );
  }
}