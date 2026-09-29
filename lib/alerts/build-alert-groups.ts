import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import { calculateExpiryPercent } from "@/lib/product-status";

export type AlertReason =
  | "REMINDER"
  | "PERCENT";

type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "USER";

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
};

export type AlertProduct = {
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

export type AlertGroup = {
  recipientEmail: string;
  productCount: number;
  products: AlertProduct[];
};

export type AlertBuildResult = {
  today: string;

  summary: {
    productsChecked: number;
    productsDue: number;
    reminderProducts: number;
    percentProducts: number;
    recipientCount: number;
    skippedNoOwner: number;
    skippedInactiveOwner: number;
    skippedNoRecipient: number;
  };

  groups: AlertGroup[];
};

const PRODUCT_BATCH_SIZE = 1000;

export function getVietnamToday(): string {
  const parts =
    new Intl.DateTimeFormat(
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

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new Error(
      "Không thể xác định ngày Việt Nam."
    );
  }

  return `${year}-${month}-${day}`;
}

async function loadAllUnalertedProducts():
  Promise<ProductRow[]> {
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
      .select(`
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
      `)
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
        "ALERT_PRODUCTS_BATCH_ERROR:",
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

export async function buildAlertGroups():
  Promise<AlertBuildResult> {
  const today =
    getVietnamToday();

  const productRows =
    await loadAllUnalertedProducts();

  const {
    data: users,
    error: usersError,
  } = await supabaseServer
    .from("users")
    .select(`
      id,
      username,
      display_name,
      role,
      active,
      parent_id
    `);

  if (usersError) {
    console.error(
      "ALERT_USERS_ERROR:",
      usersError
    );

    throw new Error(
      "Không thể tải người dùng."
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

  const {
    data: emails,
    error: emailsError,
  } = await supabaseServer
    .from("user_emails")
    .select(`
      user_id,
      email,
      active
    `)
    .eq(
      "active",
      true
    );

  if (emailsError) {
    console.error(
      "ALERT_EMAILS_ERROR:",
      emailsError
    );

    throw new Error(
      "Không thể tải email người dùng."
    );
  }

  const emailRows =
    (emails ??
      []) as EmailRow[];

  const {
    data: alertConfigs,
    error: alertConfigsError,
  } = await supabaseServer
    .from("alert_configs")
    .select(`
      user_id,
      threshold_percent
    `)
    .eq(
      "active",
      true
    );

  if (alertConfigsError) {
    console.error(
      "ALERT_CONFIG_ERROR:",
      alertConfigsError
    );

    throw new Error(
      "Không thể tải cấu hình cảnh báo."
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

  const groups =
    new Map<
      string,
      {
        recipientEmail: string;
        products: AlertProduct[];
      }
    >();

  let skippedNoOwner = 0;
  let skippedInactiveOwner = 0;
  let skippedNoRecipient = 0;

  const dueProducts =
    new Map<
      string,
      AlertReason
    >();

  for (
    const product of
    productRows
  ) {
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

    let reason:
      AlertReason | null =
      null;

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
    // mới xét % HSD.
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

    const recipients =
      new Set<string>();

    // Email của owner.
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

    // USER thuộc MANAGER:
    // Manager cũng nhận.
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

    dueProducts.set(
      product.id,
      reason
    );

    const alertProduct:
      AlertProduct = {
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
          alertProduct
        );
      } else {
        groups.set(
          recipientEmail,
          {
            recipientEmail,

            products: [
              alertProduct,
            ],
          }
        );
      }
    }
  }

  const groupedRecipients:
    AlertGroup[] =
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

  let reminderProducts = 0;
  let percentProducts = 0;

  for (
    const reason of
    dueProducts.values()
  ) {
    if (
      reason ===
      "REMINDER"
    ) {
      reminderProducts += 1;
    } else {
      percentProducts += 1;
    }
  }

  return {
    today,

    summary: {
      productsChecked:
        productRows.length,

      productsDue:
        dueProducts.size,

      reminderProducts,

      percentProducts,

      recipientCount:
        groupedRecipients.length,

      skippedNoOwner,

      skippedInactiveOwner,

      skippedNoRecipient,
    },

    groups:
      groupedRecipients,
  };
}