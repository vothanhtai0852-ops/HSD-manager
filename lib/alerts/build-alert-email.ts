import "server-only";

import type {
  AlertGroup,
  AlertProduct,
} from "@/lib/alerts/build-alert-groups";

function escapeHtml(
  value: string
): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(
  value: string | null
): string {
  if (!value) {
    return "-";
  }

  const [
    year,
    month,
    day,
  ] = value.split("-");

  if (
    !year ||
    !month ||
    !day
  ) {
    return escapeHtml(value);
  }

  return `${day}/${month}/${year}`;
}

function formatPercent(
  value: number | null
): string {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}

function getReasonLabel(
  product: AlertProduct
): string {
  if (
    product.reason ===
    "REMINDER"
  ) {
    return "Ngày báo lại";
  }

  return `HSD ≤ ${product.thresholdPercent}%`;
}

function buildProductRow(
  product: AlertProduct
): string {
  const owner =
    product.ownerDisplayName?.trim() ||
    product.ownerUsername;

  return `
    <tr>
      <td style="
        padding:10px;
        border:1px solid #dddddd;
        vertical-align:top;
      ">
        ${escapeHtml(
          product.productCode
        )}
      </td>

      <td style="
        padding:10px;
        border:1px solid #dddddd;
        vertical-align:top;
      ">
        ${escapeHtml(
          product.productName
        )}
      </td>

      <td style="
        padding:10px;
        border:1px solid #dddddd;
        vertical-align:top;
      ">
        ${escapeHtml(owner)}
      </td>

      <td style="
        padding:10px;
        border:1px solid #dddddd;
        text-align:center;
        vertical-align:top;
      ">
        ${formatDate(
          product.expiryDate
        )}
      </td>

      <td style="
        padding:10px;
        border:1px solid #dddddd;
        text-align:center;
        vertical-align:top;
      ">
        ${formatPercent(
          product.percentRemaining
        )}
      </td>

      <td style="
        padding:10px;
        border:1px solid #dddddd;
        text-align:center;
        vertical-align:top;
      ">
        ${escapeHtml(
          getReasonLabel(product)
        )}
      </td>
    </tr>
  `;
}

export function buildAlertEmail(
  group: AlertGroup,
  today: string
): {
  subject: string;
  html: string;
} {
  const rows =
    group.products
      .map(buildProductRow)
      .join("");

  const reminderCount =
    group.products.filter(
      (product) =>
        product.reason ===
        "REMINDER"
    ).length;

  const percentCount =
    group.products.filter(
      (product) =>
        product.reason ===
        "PERCENT"
    ).length;

  const subject =
    `[HSD Manager] ${group.productCount} sản phẩm cần kiểm tra`;

  const html = `
    <!doctype html>
    <html>
      <body style="
        margin:0;
        padding:0;
        background:#f5f5f5;
        font-family:Arial,Helvetica,sans-serif;
        color:#222222;
      ">
        <div style="
          max-width:900px;
          margin:0 auto;
          padding:24px 12px;
        ">
          <div style="
            background:#ffffff;
            border:1px solid #e5e5e5;
            border-radius:10px;
            overflow:hidden;
          ">
            <div style="
              background:#b00000;
              padding:18px 20px;
              color:#ffffff;
            ">
              <div style="
                font-size:22px;
                font-weight:700;
              ">
                KINGKONG MART
              </div>

              <div style="
                margin-top:4px;
                font-size:14px;
              ">
                HSD Manager · AUTO CHECK
              </div>
            </div>

            <div style="
              padding:20px;
            ">
              <h2 style="
                margin:0 0 12px;
                font-size:20px;
              ">
                Cảnh báo hạn sử dụng
              </h2>

              <p style="
                margin:0 0 8px;
                line-height:1.6;
              ">
                Hệ thống phát hiện
                <strong>
                  ${group.productCount}
                </strong>
                sản phẩm cần kiểm tra.
              </p>

              <p style="
                margin:0 0 18px;
                line-height:1.6;
              ">
                Ngày kiểm tra:
                <strong>
                  ${formatDate(today)}
                </strong>
                <br>
                Theo ngày báo lại:
                <strong>
                  ${reminderCount}
                </strong>
                <br>
                Theo % HSD:
                <strong>
                  ${percentCount}
                </strong>
              </p>

              <div style="
                overflow-x:auto;
              ">
                <table style="
                  width:100%;
                  border-collapse:collapse;
                  font-size:13px;
                ">
                  <thead>
                    <tr style="
                      background:#f0f0f0;
                    ">
                      <th style="
                        padding:10px;
                        border:1px solid #dddddd;
                        text-align:left;
                      ">
                        Mã SP
                      </th>

                      <th style="
                        padding:10px;
                        border:1px solid #dddddd;
                        text-align:left;
                      ">
                        Tên sản phẩm
                      </th>

                      <th style="
                        padding:10px;
                        border:1px solid #dddddd;
                        text-align:left;
                      ">
                        User / Quầy
                      </th>

                      <th style="
                        padding:10px;
                        border:1px solid #dddddd;
                      ">
                        HSD
                      </th>

                      <th style="
                        padding:10px;
                        border:1px solid #dddddd;
                      ">
                        % còn lại
                      </th>

                      <th style="
                        padding:10px;
                        border:1px solid #dddddd;
                      ">
                        Lý do
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              </div>

              <p style="
                margin:20px 0 0;
                color:#666666;
                font-size:12px;
                line-height:1.6;
              ">
                Email này được gửi tự động bởi HSD Manager.
                Vui lòng kiểm tra sản phẩm thực tế tại quầy.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject,
    html,
  };
}