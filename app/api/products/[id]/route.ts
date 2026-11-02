import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";

// ======================================================
// TYPES
// ======================================================

type CurrentUser = {
  id: string;
  username: string;
  role: "ADMIN" | "MANAGER" | "USER";
  active: boolean;
};

type ProductRow = {
  id: string;
  user_id: string;
  catalog_id: string | null;
  product_code: string;
  product_name: string;
  manufacture_date: string | null;
  expiry_date: string | null;
  quantity: number;
  reminder_date: string | null;
  note: string | null;
  description: string | null;
  sale_price: number | null;
  last_alert_at: string | null;
  alert_sent: boolean;
  last_user_action: string | null;
};

// ======================================================
// HELPERS
// ======================================================

function getVietnamToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find(
    (part) => part.type === "year"
  )?.value;

  const month = parts.find(
    (part) => part.type === "month"
  )?.value;

  const day = parts.find(
    (part) => part.type === "day"
  )?.value;

  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeOptionalText(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
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
  const cookieStore = await cookies();

  const token =
    cookieStore.get("hsd_session")?.value;

  if (!token) {
    return {
      user: null,

      error: NextResponse.json(
        {
          error: "Chưa đăng nhập.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  const session =
    await verifySessionToken(token);

  if (!session) {
    return {
      user: null,

      error: NextResponse.json(
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
    data: currentUser,
    error: userError,
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
    .eq("id", session.userId)
    .maybeSingle();

  if (userError) {
    console.error(
      "PRODUCT_ACTION_USER_ERROR:",
      userError
    );

    return {
      user: null,

      error: NextResponse.json(
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
    !currentUser ||
    !currentUser.active
  ) {
    return {
      user: null,

      error: NextResponse.json(
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
    user: currentUser as CurrentUser,
    error: null,
  };
}

// ======================================================
// PRODUCT
// ======================================================

async function getProduct(
  id: string
): Promise<ProductRow | null> {
  const {
    data,
    error,
  } = await supabaseServer
    .from("products")
    .select(
      `
        id,
        user_id,
        catalog_id,
        product_code,
        product_name,
        manufacture_date,
        expiry_date,
        quantity,
        reminder_date,
        note,
        description,
        sale_price,
        last_alert_at,
        alert_sent,
        last_user_action
      `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "PRODUCT_ACTION_LOAD_ERROR:",
      error
    );

    throw new Error(
      "Không thể tải sản phẩm."
    );
  }

  return data as ProductRow | null;
}

// ======================================================
// PERMISSION
// ======================================================

async function canManageProduct(
  currentUser: CurrentUser,
  productUserId: string
): Promise<boolean> {
  // ADMIN: tất cả sản phẩm

  if (
    currentUser.role === "ADMIN"
  ) {
    return true;
  }

  // USER: chỉ sản phẩm của mình

  if (
    currentUser.role === "USER"
  ) {
    return (
      productUserId ===
      currentUser.id
    );
  }

  // MANAGER: sản phẩm của mình

  if (
    productUserId ===
    currentUser.id
  ) {
    return true;
  }

  // MANAGER: USER trực thuộc

  const {
    data: employee,
    error,
  } = await supabaseServer
    .from("users")
    .select("id")
    .eq("id", productUserId)
    .eq(
      "parent_id",
      currentUser.id
    )
    .eq("role", "USER")
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error(
      "PRODUCT_PERMISSION_ERROR:",
      error
    );

    return false;
  }

  return Boolean(employee);
}

// ======================================================
// PATCH
// SỬA SẢN PHẨM
// ======================================================

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    // =========================
    // ID
    // =========================

    const { id } =
      await context.params;

    if (!isValidUuid(id)) {
      return NextResponse.json(
        {
          error:
            "ID sản phẩm không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // USER
    // =========================

    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser =
      auth.user;

    // =========================
    // PRODUCT
    // =========================

    const oldProduct =
      await getProduct(id);

    if (!oldProduct) {
      return NextResponse.json(
        {
          error:
            "Sản phẩm không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    // =========================
    // PERMISSION
    // =========================

    const allowed =
      await canManageProduct(
        currentUser,
        oldProduct.user_id
      );

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền sửa sản phẩm này.",
        },
        {
          status: 403,
        }
      );
    }

    // =========================
    // BODY
    // =========================

    const body =
      await request.json();

    // =========================
    // PRODUCT CODE
    // =========================

    const productCode =
      typeof body.productCode ===
      "string"
        ? body.productCode.trim()
        : oldProduct.product_code;

    if (!productCode) {
      return NextResponse.json(
        {
          error:
            "Mã sản phẩm không được để trống.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // NSX
    // =========================

    const manufactureDate =
      typeof body.manufactureDate ===
      "string"
        ? body.manufactureDate.trim()
        : oldProduct.manufacture_date;

    if (
      !manufactureDate ||
      !isValidDateOnly(
        manufactureDate
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Ngày sản xuất không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // HSD
    // =========================

    const expiryDate =
      typeof body.expiryDate ===
      "string"
        ? body.expiryDate.trim()
        : oldProduct.expiry_date;

    if (
      !expiryDate ||
      !isValidDateOnly(
        expiryDate
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Hạn sử dụng không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      expiryDate <
      manufactureDate
    ) {
      return NextResponse.json(
        {
          error:
            "HSD không được nhỏ hơn NSX.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // QUANTITY
    // =========================

    const quantity =
      body.quantity !== undefined
        ? Number(body.quantity)
        : Number(
            oldProduct.quantity
          );

    if (
      !Number.isFinite(quantity) ||
      quantity < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Số lượng không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // REMINDER DATE
    // =========================

    let reminderDate =
      oldProduct.reminder_date;

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "reminderDate"
      )
    ) {
      if (
        body.reminderDate === null ||
        body.reminderDate === ""
      ) {
        reminderDate = null;
      } else if (
        typeof body.reminderDate ===
        "string"
      ) {
        reminderDate =
          body.reminderDate.trim();
      } else {
        return NextResponse.json(
          {
            error:
              "Ngày báo lại không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }
    }

    if (reminderDate) {
      if (
        !isValidDateOnly(
          reminderDate
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Ngày báo lại không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }

      const reminderChanged =
        reminderDate !==
        oldProduct.reminder_date;

      if (
        reminderChanged &&
        reminderDate <=
          getVietnamToday()
      ) {
        return NextResponse.json(
          {
            error:
              "Ngày báo lại phải là ngày trong tương lai.",
          },
          {
            status: 400,
          }
        );
      }
    }

    // =========================
    // NOTE / DESCRIPTION
    // =========================

    const note =
      Object.prototype.hasOwnProperty.call(
        body,
        "note"
      )
        ? normalizeOptionalText(
            body.note
          )
        : oldProduct.note;

    const description =
      Object.prototype.hasOwnProperty.call(
        body,
        "description"
      )
        ? normalizeOptionalText(
            body.description
          )
        : oldProduct.description;

    // =========================
    // CATALOG
    // =========================

    let catalogId =
      oldProduct.catalog_id;

    let productName =
      oldProduct.product_name;

    let salePrice =
      oldProduct.sale_price;

    if (
      productCode !==
      oldProduct.product_code
    ) {
      const {
        data: catalog,
        error: catalogError,
      } = await supabaseServer
        .from("product_catalog")
        .select(
          `
            id,
            product_code,
            product_name,
            sale_price
          `
        )
        .eq(
          "product_code",
          productCode
        )
        .eq("active", true)
        .maybeSingle();

      if (catalogError) {
        console.error(
          "UPDATE_PRODUCT_CATALOG_ERROR:",
          catalogError
        );

        return NextResponse.json(
          {
            error:
              "Không thể kiểm tra mã sản phẩm.",
          },
          {
            status: 500,
          }
        );
      }

      if (!catalog) {
        return NextResponse.json(
          {
            error:
              "Mã SP không tồn tại trong DATA.",
          },
          {
            status: 400,
          }
        );
      }

      catalogId =
        catalog.id;

      productName =
        catalog.product_name;

      salePrice =
        catalog.sale_price;
    }

    // =========================
    // RESET ALERT?
    // Chỉ reset khi:
    // NSX / HSD / NGÀY BÁO LẠI thay đổi
    // =========================

    const dateChanged =
      manufactureDate !==
        oldProduct.manufacture_date ||
      expiryDate !==
        oldProduct.expiry_date ||
      reminderDate !==
        oldProduct.reminder_date;

    // =========================
    // HISTORY CHANGES
    // =========================

    const changes: string[] = [];

    if (
      productCode !==
      oldProduct.product_code
    ) {
      changes.push(
        `Mã SP: ${oldProduct.product_code} → ${productCode}`
      );
    }

    if (
      manufactureDate !==
      oldProduct.manufacture_date
    ) {
      changes.push(
        `NSX: ${
          oldProduct.manufacture_date ||
          "-"
        } → ${manufactureDate}`
      );
    }

    if (
      expiryDate !==
      oldProduct.expiry_date
    ) {
      changes.push(
        `HSD: ${
          oldProduct.expiry_date ||
          "-"
        } → ${expiryDate}`
      );
    }

    if (
      quantity !==
      Number(
        oldProduct.quantity
      )
    ) {
      changes.push(
        `Số lượng: ${oldProduct.quantity} → ${quantity}`
      );
    }

    if (
      reminderDate !==
      oldProduct.reminder_date
    ) {
      changes.push(
        `Ngày báo lại: ${
          oldProduct.reminder_date ||
          "-"
        } → ${
          reminderDate || "-"
        }`
      );
    }

    if (
      note !==
      oldProduct.note
    ) {
      changes.push(
        `Note: ${
          oldProduct.note || "-"
        } → ${note || "-"}`
      );
    }

    if (
      description !==
      oldProduct.description
    ) {
      changes.push(
        `Ghi chú: ${
          oldProduct.description ||
          "-"
        } → ${
          description || "-"
        }`
      );
    }

    // =========================
    // UPDATE
    // =========================

    const updateData: {
      catalog_id: string | null;
      product_code: string;
      product_name: string;
      manufacture_date: string;
      expiry_date: string;
      quantity: number;
      reminder_date: string | null;
      note: string | null;
      description: string | null;
      sale_price: number | null;
      last_user_action: string;
      alert_sent?: boolean;
      last_alert_at?: null;
    } = {
      catalog_id: catalogId,

      product_code:
        productCode,

      product_name:
        productName,

      manufacture_date:
        manufactureDate,

      expiry_date:
        expiryDate,

      quantity,

      reminder_date:
        reminderDate,

      note,

      description,

      sale_price:
        salePrice,

      last_user_action:
        currentUser.username,
    };

    if (dateChanged) {
      updateData.alert_sent =
        false;

      updateData.last_alert_at =
        null;
    }

    const {
      data: updatedProduct,
      error: updateError,
    } = await supabaseServer
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select(
        `
          id,
          user_id,
          product_code,
          product_name,
          manufacture_date,
          expiry_date,
          quantity,
          reminder_date,
          note,
          description,
          sale_price,
          last_alert_at,
          alert_sent,
          last_user_action,
          created_at,
          updated_at
        `
      )
      .single();

    if (updateError) {
      console.error(
        "UPDATE_PRODUCT_ERROR:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Không thể cập nhật sản phẩm.",
        },
        {
          status: 500,
        }
      );
    }

    // =========================
    // HISTORY
    // =========================

    if (changes.length > 0) {
      const {
        error: historyError,
      } = await supabaseServer
        .from("history_logs")
        .insert({
          actor_user_id:
            currentUser.id,

          action: "SỬA",

          product_id: id,

          product_code:
            updatedProduct.product_code,

          product_name:
            updatedProduct.product_name,

          changes: {
            text: changes.join(
              "\n"
            ),
          },
        });

      if (historyError) {
        console.error(
          "UPDATE_PRODUCT_HISTORY_ERROR:",
          historyError
        );
      }
    }

    // =========================
    // RESPONSE
    // =========================

    return NextResponse.json({
      success: true,

      message:
        "Cập nhật sản phẩm thành công.",

      product:
        updatedProduct,

      alertReset:
        dateChanged,
    });
  } catch (error) {
    console.error(
      "PATCH_PRODUCT_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi cập nhật sản phẩm.",
      },
      {
        status: 500,
      }
    );
  }
}

// ======================================================
// DELETE
// XÓA SẢN PHẨM
// ======================================================

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    // =========================
    // ID
    // =========================

    const { id } =
      await context.params;

    if (!isValidUuid(id)) {
      return NextResponse.json(
        {
          error:
            "ID sản phẩm không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // USER
    // =========================

    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser =
      auth.user;

    // =========================
    // PRODUCT
    // =========================

    const product =
      await getProduct(id);

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Sản phẩm không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    // =========================
    // PERMISSION
    // =========================

    const allowed =
      await canManageProduct(
        currentUser,
        product.user_id
      );

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền xóa sản phẩm này.",
        },
        {
          status: 403,
        }
      );
    }

    // =========================
    // DELETE
    // =========================

    const {
      error: deleteError,
    } = await supabaseServer
      .from("products")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error(
        "DELETE_PRODUCT_DATABASE_ERROR:",
        deleteError
      );

      return NextResponse.json(
        {
          error:
            "Không thể xóa sản phẩm.",
        },
        {
          status: 500,
        }
      );
    }

    // =========================
    // HISTORY
    // Product đã bị xóa nên
    // product_id để null.
    // =========================

    const {
      error: historyError,
    } = await supabaseServer
      .from("history_logs")
      .insert({
        actor_user_id:
          currentUser.id,

        action: "XÓA",

        product_id: null,

        product_code:
          product.product_code,

        product_name:
          product.product_name,

        changes: {
          text: "Xóa sản phẩm",
        },
      });

    if (historyError) {
      console.error(
        "DELETE_PRODUCT_HISTORY_ERROR:",
        historyError
      );
    }

    // =========================
    // RESPONSE
    // =========================

    return NextResponse.json({
      success: true,

      message:
        "Xóa sản phẩm thành công.",
    });
  } catch (error) {
    console.error(
      "DELETE_PRODUCT_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi xóa sản phẩm.",
      },
      {
        status: 500,
      }
    );
  }
}