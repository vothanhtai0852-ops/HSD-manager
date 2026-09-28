import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";
import { getProductStatus } from "@/lib/product-status";

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
// GET PRODUCTS
// ======================================================

export async function GET(request: Request) {
  try {
    // =========================
    // SESSION
    // =========================

    const cookieStore = await cookies();
    const token =
      cookieStore.get("hsd_session")?.value;

    if (!token) {
      return NextResponse.json(
        {
          error: "Chưa đăng nhập.",
        },
        {
          status: 401,
        }
      );
    }

    const session =
      await verifySessionToken(token);

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Phiên đăng nhập không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }

    // =========================
    // CURRENT USER
    // =========================

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
        "PRODUCTS_USER_ERROR:",
        userError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !currentUser ||
      !currentUser.active
    ) {
      return NextResponse.json(
        {
          error:
            "Tài khoản không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }

    // =========================
    // QUERY PARAMS
    // =========================

    const { searchParams } =
      new URL(request.url);

    const requestedPage = Number(
      searchParams.get("page") || "1"
    );

    const page =
      Number.isInteger(requestedPage) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const requestedPageSize = Number(
      searchParams.get("pageSize") ||
        "30"
    );

    const allowedPageSizes = [
      10,
      20,
      30,
      50,
      100,
    ];

    const pageSize =
      allowedPageSizes.includes(
        requestedPageSize
      )
        ? requestedPageSize
        : 30;

    const search = (
      searchParams.get("search") || ""
    ).trim();

    const from =
      (page - 1) * pageSize;

    const to =
      from + pageSize - 1;

    // =========================
    // PRODUCTS QUERY
    // =========================

    let query = supabaseServer
      .from("products")
      .select(
        `
          id,
          user_id,

          owner:users!products_user_id_fkey (
            username,
            display_name
          ),

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
        `,
        {
          count: "exact",
        }
      )
      .order("created_at", {
        ascending: false,
      })
      .range(from, to);

    // =========================
    // SEARCH
    // =========================

    if (search) {
      const safeSearch = search
        .replace(/[%_]/g, "")
        .replace(/[,()]/g, "")
        .trim();

      if (safeSearch) {
        query = query.or(
          [
            `product_code.ilike.%${safeSearch}%`,
            `product_name.ilike.%${safeSearch}%`,
          ].join(",")
        );
      }
    }

    // =========================
    // USER PERMISSION
    // =========================

    if (
      currentUser.role === "USER"
    ) {
      query = query.eq(
        "user_id",
        currentUser.id
      );
    }

    // =========================
    // MANAGER PERMISSION
    // =========================

    if (
      currentUser.role ===
      "MANAGER"
    ) {
      const {
        data: employees,
        error: employeesError,
      } = await supabaseServer
        .from("users")
        .select("id")
        .eq(
          "parent_id",
          currentUser.id
        )
        .eq("role", "USER")
        .eq("active", true);

      if (employeesError) {
        console.error(
          "PRODUCTS_EMPLOYEES_ERROR:",
          employeesError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải danh sách nhân viên.",
          },
          {
            status: 500,
          }
        );
      }

      const allowedUserIds = [
        currentUser.id,
        ...(employees ?? []).map(
          (employee) =>
            employee.id
        ),
      ];

      query = query.in(
        "user_id",
        allowedUserIds
      );
    }

    // ADMIN:
    // Không filter user_id.

    // =========================
    // RUN QUERY
    // =========================

    const {
      data: products,
      error: productsError,
      count,
    } = await query;

    if (productsError) {
      console.error(
        "PRODUCTS_DATABASE_ERROR:",
        productsError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải danh sách sản phẩm.",
        },
        {
          status: 500,
        }
      );
    }

    // =========================
    // ALERT CONFIG
    // =========================

    const {
      data: alertConfigs,
      error: alertConfigsError,
    } = await supabaseServer
      .from("alert_configs")
      .select(
        `
          user_id,
          threshold_percent
        `
      )
      .eq("active", true);

    if (alertConfigsError) {
      console.error(
        "PRODUCTS_ALERT_CONFIG_ERROR:",
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
        (config) =>
          config.user_id === null
      );

    const defaultThreshold =
      Number(
        defaultConfig
          ?.threshold_percent
      ) || 31;

    const thresholdByUser =
      new Map<string, number>();

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

    // =========================
    // STATUS
    // =========================

    const productsWithStatus =
      (products ?? []).map(
        (product) => {
          const thresholdPercent =
            thresholdByUser.get(
              product.user_id
            ) ?? defaultThreshold;

          const result =
            getProductStatus({
              manufactureDate:
                product.manufacture_date,

              expiryDate:
                product.expiry_date,

              reminderDate:
                product.reminder_date,

              alertSent:
                product.alert_sent,

              thresholdPercent,
            });

          return {
            ...product,

            threshold_percent:
              thresholdPercent,

            percent_remaining:
              result.percentRemaining,

            status:
              result.status,
          };
        }
      );

    const total = count ?? 0;

    return NextResponse.json({
      success: true,

      user: {
        id: currentUser.id,
        username:
          currentUser.username,
        role: currentUser.role,
      },

      pagination: {
        page,
        pageSize,
        total,

        totalPages:
          total === 0
            ? 0
            : Math.ceil(
                total / pageSize
              ),
      },

      products:
        productsWithStatus,
    });
  } catch (error) {
    console.error(
      "PRODUCTS_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi tải sản phẩm.",
      },
      {
        status: 500,
      }
    );
  }
}

