
import "server-only";

import type {
  AlertGroup,
  AlertProduct,
} from "@/lib/alerts/build-alert-groups";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string | null): string {
  if (!value) return "-";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return match
    ? `${match[3]}/${match[2]}/${match[1]}`
    : escapeHtml(value);
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}%`;
}

function getReasonLabel(product: AlertProduct): string {
  if (product.reason === "REMINDER") {
    return "Đến ngày báo lại";
  }

  return `HSD còn ${formatPercent(product.percentRemaining)} (ngưỡng ${product.thresholdPercent}%)`;
}

function htmlCell(
  value: string,
  align: "left" | "center" = "left"
): string {
  return `<td style="padding:10px;border:1px solid #dadada;vertical-align:middle;text-align:${align};overflow-wrap:anywhere">${value}</td>`;
}

function buildProductRow(product: AlertProduct): string {
  return `<tr>
    ${htmlCell(escapeHtml(product.productCode))}
    ${htmlCell(escapeHtml(product.productName))}
    ${htmlCell(formatDate(product.manufactureDate), "center")}
    ${htmlCell(formatDate(product.expiryDate), "center")}
    ${htmlCell(String(product.quantity), "center")}
    ${htmlCell(`<strong>${formatPercent(product.percentRemaining)}</strong>`, "center")}
    ${htmlCell(formatDate(product.reminderDate), "center")}
    ${htmlCell(escapeHtml(getReasonLabel(product)))}
    ${htmlCell(product.note?.trim() ? escapeHtml(product.note.trim()) : "-")}
    ${htmlCell(product.description?.trim() ? escapeHtml(product.description.trim()) : "-")}
  </tr>`;
}

export function buildAlertEmail(
  group: AlertGroup,
  today: string
): { subject: string; html: string } {
  const reminderCount = group.products.filter(
    (product) => product.reason === "REMINDER"
  ).length;

  const percentCount = group.products.filter(
    (product) => product.reason === "PERCENT"
  ).length;

  const subject = `[HSD Manager] ${group.productCount} sản phẩm cần kiểm tra`;

  const headers = [
    "Mã SP",
    "Tên SP",
    "NSX",
    "HSD",
    "SL",
    "% còn lại",
    "Ngày báo lại",
    "Lý do",
    "Note",
    "Ghi chú",
  ];

  const html = `<!doctype html>
<html lang="vi">
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222">
  <div style="max-width:1200px;margin:0 auto;padding:20px 10px">
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">

      <div style="background:#d71920;padding:18px 20px;color:#fff">
        <div style="font-size:22px;font-weight:700;color:#ffd700">
          KINGKONG MART
        </div>
        <div style="margin-top:4px;font-size:14px">
          HSD Manager · AUTO CHECK
        </div>
      </div>

      <div style="padding:20px">
        <h2 style="margin:0 0 12px;font-size:20px">
          Cảnh báo hạn sử dụng
        </h2>

        <p style="line-height:1.6">
          Hệ thống phát hiện
          <strong>${group.productCount}</strong>
          sản phẩm cần kiểm tra.
        </p>

        <p style="line-height:1.6">
          Ngày kiểm tra: <strong>${formatDate(today)}</strong><br>
          Theo ngày báo lại: <strong>${reminderCount}</strong><br>
          Theo % HSD: <strong>${percentCount}</strong>
        </p>

        <div style="overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch">
          <table role="table" style="min-width:1150px;width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f0f0f0">
                ${headers.map(
                  (label) =>
                    `<th scope="col" style="padding:10px;border:1px solid #dadada;text-align:left;white-space:nowrap">${label}</th>`
                ).join("")}
              </tr>
            </thead>

            <tbody>
              ${group.products.map(buildProductRow).join("")}
            </tbody>
          </table>
        </div>

        <p style="margin-top:20px;color:#666;font-size:12px">
          Email tự động từ HSD Manager. Vui lòng kiểm tra sản phẩm thực tế tại quầy.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}
