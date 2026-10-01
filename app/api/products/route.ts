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
    // ==================================================
    // SESSION
    // ==================================================

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


    // ==================================================
    // CURRENT USER
    // ==================================================

    const {
      data: currentUser,
      error: userError,
    } =
      await supabaseServer
        .from("users")
        .select(
          `
            id,
            username,
            display_name,
            role,
            active
          `
        )
        .eq(
          "id",
          session.userId
        )
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


    // ==================================================
    // QUERY PARAMS
    // ==================================================

    const {
      searchParams,
    } =
      new URL(
        request.url
      );


    /*
     * PAGE
     */

    const requestedPage =
      Number(
        searchParams.get(
          "page"
        ) || "1"
      );

    const page =
      Number.isInteger(
        requestedPage
      ) &&
      requestedPage > 0
        ? requestedPage
        : 1;


    /*
     * PAGE SIZE
     */

    const requestedPageSize =
      Number(
        searchParams.get(
          "pageSize"
        ) || "30"
      );

    const allowedPageSizes = [
      30,
      50,
      100,
      200,
    ];

    const pageSize =
      allowedPageSizes.includes(
        requestedPageSize
      )
        ? requestedPageSize
        : 30;


    /*
     * SEARCH
     */

    const search =
      (
        searchParams.get(
          "search"
        ) || ""
      ).trim();


    /*
     * USER FILTER
     */

    const requestedUserId =
      (
        searchParams.get(
          "userId"
        ) || ""
      ).trim();


    /*
     * STATUS FILTER
     */

    const requestedStatus =
      (
        searchParams.get(
          "status"
        ) || ""
      ).trim();


    /*
     * SORT
     */

    const requestedSort =
      (
        searchParams.get(
          "sort"
        ) || "NEWEST"
      ).trim();


    const allowedStatuses = [
      "BINH_THUONG",
      "CANH_BAO",
      "BAO_LAI",
      "DA_BAO",
      "LOI",
    ];


    const allowedSorts = [
      "NEWEST",
      "TEN_ASC",
      "TEN_DESC",
      "PERCENT_ASC",
      "PERCENT_DESC",
      "HSD_ASC",
      "HSD_DESC",
    ];


    const statusFilter =
      allowedStatuses.includes(
        requestedStatus
      )
        ? requestedStatus
        : "";


    const sort =
      allowedSorts.includes(
        requestedSort
      )
        ? requestedSort
        : "NEWEST";


    // ==================================================
    // USER SCOPE
    // ==================================================

    type FilterUser = {
      id: string;
      username: string;
      display_name: string | null;
      role: string;
      active: boolean;
    };


    let filterUsers:
      FilterUser[] = [];


    /*
     * null = ADMIN xem toàn bộ
     */

    let allowedUserIds:
      string[] | null = null;


    /*
     * Dùng riêng cho card:
     * "Sản phẩm đã thêm trong ngày"
     *
     * MANAGER chỉ tính nhân viên mình quản lý,
     * không tính sản phẩm của chính manager.
     */

    let managerEmployeeIds:
      string[] = [];


    // ==================================================
    // USER
    // ==================================================

    if (
      currentUser.role ===
      "USER"
    ) {
      filterUsers = [
        {
          id:
            currentUser.id,

          username:
            currentUser.username,

          display_name:
            currentUser.display_name,

          role:
            currentUser.role,

          active:
            currentUser.active,
        },
      ];


      allowedUserIds = [
        currentUser.id,
      ];
    }


    // ==================================================
    // MANAGER
    // ==================================================

    if (
      currentUser.role ===
      "MANAGER"
    ) {
      const {
        data: employees,
        error: employeesError,
      } =
        await supabaseServer
          .from("users")
          .select(
            `
              id,
              username,
              display_name,
              role,
              active
            `
          )
          .eq(
            "parent_id",
            currentUser.id
          )
          .eq(
            "role",
            "USER"
          )
          .eq(
            "active",
            true
          )
          .order(
            "username",
            {
              ascending: true,
            }
          );


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


      managerEmployeeIds =
        (
          employees ??
          []
        ).map(
          (employee) =>
            employee.id
        );


      /*
       * Danh sách sản phẩm:
       * manager vẫn thấy bản thân + nhân viên.
       */

      allowedUserIds = [
        currentUser.id,
        ...managerEmployeeIds,
      ];


      filterUsers = [
        {
          id:
            currentUser.id,

          username:
            currentUser.username,

          display_name:
            currentUser.display_name,

          role:
            currentUser.role,

          active:
            currentUser.active,
        },

        ...(
          employees ??
          []
        ),
      ];
    }


    // ==================================================
    // ADMIN
    // ==================================================

    if (
      currentUser.role ===
      "ADMIN"
    ) {
      const {
        data: users,
        error: usersError,
      } =
        await supabaseServer
          .from("users")
          .select(
            `
              id,
              username,
              display_name,
              role,
              active
            `
          )
          .eq(
            "active",
            true
          )
          .order(
            "username",
            {
              ascending: true,
            }
          );


      if (usersError) {
        console.error(
          "PRODUCTS_FILTER_USERS_ERROR:",
          usersError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải danh sách người dùng.",
          },
          {
            status: 500,
          }
        );
      }


      filterUsers =
        users ?? [];


      /*
       * ADMIN không giới hạn user_id.
       */

      allowedUserIds = null;
    }


    // ==================================================
    // VALIDATE USER FILTER
    // ==================================================

    if (requestedUserId) {
      const canAccess =
        filterUsers.some(
          (user) =>
            user.id ===
            requestedUserId
        );


      if (!canAccess) {
        return NextResponse.json(
          {
            error:
              "Bạn không có quyền xem sản phẩm của tài khoản này.",
          },
          {
            status: 403,
          }
        );
      }
    }


    // ==================================================
    // ALERT CONFIG
    // ==================================================

    const {
      data: alertConfigs,
      error: alertConfigsError,
    } =
      await supabaseServer
        .from(
          "alert_configs"
        )
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
          config.user_id ===
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
          config
            .threshold_percent
        )
      );
    }


    // ==================================================
    // LOAD ALL PRODUCTS IN CURRENT USER SCOPE
    // ==================================================
    //
    // Load theo batch 1000 để tránh giới hạn mặc định.
    //
    // Sau đó mới:
    // - tính trạng thái
    // - thống kê
    // - filter
    // - sort
    // - pagination
    //
    // Với dữ liệu hiện tại khoảng 1.4k sản phẩm thì ổn.
    // ==================================================

    const allProducts:
      any[] = [];


    const batchSize =
      1000;


    for (
      let offset = 0;
      ;
      offset += batchSize
    ) {
      let query =
        supabaseServer
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
            `
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .range(
            offset,
            offset +
              batchSize -
              1
          );


      /*
       * USER / MANAGER
       */

      if (
        allowedUserIds !== null
      ) {
        query =
          query.in(
            "user_id",
            allowedUserIds
          );
      }


      const {
        data,
        error: productsError,
      } =
        await query;


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


      const rows =
        data ?? [];


      allProducts.push(
        ...rows
      );


      /*
       * Batch cuối.
       */

      if (
        rows.length <
        batchSize
      ) {
        break;
      }
    }


    // ==================================================
    // CALCULATE STATUS
    // ==================================================

    const productsWithStatus =
      allProducts.map(
        (product) => {
          const thresholdPercent =
            thresholdByUser.get(
              product.user_id
            ) ??
            defaultThreshold;


          const result =
            getProductStatus({
              manufactureDate:
                product
                  .manufacture_date,

              expiryDate:
                product
                  .expiry_date,

              reminderDate:
                product
                  .reminder_date,

              alertSent:
                product
                  .alert_sent,

              thresholdPercent,
            });


          return {
            ...product,

            threshold_percent:
              thresholdPercent,

            percent_remaining:
              result
                .percentRemaining,

            status:
              result.status,
          };
        }
      );


    // ==================================================
    // DASHBOARD STATISTICS
    // ==================================================
    //
    // Stats KHÔNG phụ thuộc:
    //
    // - search
    // - user filter
    // - status filter
    // - sort
    //
    // ==================================================

    const totalProducts =
      productsWithStatus.length;


    const warningProducts =
      productsWithStatus.filter(
        (product) =>
          product.status ===
          "CANH_BAO"
      ).length;


    const reminderProducts =
      productsWithStatus.filter(
        (product) =>
          product.status ===
          "BAO_LAI"
      ).length;


    // ==================================================
    // PRODUCTS ADDED TODAY
    // ==================================================

    const vietnamToday =
      getVietnamToday();


    const todayStart =
      new Date(
        `${vietnamToday}T00:00:00+07:00`
      );


    const tomorrowStart =
      new Date(
        todayStart.getTime() +
          24 *
            60 *
            60 *
            1000
      );


    const todayStartTime =
      todayStart.getTime();


    const tomorrowStartTime =
      tomorrowStart.getTime();


    const addedTodayProducts =
      productsWithStatus.filter(
        (product) => {
          if (
            !product.created_at
          ) {
            return false;
          }


          const createdTime =
            new Date(
              product.created_at
            ).getTime();


          if (
            !Number.isFinite(
              createdTime
            )
          ) {
            return false;
          }


          if (
            createdTime <
              todayStartTime ||
            createdTime >=
              tomorrowStartTime
          ) {
            return false;
          }


          /*
           * ADMIN:
           * toàn bộ sản phẩm
           * được thêm hôm nay.
           */

          if (
            currentUser.role ===
            "ADMIN"
          ) {
            return true;
          }


          /*
           * USER:
           * sản phẩm của chính user.
           */

          if (
            currentUser.role ===
            "USER"
          ) {
            return (
              product.user_id ===
              currentUser.id
            );
          }


          /*
           * MANAGER:
           * chỉ tính sản phẩm
           * của nhân viên đang quản lý.
           *
           * Không tính sản phẩm
           * của chính manager.
           */

          if (
            currentUser.role ===
            "MANAGER"
          ) {
            return (
              managerEmployeeIds.includes(
                product.user_id
              )
            );
          }


          return false;
        }
      ).length;


    // ==================================================
    // FILTER
    // ==================================================

    let filteredProducts =
      [
        ...productsWithStatus,
      ];


    // ==================================================
    // USER FILTER
    // ==================================================

    if (requestedUserId) {
      filteredProducts =
        filteredProducts.filter(
          (product) =>
            product.user_id ===
            requestedUserId
        );
    }


    // ==================================================
    // STATUS FILTER
    // ==================================================

    if (statusFilter) {
      filteredProducts =
        filteredProducts.filter(
          (product) =>
            product.status ===
            statusFilter
        );
    }


    // ==================================================
    // SEARCH
    // ==================================================
    //
    // Tìm ngay khi user gõ.
    //
    // Search:
    // - Mã SP
    // - Tên SP
    // - Note
    // - Ghi chú
    //
    // ==================================================

    if (search) {
      const normalizedSearch =
        search.toLocaleLowerCase(
          "vi"
        );


      filteredProducts =
        filteredProducts.filter(
          (product) => {
            const values = [
              product.product_code,
              product.product_name,
              product.note,
              product.description,
            ];


            return values.some(
              (value) =>
                typeof value ===
                  "string" &&
                value
                  .toLocaleLowerCase(
                    "vi"
                  )
                  .includes(
                    normalizedSearch
                  )
            );
          }
        );
    }


    // ==================================================
    // SORT HELPERS
    // ==================================================

    function compareNullableNumber(
      a: number | null,
      b: number | null,
      ascending: boolean
    ) {
      if (
        a === null &&
        b === null
      ) {
        return 0;
      }


      if (a === null) {
        return 1;
      }


      if (b === null) {
        return -1;
      }


      return ascending
        ? a - b
        : b - a;
    }


    function compareNullableDate(
      a: string | null,
      b: string | null,
      ascending: boolean
    ) {
      if (
        !a &&
        !b
      ) {
        return 0;
      }


      if (!a) {
        return 1;
      }


      if (!b) {
        return -1;
      }


      return ascending
        ? a.localeCompare(b)
        : b.localeCompare(a);
    }


    // ==================================================
    // SORT
    // ==================================================

    filteredProducts.sort(
      (a, b) => {
        switch (sort) {
          // ----------------------------------------------
          // TÊN A -> Z
          // ----------------------------------------------

          case "TEN_ASC":
            return (
              a.product_name ??
              ""
            ).localeCompare(
              b.product_name ??
                "",
              "vi",
              {
                sensitivity:
                  "base",
              }
            );


          // ----------------------------------------------
          // TÊN Z -> A
          // ----------------------------------------------

          case "TEN_DESC":
            return (
              b.product_name ??
              ""
            ).localeCompare(
              a.product_name ??
                "",
              "vi",
              {
                sensitivity:
                  "base",
              }
            );


          // ----------------------------------------------
          // % HSD THẤP -> CAO
          // ----------------------------------------------

          case "PERCENT_ASC":
            return compareNullableNumber(
              a.percent_remaining,
              b.percent_remaining,
              true
            );


          // ----------------------------------------------
          // % HSD CAO -> THẤP
          // ----------------------------------------------

          case "PERCENT_DESC":
            return compareNullableNumber(
              a.percent_remaining,
              b.percent_remaining,
              false
            );


          // ----------------------------------------------
          // HSD GẦN -> XA
          // ----------------------------------------------

          case "HSD_ASC":
            return compareNullableDate(
              a.expiry_date,
              b.expiry_date,
              true
            );


          // ----------------------------------------------
          // HSD XA -> GẦN
          // ----------------------------------------------

          case "HSD_DESC":
            return compareNullableDate(
              a.expiry_date,
              b.expiry_date,
              false
            );


          // ----------------------------------------------
          // MỚI NHẤT
          // ----------------------------------------------

          case "NEWEST":
          default:
            return (
              new Date(
                b.created_at
              ).getTime() -
              new Date(
                a.created_at
              ).getTime()
            );
        }
      }
    );


    // ==================================================
    // PAGINATION
    // ==================================================

    const total =
      filteredProducts.length;


    const totalPages =
      total === 0
        ? 0
        : Math.ceil(
            total /
              pageSize
          );


    /*
     * Nếu filter làm số trang
     * giảm xuống thì ép về
     * trang hợp lệ gần nhất.
     */

    const safePage =
      totalPages === 0
        ? 1
        : Math.min(
            page,
            totalPages
          );


    const from =
      (
        safePage -
        1
      ) *
      pageSize;


    const products =
      filteredProducts.slice(
        from,
        from +
          pageSize
      );


    // ==================================================
    // RESPONSE
    // ==================================================

    return NextResponse.json({
      success: true,


      user: {
        id:
          currentUser.id,

        username:
          currentUser.username,

        role:
          currentUser.role,
      },


      /*
       * Dashboard cards
       */

      stats: {
        totalProducts,
        warningProducts,
        reminderProducts,
        addedTodayProducts,
      },


      /*
       * User dropdown
       */

      filterUsers:
        filterUsers.map(
          (user) => ({
            id:
              user.id,

            username:
              user.username,

            display_name:
              user.display_name,

            role:
              user.role,

            active:
              user.active,
          })
        ),


      /*
       * Pagination
       */

      pagination: {
        page:
          safePage,

        pageSize,

        total,

        totalPages,
      },


      products,
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