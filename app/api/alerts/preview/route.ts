import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";
import { calculateExpiryPercent } from "@/lib/product-status";

// ======================================================
// TYPES
// ======================================================

type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "USER";

type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
};

type ProductRow = {
  id: string;
  user_id: string;
  product_code: string;
  product_name: string;
  manufacture_date: string | null;
  expiry_date: string | null;
  reminder_date: string | null;
  quantity: number;
  sale_price: number | null;
  alert_sent: boolean;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  role: UserRole;
  active: boolean;
  parent_id: string | null;
};

type EmailRow = {
  user_id: string;
  email: string;
  active: boolean;
  is_primary: boolean;
};

type AlertReason =
  | "REMINDER"
  | "PERCENT";

type PreviewProduct = {
  id: string;
  productCode: string;
  productName: string;
  ownerUsername: string;
  ownerDisplayName: string | null;
  quantity: number;
  salePrice: number | null;
  manufactureDate: string | null;
  expiryDate: string | null;
  reminderDate: string | null;
  percentRemaining: number | null;
  thresholdPercent: number;
  reason: AlertReason;
};

// ======================================================
// CONFIG
// ======================================================

const PRODUCT_BATCH_SIZE = 1000;

// ======================================================
// DATE
// ======================================================

function getVietnamToday(): string {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "Asia/Ho_Chi_Minh",

      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(
    new Date()
  );

  const year =
    parts.find(
      (part) =>
        part.type === "year"
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type === "month"
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type === "day"
    )?.value;

  return `${year}-${month}-${day}`;
}

// ======================================================
// CURRENT USER
// ======================================================

async function getCurrentUser(): Promise<
  | {
      user: CurrentUser;
      error: null;
    }
  | {
      user: null;
      error: NextResponse;
    }
> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      "hsd_session"
    )?.value;

  if (!token) {
    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Chưa đăng nhập.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  const session =
    await verifySessionToken(
      token
    );

  if (!session) {
    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Phiên đăng nhập không hợp lệ.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  const {
    data,
    error,
  } = await supabaseServer
    .from("users")
    .select(
      `
        id,
        username,
        role,
        active
      `
    )
    .eq(
      "id",
      session.userId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "ALERT_PREVIEW_USER_ERROR:",
      error
    );

    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Không thể kiểm tra tài khoản.",
          },
          {
            status: 500,
          }
        ),
    };
  }

  if (
    !data ||
    !data.active
  ) {
    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Tài khoản không hợp lệ.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  return {
    user:
      data as CurrentUser,

    error: null,
  };
}

// ======================================================
// LOAD ALL PRODUCTS BY BATCH
// ======================================================

async function loadAllUnalertedProducts(): Promise<
  ProductRow[]
