import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";


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


type TargetUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
  parent_id: string | null;
};


// ======================================================
// HELPERS
// ======================================================

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}


function normalizeEmail(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}


function isValidEmail(
  value: string
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
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
    .select(`
      id,
      username,
      role,
      active
    `)
    .eq(
      "id",
      session.userId
    )
    .maybeSingle();


  if (error) {
    console.error(
      "USER_EMAIL_CURRENT_USER_ERROR:",
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
// TARGET USER
// ======================================================

async function getTargetUser(
  id: string
): Promise<TargetUser | null> {
  const {
    data,
    error,
  } = await supabaseServer
    .from("users")
    .select(`
      id,
      username,
      role,
      active,
      parent_id
    `)
    .eq(
      "id",
      id
    )
    .maybeSingle();


  if (error) {
    console.error(
      "USER_EMAIL_TARGET_ERROR:",
      error
    );

    throw new Error(
      "Không thể tải tài khoản."
    );
  }


  return data as
    | TargetUser
    | null;
}


// ======================================================
// POST
// THÊM EMAIL CHO USER
// ======================================================

export async function POST(
  request: Request,

  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    // ==================================================
    // ID
    // ==================================================

    const {
      id,
    } =
      await context.params;


    if (!isValidUuid(id)) {
      return NextResponse.json(
        {
          error:
            "ID tài khoản không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }


    // ==================================================
    // CURRENT USER
    // ==================================================

    const auth =
      await getCurrentUser();


    if (auth.error) {
      return auth.error;
    }


    const currentUser =
      auth.user;


    // ==================================================
    // TARGET USER
    // ==================================================

    const targetUser =
      await getTargetUser(
        id
      );


    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "Tài khoản không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }


    // ==================================================
    // PERMISSION
    // ==================================================

    const isAdmin =
      currentUser.role ===
      "ADMIN";


    const isManager =
      currentUser.role ===
      "MANAGER";


    const isManagedEmployee =
      isManager &&
      targetUser.role ===
        "USER" &&
      targetUser.parent_id ===
        currentUser.id;


    if (
      !isAdmin &&
      !isManagedEmployee
    ) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền quản lý email của tài khoản này.",
        },
        {
          status: 403,
        }
      );
    }


    // ==================================================
    // BODY
    // ==================================================

    const body =
      await request.json();


    const email =
      normalizeEmail(
        body.email
      );


    if (
      !email ||
      !isValidEmail(email)
    ) {
      return NextResponse.json(
        {
          error:
            "Email không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }


    // ==================================================
    // CHECK EMAIL ĐÃ TỒN TẠI
    // ==================================================

    const {
      data:
        existingEmail,

      error:
        existingEmailError,
    } = await supabaseServer
      .from("user_emails")
      .select(`
        id,
        user_id,
        email
      `)
      .ilike(
        "email",
        email
      )
      .limit(1)
      .maybeSingle();


    if (
      existingEmailError
    ) {
      console.error(
        "ADD_USER_EMAIL_CHECK_ERROR:",
        existingEmailError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra Email.",
        },
        {
          status: 500,
        }
      );
    }


    if (existingEmail) {
      return NextResponse.json(
        {
          error:
            existingEmail
              .user_id === id
              ? "Email này đã có trong tài khoản."
              : "Email này đang được sử dụng bởi tài khoản khác.",
        },
        {
          status: 409,
        }
      );
    }


    // ==================================================
    // KIỂM TRA USER ĐÃ CÓ EMAIL CHƯA
    // ==================================================

    const {
      data:
        currentEmails,

      error:
        currentEmailsError,
    } = await supabaseServer
      .from("user_emails")
      .select(`
        id,
        is_primary
      `)
      .eq(
        "user_id",
        id
      );


    if (
      currentEmailsError
    ) {
      console.error(
        "ADD_USER_EMAIL_LIST_ERROR:",
        currentEmailsError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra danh sách Email.",
        },
        {
          status: 500,
        }
      );
    }


    const isFirstEmail =
      (currentEmails ?? [])
        .length === 0;


    // ==================================================
    // INSERT EMAIL
    // ==================================================

    const {
      data: newEmail,
      error: insertError,
    } = await supabaseServer
      .from("user_emails")
      .insert({
        user_id:
          id,

        email,

        active:
          true,

        is_primary:
          isFirstEmail,
      })
      .select(`
        id,
        email,
        active,
        is_primary
      `)
      .single();


    if (insertError) {
      console.error(
        "ADD_USER_EMAIL_ERROR:",
        insertError
      );

      return NextResponse.json(
        {
          error:
            "Không thể thêm Email.",
        },
        {
          status: 500,
        }
      );
    }


    // ==================================================
    // RESPONSE
    // ==================================================

    return NextResponse.json(
      {
        success: true,

        message:
          "Thêm Email thành công.",

        email: {
          id:
            newEmail.id,

          email:
            newEmail.email,

          active:
            newEmail.active,

          isPrimary:
            newEmail.is_primary,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "ADD_USER_EMAIL_ROUTE_ERROR:",
      error
    );


    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi thêm Email.",
      },
      {
        status: 500,
      }
    );
  }
}