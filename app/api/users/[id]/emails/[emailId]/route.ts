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
  role: UserRole;
  active: boolean;
};


type TargetUser = {
  id: string;
  role: UserRole;
  parent_id: string | null;
};


type TargetEmail = {
  id: string;
  user_id: string;
  email: string;
  active: boolean;
  is_primary: boolean;
};


function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}


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
      role,
      active
    `)
    .eq(
      "id",
      session.userId
    )
    .maybeSingle();


  if (
    error ||
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


async function loadTargetUser(
  id: string
): Promise<TargetUser | null> {
  const {
    data,
    error,
  } = await supabaseServer
    .from("users")
    .select(`
      id,
      role,
      parent_id
    `)
    .eq(
      "id",
      id
    )
    .maybeSingle();


  if (error) {
    throw new Error(
      "Không thể tải tài khoản."
    );
  }


  return data as
    | TargetUser
    | null;
}


async function checkPermission(
  currentUser: CurrentUser,
  targetUser: TargetUser
) {
  if (
    currentUser.role ===
    "ADMIN"
  ) {
    return true;
  }


  return (
    currentUser.role ===
      "MANAGER" &&
    targetUser.role ===
      "USER" &&
    targetUser.parent_id ===
      currentUser.id
  );
}


async function loadTargetEmail(
  userId: string,
  emailId: string
): Promise<TargetEmail | null> {
  const {
    data,
    error,
  } = await supabaseServer
    .from("user_emails")
    .select(`
      id,
      user_id,
      email,
      active,
      is_primary
    `)
    .eq(
      "id",
      emailId
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();


  if (error) {
    throw new Error(
      "Không thể tải Email."
    );
  }


  return data as
    | TargetEmail
    | null;
}


// ======================================================
// PATCH
// BẬT / TẮT EMAIL
// ======================================================

export async function PATCH(
  request: Request,

  context: {
    params: Promise<{
      id: string;
      emailId: string;
    }>;
  }
) {
  try {
    const {
      id,
      emailId,
    } =
      await context.params;


    if (
      !isValidUuid(id) ||
      !isValidUuid(emailId)
    ) {
      return NextResponse.json(
        {
          error:
            "ID không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }


    const auth =
      await getCurrentUser();


    if (auth.error) {
      return auth.error;
    }


    const targetUser =
      await loadTargetUser(id);


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


    const allowed =
      await checkPermission(
        auth.user,
        targetUser
      );


    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền quản lý Email của tài khoản này.",
        },
        {
          status: 403,
        }
      );
    }


    const targetEmail =
      await loadTargetEmail(
        id,
        emailId
      );


    if (!targetEmail) {
      return NextResponse.json(
        {
          error:
            "Email không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }


    const body =
      await request.json();


    if (
      typeof body.active !==
      "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            "Trạng thái Email không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }


    /*
     * Không cho tắt email PRIMARY.
     * Muốn thay đổi primary sẽ làm riêng sau,
     * tránh trạng thái user không còn email chính.
     */

    if (
      targetEmail.is_primary &&
      body.active === false
    ) {
      return NextResponse.json(
        {
          error:
            "Không thể tắt Email chính.",
        },
        {
          status: 400,
        }
      );
    }


    const {
      data: updatedEmail,
      error: updateError,
    } = await supabaseServer
      .from("user_emails")
      .update({
        active:
          body.active,
      })
      .eq(
        "id",
        emailId
      )
      .eq(
        "user_id",
        id
      )
      .select(`
        id,
        email,
        active,
        is_primary
      `)
      .single();


    if (updateError) {
      console.error(
        "UPDATE_USER_EMAIL_ERROR:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Không thể cập nhật Email.",
        },
        {
          status: 500,
        }
      );
    }


    return NextResponse.json({
      success: true,

      message:
        body.active
          ? "Đã bật Email."
          : "Đã tắt Email.",

      email: {
        id:
          updatedEmail.id,

        email:
          updatedEmail.email,

        active:
          updatedEmail.active,

        isPrimary:
          updatedEmail.is_primary,
      },
    });
  } catch (error) {
    console.error(
      "UPDATE_USER_EMAIL_ROUTE_ERROR:",
      error
    );


    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi cập nhật Email.",
      },
      {
        status: 500,
      }
    );
  }
}


// ======================================================
// DELETE
// XÓA EMAIL PHỤ
// ======================================================

export async function DELETE(
  _request: Request,

  context: {
    params: Promise<{
      id: string;
      emailId: string;
    }>;
  }
) {
  try {
    const {
      id,
      emailId,
    } =
      await context.params;


    if (
      !isValidUuid(id) ||
      !isValidUuid(emailId)
    ) {
      return NextResponse.json(
        {
          error:
            "ID không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }


    const auth =
      await getCurrentUser();


    if (auth.error) {
      return auth.error;
    }


    const targetUser =
      await loadTargetUser(id);


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


    const allowed =
      await checkPermission(
        auth.user,
        targetUser
      );


    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền quản lý Email của tài khoản này.",
        },
        {
          status: 403,
        }
      );
    }


    const targetEmail =
      await loadTargetEmail(
        id,
        emailId
      );


    if (!targetEmail) {
      return NextResponse.json(
        {
          error:
            "Email không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }


    /*
     * Không xóa PRIMARY.
     */

    if (
      targetEmail.is_primary
    ) {
      return NextResponse.json(
        {
          error:
            "Không thể xóa Email chính.",
        },
        {
          status: 400,
        }
      );
    }


    const {
      count,
      error: countError,
    } = await supabaseServer
      .from("user_emails")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "user_id",
        id
      );


    if (countError) {
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


    if (
      (count ?? 0) <= 1
    ) {
      return NextResponse.json(
        {
          error:
            "Tài khoản phải có ít nhất một Email.",
        },
        {
          status: 400,
        }
      );
    }


    const {
      error: deleteError,
    } = await supabaseServer
      .from("user_emails")
      .delete()
      .eq(
        "id",
        emailId
      )
      .eq(
        "user_id",
        id
      );


    if (deleteError) {
      console.error(
        "DELETE_USER_EMAIL_ERROR:",
        deleteError
      );

      return NextResponse.json(
        {
          error:
            "Không thể xóa Email.",
        },
        {
          status: 500,
        }
      );
    }


    return NextResponse.json({
      success: true,

      message:
        "Xóa Email thành công.",
    });
  } catch (error) {
    console.error(
      "DELETE_USER_EMAIL_ROUTE_ERROR:",
      error
    );


    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi xóa Email.",
      },
      {
        status: 500,
      }
    );
  }
}