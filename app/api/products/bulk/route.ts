import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";

type UserRole = "ADMIN" | "MANAGER" | "USER";

type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
};

type TargetUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
  parent_id: string | null;
};

type CatalogItem = {
  id: string;
  product_code: string;
  product_name: string;
  sale_price: number | null;
  active: boolean;
};

type BulkInputRow = {
  productCode?: unknown;
  targetUsername?: unknown;
  manufactureDate?: unknown;
  expiryDate?: unknown;
  quantity?: unknown;
  reminderDate?: unknown;
  note?: unknown;
  description?: unknown;
};

type RowError = {
  row: number;
  productCode?: string;
  message: string;
};

type ValidInsertRow = {
  sourceRow: number;
  productCode: string;
  payload: {
    user_id: string;
    catalog_id: string;
    product_code: string;
    product_name: string;
    manufacture_date: string;
    expiry_date: string;
    quantity: number;
    reminder_date: string | null;
    note: string | null;
    description: string | null;
    sale_price: number | null;
    last_alert_at: null;
    alert_sent: false;
    last_user_action: string;
  };
};

const MAX_BULK_ROWS = 1000;
const LOOKUP_BATCH_SIZE = 200;
const INSERT_BATCH_SIZE = 200;

function getVietnamToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function canInsertForUser(
  currentUser: CurrentUser,
  targetUser: TargetUser
): boolean {
  if (currentUser.role === "ADMIN") {
    return true;
  }

  if (currentUser.role === "USER") {
    return targetUser.id === currentUser.id;
  }

  if (currentUser.role === "MANAGER") {
    const isSelf = targetUser.id === currentUser.id;
    const isManagedEmployee =
      targetUser.role === "USER" && targetUser.parent_id === currentUser.id;

    return isSelf || isManagedEmployee;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("hsd_session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
    }

    const session = await verifySessionToken(token);

    if (!session) {
      return NextResponse.json(
        { error: "Phiên đăng nhập không hợp lệ." },
        { status: 401 }
      );
    }

    const { data: currentUserData, error: currentUserError } =
      await supabaseServer
        .from("users")
        .select("id, username, role, active")
        .eq("id", session.userId)
        .maybeSingle();

    if (currentUserError) {
      console.error("BULK_PRODUCT_USER_ERROR:", currentUserError);
      return NextResponse.json(
        { error: "Không thể kiểm tra tài khoản." },
        { status: 500 }
      );
    }

    if (!currentUserData || !currentUserData.active) {
      return NextResponse.json(
        { error: "Tài khoản không hợp lệ." },
        { status: 401 }
      );
    }

    const currentUser = currentUserData as CurrentUser;
    const body = await request.json();
    const rows: BulkInputRow[] = Array.isArray(body?.products)
      ? body.products
      : [];

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Không có dữ liệu để nhập." },
        { status: 400 }
      );
    }

    if (rows.length > MAX_BULK_ROWS) {
      return NextResponse.json(
        { error: `Mỗi lần chỉ nhập tối đa ${MAX_BULK_ROWS} dòng.` },
        { status: 400 }
      );
    }

    const normalizedRows = rows.map((row, index) => ({
      sourceRow: index + 2,
      productCode: normalizeText(row.productCode),
      targetUsername:
        normalizeText(row.targetUsername) || currentUser.username,
      manufactureDate: normalizeText(row.manufactureDate),
      expiryDate: normalizeText(row.expiryDate),
      quantity: Number(row.quantity ?? 0),
      reminderDate: normalizeOptionalText(row.reminderDate),
      note: normalizeOptionalText(row.note),
      description: normalizeOptionalText(row.description),
    }));

    const uniqueUsernames = Array.from(
      new Set(normalizedRows.map((row) => row.targetUsername))
    );

    const targetUsers: TargetUser[] = [];

    for (const usernames of chunkArray(uniqueUsernames, LOOKUP_BATCH_SIZE)) {
      const { data, error } = await supabaseServer
        .from("users")
        .select("id, username, role, active, parent_id")
        .in("username", usernames);

      if (error) {
        console.error("BULK_PRODUCT_TARGET_USERS_ERROR:", error);
        return NextResponse.json(
          { error: "Không thể kiểm tra danh sách người dùng." },
          { status: 500 }
        );
      }

      targetUsers.push(...((data ?? []) as TargetUser[]));
    }

    const userByUsername = new Map(
      targetUsers.map((user) => [user.username, user] as const)
    );

    const uniqueProductCodes = Array.from(
      new Set(
        normalizedRows
          .map((row) => row.productCode)
          .filter((value) => Boolean(value))
      )
    );

    const catalogItems: CatalogItem[] = [];

    for (const productCodes of chunkArray(
      uniqueProductCodes,
      LOOKUP_BATCH_SIZE
    )) {
      const { data, error } = await supabaseServer
        .from("product_catalog")
        .select("id, product_code, product_name, sale_price, active")
        .in("product_code", productCodes)
        .eq("active", true);

      if (error) {
        console.error("BULK_PRODUCT_CATALOG_ERROR:", error);
        return NextResponse.json(
          { error: "Không thể kiểm tra danh mục sản phẩm." },
          { status: 500 }
        );
      }

      catalogItems.push(...((data ?? []) as CatalogItem[]));
    }

    const catalogByCode = new Map(
      catalogItems.map((item) => [item.product_code, item] as const)
    );

    const today = getVietnamToday();
    const errors: RowError[] = [];
    const validRows: ValidInsertRow[] = [];

    for (const row of normalizedRows) {
      if (!row.productCode) {
        errors.push({
          row: row.sourceRow,
          message: "Mã sản phẩm đang để trống.",
        });
        continue;
      }

      if (!Number.isFinite(row.quantity) || row.quantity < 0 || !Number.isInteger(row.quantity)) {
        errors.push({
          row: row.sourceRow,
          productCode: row.productCode,
          message: "Số lượng không hợp lệ.",
        });
        continue;
      }

      if (!isValidDateOnly(row.manufactureDate)) {
        errors.push({
          row: row.sourceRow,
          productCode: row.productCode,
          message: "NSX không hợp lệ.",
        });
        continue;
      }

      if (!isValidDateOnly(row.expiryDate)) {
        errors.push({
          row: row.sourceRow,
          productCode: row.productCode,
          message: "HSD không hợp lệ.",
        });
        continue;
      }

      if (row.expiryDate < row.manufactureDate) {
        errors.push({
          row: row.sourceRow,
          productCode: row.productCode,
          message: "HSD không được nhỏ hơn NSX.",
        });
        continue;
      }

      if (row.reminderDate) {
        if (!isValidDateOnly(row.reminderDate)) {
          errors.push({
            row: row.sourceRow,
            productCode: row.productCode,
            message: "Ngày báo lại không hợp lệ.",
          });
          continue;
        }

        if (row.reminderDate <= today) {
          errors.push({
            row: row.sourceRow,
            productCode: row.productCode,
            message: "Ngày báo lại phải là ngày trong tương lai.",
          });
          continue;
        }
      }

      const targetUser = userByUsername.get(row.targetUsername);

      if (!targetUser || !targetUser.active) {
        errors.push({
          row: row.sourceRow,
          productCode: row.productCode,
          message: `User '${row.targetUsername}' không tồn tại hoặc đã bị khóa.`,
        });
        continue;
      }

      if (!canInsertForUser(currentUser, targetUser)) {
        errors.push({
          row: row.sourceRow,
          productCode: row.productCode,
          message: `Không có quyền thêm sản phẩm cho user '${row.targetUsername}'.`,
        });
        continue;
      }

      const catalog = catalogByCode.get(row.productCode);

      if (!catalog) {
        errors.push({
          row: row.sourceRow,
          productCode: row.productCode,
          message: "Mã SP không tồn tại trong DATA.",
        });
        continue;
      }

      validRows.push({
        sourceRow: row.sourceRow,
        productCode: row.productCode,
        payload: {
          user_id: targetUser.id,
          catalog_id: catalog.id,
          product_code: catalog.product_code,
          product_name: catalog.product_name,
          manufacture_date: row.manufactureDate,
          expiry_date: row.expiryDate,
          quantity: row.quantity,
          reminder_date: row.reminderDate,
          note: row.note,
          description: row.description,
          sale_price: catalog.sale_price,
          last_alert_at: null,
          alert_sent: false,
          last_user_action: currentUser.username,
        },
      });
    }

    const insertedProducts: Array<{
      id: string;
      product_code: string;
      product_name: string;
    }> = [];

    for (const validChunk of chunkArray(validRows, INSERT_BATCH_SIZE)) {
      const { data, error } = await supabaseServer
        .from("products")
        .insert(validChunk.map((item) => item.payload))
        .select("id, product_code, product_name");

      if (error) {
        console.error("BULK_PRODUCT_INSERT_ERROR:", error);

        for (const item of validChunk) {
          errors.push({
            row: item.sourceRow,
            productCode: item.productCode,
            message: "Không thể thêm sản phẩm vào hệ thống.",
          });
        }

        continue;
      }

      insertedProducts.push(
        ...((data ?? []) as Array<{
          id: string;
          product_code: string;
          product_name: string;
        }>)
      );
    }

    if (insertedProducts.length > 0) {
      const historyRows = insertedProducts.map((product) => ({
        actor_user_id: currentUser.id,
        action: "THÊM",
        product_id: product.id,
        product_code: product.product_code,
        product_name: product.product_name,
        changes: {
          text: "Thêm sản phẩm hàng loạt",
        },
      }));

      for (const historyChunk of chunkArray(historyRows, INSERT_BATCH_SIZE)) {
        const { error: historyError } = await supabaseServer
          .from("history_logs")
          .insert(historyChunk);

        if (historyError) {
          console.error("BULK_PRODUCT_HISTORY_ERROR:", historyError);
        }
      }
    }

    const successCount = insertedProducts.length;
    const failedCount = rows.length - successCount;

    const message =
      failedCount > 0
        ? `Nhập xong ${successCount}/${rows.length} sản phẩm. Có ${failedCount} dòng lỗi.`
        : `Đã nhập thành công ${successCount} sản phẩm.`;

    return NextResponse.json(
      {
        success: successCount > 0,
        message,
        successCount,
        failedCount,
        errors: errors.sort((a, b) => a.row - b.row),
      },
      {
        status: successCount > 0 ? 200 : 400,
      }
    );
  } catch (error) {
    console.error("BULK_PRODUCT_ERROR:", error);

    return NextResponse.json(
      { error: "Có lỗi xảy ra khi nhập hàng loạt." },
      { status: 500 }
    );
  }
}