> {
  const allProducts:
    ProductRow[] = [];

  let from = 0;

  while (true) {
    const to =
      from +
      PRODUCT_BATCH_SIZE -
      1;

    const {
      data,
      error,
    } = await supabaseServer
      .from("products")
      .select(
        `
          id,
          user_id,
          product_code,
          product_name,
          manufacture_date,
          expiry_date,
          reminder_date,
          quantity,
          sale_price,
          alert_sent
        `
      )
      .eq(
        "alert_sent",
        false
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .range(
        from,
        to
      );

    if (error) {
      console.error(
        "ALERT_PREVIEW_PRODUCTS_BATCH_ERROR:",
        {
          from,
          to,
          error,
        }
      );

      throw new Error(
        "Không thể tải sản phẩm cần kiểm tra."
      );
    }

    const batch =
      (data ??
        []) as ProductRow[];

    allProducts.push(
      ...batch
    );

    // Batch cuối cùng
    if (
      batch.length <
      PRODUCT_BATCH_SIZE
    ) {
      break;
    }

    from +=
      PRODUCT_BATCH_SIZE;
  }

  return allProducts;
}

// ======================================================
// GET ACTIVE EMAILS
// ======================================================

function getEmailsForUser(
  userId: string,
  emailRows: EmailRow[]
): string[] {
  return [
    ...new Set(
      emailRows
        .filter(
          (item) =>
            item.user_id ===
              userId &&
            item.active
        )
        .map(
          (item) =>
            item.email
              .trim()
              .toLowerCase()
        )
        .filter(Boolean)
    ),
  ];
}

// ======================================================
// GET PREVIEW
// ======================================================

export async function GET() {
  try {
    // ==================================================
    // AUTH
    // ==================================================

    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser =
      auth.user;

    if (
      currentUser.role !==
      "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền xem trước cảnh báo toàn hệ thống.",
        },
        {
          status: 403,
        }
      );
    }

    const today =
      getVietnamToday();

    // ==================================================
    // LOAD ALL PRODUCTS
    // ==================================================

    const productRows =
      await loadAllUnalertedProducts();

    // ==================================================
    // LOAD USERS
    // ==================================================

    const {
      data: users,
      error: usersError,
    } = await supabaseServer
      .from("users")
      .select(
        `
          id,
          username,
          display_name,
          role,
          active,
          parent_id
        `
      );

    if (usersError) {
      console.error(
        "ALERT_PREVIEW_USERS_ERROR:",
        usersError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải người dùng.",
        },
        {
          status: 500,
        }
      );
    }

    const userRows =
      (users ??
        []) as UserRow[];

    const userMap =
      new Map<
        string,
        UserRow
      >();

    for (
      const user of
      userRows
    ) {
      userMap.set(
        user.id,
        user
      );
    }

    // ==================================================
    // LOAD EMAILS
    // ==================================================

    const {
      data: emails,
      error: emailsError,
    } = await supabaseServer
      .from("user_emails")
      .select(
        `
          user_id,
          email,
          active,
          is_primary
        `
      )
      .eq(
        "active",
        true
      );

    if (emailsError) {
      console.error(
        "ALERT_PREVIEW_EMAILS_ERROR:",
        emailsError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải email người dùng.",
        },
        {
          status: 500,
        }
      );
    }

    const emailRows =
      (emails ??
        []) as EmailRow[];

    // ==================================================
    // ALERT CONFIG
    // ==================================================

    const {
      data: alertConfigs,
      error:
        alertConfigsError,
    } = await supabaseServer
      .from("alert_configs")
      .select(
        `
          user_id,
          threshold_percent
        `
      )
      .eq(
        "active",
        true
      );

    if (
      alertConfigsError
    ) {
      console.error(
        "ALERT_PREVIEW_CONFIG_ERROR:",
        alertConfigsError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải cấu hình cảnh báo.",
        },
        {
          status: 500,
        }
      );
    }

    const defaultConfig =
      alertConfigs?.find(
        (item) =>
          item.user_id ===
          null
      );

    const defaultThreshold =
      Number(
        defaultConfig
          ?.threshold_percent
      ) || 31;

    const thresholdByUser =
      new Map<
        string,
        number
      >();

    for (
      const config of
      alertConfigs ?? []
    ) {
      if (!config.user_id) {
        continue;
      }

      thresholdByUser.set(
        config.user_id,
        Number(
          config.threshold_percent
        )
      );
    }

    // ==================================================
    // GROUP BY RECIPIENT
    // ==================================================

    const groups =
      new Map<
        string,
        {
          recipientEmail: string;
          products: PreviewProduct[];
        }
      >();

    let skippedNoOwner = 0;
    let skippedInactiveOwner = 0;
    let skippedNoRecipient = 0;

    let reminderCount = 0;
    let percentCount = 0;

    for (
      const product of
      productRows
    ) {
      // ===============================================
      // OWNER
      // ===============================================

      const owner =
        userMap.get(
          product.user_id
        );

      if (!owner) {
        skippedNoOwner += 1;
        continue;
      }

      if (!owner.active) {
        skippedInactiveOwner += 1;
        continue;
      }

      // ===============================================
      // THRESHOLD
      // ===============================================

      const thresholdPercent =
        thresholdByUser.get(
          product.user_id
        ) ??
        defaultThreshold;

      const percentRemaining =
        calculateExpiryPercent(
          product.manufacture_date,
          product.expiry_date,
          today
        );

      // ===============================================
      // SHOULD ALERT?
      // ===============================================

      let reason:
        | AlertReason
        | null = null;

      // Có ngày báo lại:
      // chỉ xét ngày báo lại.
      if (
        product.reminder_date
      ) {
        if (
          product.reminder_date <=
          today
        ) {
          reason =
            "REMINDER";
        }
      }

      // Không có ngày báo lại:
      // xét % HSD.
      else if (
        percentRemaining !==
          null &&
        percentRemaining <=
          thresholdPercent
      ) {
        reason =
          "PERCENT";
      }

      if (!reason) {
        continue;
      }

      // ===============================================
      // RECIPIENTS
      // ===============================================

      const recipients =
        new Set<string>();

      // Owner nhận mail
      for (
        const email of
        getEmailsForUser(
          owner.id,
          emailRows
        )
      ) {
        recipients.add(
          email
        );
      }

      // USER có MANAGER:
      // Manager cũng nhận mail
      if (
        owner.role ===
          "USER" &&
        owner.parent_id
      ) {
        const manager =
          userMap.get(
            owner.parent_id
          );

        if (
          manager &&
          manager.active &&
          manager.role ===
            "MANAGER"
        ) {
          for (
            const email of
            getEmailsForUser(
              manager.id,
              emailRows
            )
          ) {
            recipients.add(
              email
            );
          }
        }
      }

      if (
        recipients.size ===
        0
      ) {
        skippedNoRecipient += 1;
        continue;
      }

      const previewProduct:
        PreviewProduct = {
          id:
            product.id,

          productCode:
            product.product_code,

          productName:
            product.product_name,

          ownerUsername:
            owner.username,

          ownerDisplayName:
            owner.display_name,

          quantity:
            product.quantity,

          salePrice:
            product.sale_price,

          manufactureDate:
            product.manufacture_date,

          expiryDate:
            product.expiry_date,

          reminderDate:
            product.reminder_date,

          percentRemaining,

          thresholdPercent,

          reason,
        };

      if (
        reason ===
        "REMINDER"
      ) {
        reminderCount += 1;
      }

      if (
        reason ===
        "PERCENT"
      ) {
        percentCount += 1;
      }

      for (
        const recipientEmail of
        recipients
      ) {
        const existing =
          groups.get(
            recipientEmail
          );

        if (existing) {
          existing.products.push(
            previewProduct
          );
        } else {
          groups.set(
            recipientEmail,
            {
              recipientEmail,

              products: [
                previewProduct,
              ],
            }
          );
        }
      }
    }

    // ==================================================
    // RESULT
    // ==================================================

    const groupedRecipients =
      Array.from(
        groups.values()
      )
        .map(
          (group) => ({
            recipientEmail:
              group.recipientEmail,

            productCount:
              group.products.length,

            products:
              group.products,
          })
        )
        .sort(
          (a, b) =>
            a.recipientEmail.localeCompare(
              b.recipientEmail
            )
        );

    const uniqueProducts =
      new Set<string>();

    for (
      const group of
      groupedRecipients
    ) {
      for (
        const product of
        group.products
      ) {
        uniqueProducts.add(
          product.id
        );
      }
    }

    return NextResponse.json({
      success: true,

      preview: true,

      writesPerformed:
        false,

      emailsSent: 0,

      today,

      summary: {
        productsChecked:
          productRows.length,

        productsDue:
          uniqueProducts.size,

        reminderProducts:
          reminderCount,

        percentProducts:
          percentCount,

        recipientCount:
          groupedRecipients.length,

        skippedNoOwner,

        skippedInactiveOwner,

        skippedNoRecipient,
      },

      groups:
        groupedRecipients,
    });
  } catch (error) {
    console.error(
      "ALERT_PREVIEW_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi xem trước cảnh báo.",
      },
      {
        status: 500,
      }
    );
  }
}