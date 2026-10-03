import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

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
  password_hash: string;
};

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function getCurrentUser(): Promise<
  | { user: CurrentUser; error: null }
  | { user: null; error: NextResponse }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get("hsd_session")?.value;

  if (!token) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Chưa đăng nhập." },
        { status: 401 }
      ),
    };
  }

  const session = await verifySessionToken(token);

  if (!session) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Phiên đăng nhập không hợp lệ." },
        { status: 401 }
      ),
    };
  }

  const { data, error } = await supabaseServer
    .from("users")
    .select("id, username, role, active")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    console.error("PASSWORD_CURRENT_USER_ERROR:", error);

    return {
      user: null,
      error: NextResponse.json(
        { error: "Không thể kiểm tra tài khoản." },
        { status: 500 }
      ),
    };
  }

  if (!data || !data.active) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Tài khoản không hợp lệ hoặc đã bị khóa." },
        { status: 401 }
      ),
    };
  }

  return {
    user: data as CurrentUser,
    error: null,
  };
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!isValidUuid(id)) {
      return NextResponse.json(
        { error: "ID tài khoản không hợp lệ." },
        { status: 400 }
      );
    }

    const auth = await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser = auth.user;
    const isSelf = currentUser.id === id;
    const isAdmin = currentUser.role === "ADMIN";

    /*
     * QUYỀN:
     * - ADMIN: reset mật khẩu cho mọi tài khoản.
     * - ADMIN đổi mật khẩu chính mình: phải nhập mật khẩu hiện tại.
     * - MANAGER/USER: chỉ được đổi mật khẩu của chính mình.
     * - MANAGER KHÔNG reset mật khẩu nhân viên.
     */
    if (!isSelf && !isAdmin) {
      return NextResponse.json(
        { error: "Bạn không có quyền đặt lại mật khẩu tài khoản này." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const newPassword =
      typeof body?.newPassword === "string"
        ? body.newPassword
        : "";

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Mật khẩu mới phải có ít nhất 8 ký tự." },
        { status: 400 }
      );
    }

    const { data: targetUserData, error: targetUserError } =
      await supabaseServer
        .from("users")
        .select("id, username, role, active, password_hash")
        .eq("id", id)
        .maybeSingle();

    if (targetUserError) {
      console.error("PASSWORD_TARGET_USER_ERROR:", targetUserError);

      return NextResponse.json(
        { error: "Không thể tải tài khoản cần đổi mật khẩu." },
        { status: 500 }
      );
    }

    if (!targetUserData) {
      return NextResponse.json(
        { error: "Tài khoản không tồn tại." },
        { status: 404 }
      );
    }

    const targetUser = targetUserData as TargetUser;

    /*
     * Khi đổi mật khẩu chính mình, bất kể ADMIN/MANAGER/USER,
     * phải xác nhận mật khẩu hiện tại.
     *
     * Khi ADMIN reset cho người khác thì không cần mật khẩu hiện tại.
     */
    if (isSelf) {
      const currentPassword =
        typeof body?.currentPassword === "string"
          ? body.currentPassword
          : "";

      if (!currentPassword) {
        return NextResponse.json(
          { error: "Vui lòng nhập mật khẩu hiện tại." },
          { status: 400 }
        );
      }

      const passwordOk = await bcrypt.compare(
        currentPassword,
        targetUser.password_hash
      );

      if (!passwordOk) {
        return NextResponse.json(
          { error: "Mật khẩu hiện tại không đúng." },
          { status: 400 }
        );
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { error: updateError } = await supabaseServer
      .from("users")
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("PASSWORD_UPDATE_ERROR:", updateError);

      return NextResponse.json(
        { error: "Không thể cập nhật mật khẩu." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: isSelf
        ? "Đổi mật khẩu thành công."
        : `Đã reset mật khẩu cho ${targetUser.username}.`,
    });
  } catch (error) {
    console.error("PASSWORD_ROUTE_ERROR:", error);

    return NextResponse.json(
      { error: "Có lỗi xảy ra khi cập nhật mật khẩu." },
      { status: 500 }
    );
  }
}