// ======================================================
// POST - ADD PRODUCT
// ======================================================

export async function POST(
  request: Request
) {
  try {
    // =========================
    // SESSION
    // =========================

    const cookieStore =
      await cookies();

    const token =
      cookieStore.get(
        "hsd_session"
      )?.value;

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Chưa đăng nhập.",
        },
        {
          status: 401,
        }
      );
    }

    const session =
      await verifySessionToken(
        token
      );

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Phiên đăng nhập không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }

    // =========================
    // CURRENT USER
    // =========================

    const {
      data: currentUser,
      error: currentUserError,
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

    if (currentUserError) {
      console.error(
        "ADD_PRODUCT_USER_ERROR:",
        currentUserError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !currentUser ||
      !currentUser.active
    ) {
      return NextResponse.json(
        {
          error:
            "Tài khoản không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }

    // =========================
    // REQUEST BODY
    // =========================

    const body =
      await request.json();

    const productCode =
      typeof body.productCode ===
      "string"
        ? body.productCode.trim()
        : "";

    const manufactureDate =
      typeof body.manufactureDate ===
      "string"
        ? body.manufactureDate.trim()
        : "";

    const expiryDate =
      typeof body.expiryDate ===
      "string"
        ? body.expiryDate.trim()
        : "";

    const reminderDate =
      typeof body.reminderDate ===
        "string" &&
      body.reminderDate.trim()
        ? body.reminderDate.trim()
        : null;

    const targetUsername =
      typeof body.targetUsername ===
        "string" &&
      body.targetUsername.trim()
        ? body.targetUsername.trim()
        : currentUser.username;

    const quantity =
      Number(body.quantity ?? 0);

    const note =
      normalizeOptionalText(
        body.note
      );

    const description =
      normalizeOptionalText(
        body.description
      );

    // =========================
    // VALIDATE CODE
    // =========================

    if (!productCode) {
      return NextResponse.json(
        {
          error:
            "Vui lòng nhập mã sản phẩm.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // VALIDATE QUANTITY
    // =========================

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
    // VALIDATE NSX / HSD
    // =========================

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
    // VALIDATE REMINDER
    // =========================

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

      const today =
        getVietnamToday();

      if (
        reminderDate <= today
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
    // FIND TARGET USER
    // =========================

    const {
      data: targetUser,
      error: targetUserError,
    } = await supabaseServer
      .from("users")
      .select(
        `
          id,
          username,
          role,
          active,
          parent_id
        `
      )
      .eq(
        "username",
        targetUsername
      )
      .maybeSingle();

    if (targetUserError) {
      console.error(
        "ADD_PRODUCT_TARGET_USER_ERROR:",
        targetUserError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra người dùng.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !targetUser ||
      !targetUser.active
    ) {
      return NextResponse.json(
        {
          error:
            "Người dùng không tồn tại hoặc đã bị khóa.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // PERMISSION
    // =========================

    if (
      currentUser.role ===
        "USER" &&
      targetUser.id !==
        currentUser.id
    ) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền thêm sản phẩm cho người dùng khác.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      currentUser.role ===
      "MANAGER"
    ) {
      const isSelf =
        targetUser.id ===
        currentUser.id;

      const isManagedEmployee =
        targetUser.role ===
          "USER" &&
        targetUser.parent_id ===
          currentUser.id;

      if (
        !isSelf &&
        !isManagedEmployee
      ) {
        return NextResponse.json(
          {
            error:
              "Bạn không có quyền thêm sản phẩm cho tài khoản này.",
          },
          {
            status: 403,
          }
        );
      }
    }

    // ADMIN được phép thêm cho
    // mọi tài khoản active.

    // =========================
    // CATALOG LOOKUP
    // =========================

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
          sale_price,
          active
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
        "ADD_PRODUCT_CATALOG_ERROR:",
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

    // =========================
    // INSERT PRODUCT
    // =========================

    const {
      data: product,
      error: insertError,
    } = await supabaseServer
      .from("products")
      .insert({
        user_id:
          targetUser.id,

        catalog_id:
          catalog.id,

        product_code:
          catalog.product_code,

        product_name:
          catalog.product_name,

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
          catalog.sale_price,

        last_alert_at: null,

        alert_sent: false,

        last_user_action:
          currentUser.username,
      })
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

    if (insertError) {
      console.error(
        "ADD_PRODUCT_INSERT_ERROR:",
        insertError
      );

      return NextResponse.json(
        {
          error:
            "Không thể thêm sản phẩm.",
        },
        {
          status: 500,
        }
      );
    }

    // =========================
    // HISTORY LOG
    // =========================

    const {
      error: historyError,
    } = await supabaseServer
      .from("history_logs")
      .insert({
        actor_user_id:
          currentUser.id,

        action: "THÊM",

        product_id:
          product.id,

        product_code:
          product.product_code,

        product_name:
          product.product_name,

        changes: {
          text: "Thêm sản phẩm",
        },
      });

    if (historyError) {
      // Không hủy sản phẩm chỉ vì
      // ghi log thất bại.
      console.error(
        "ADD_PRODUCT_HISTORY_ERROR:",
        historyError
      );
    }

    // =========================
    // RESPONSE
    // =========================

    return NextResponse.json(
      {
        success: true,

        message:
          "Thêm sản phẩm thành công.",

        product,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "ADD_PRODUCT_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi thêm sản phẩm.",
      },
      {
        status: 500,
      }
    );
  }
}