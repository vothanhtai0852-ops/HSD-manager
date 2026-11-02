import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase-server";
import { createSessionToken } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Vui lòng nhập tài khoản và mật khẩu." },
        { status: 400 }
      );
    }

    const { data: user, error } = await supabaseServer
      .from("users")
      .select("id, username, password_hash, role, active, display_name")
      .ilike("username", username)
      .maybeSingle();

  if (error) {
  console.error("LOGIN_DATABASE_ERROR:", error);

  return NextResponse.json(
    { error: "Không thể kiểm tra tài khoản." },
    { status: 500 }
  );
}



if (!user || !user.active) {
      return NextResponse.json(
        { error: "Tài khoản hoặc mật khẩu không đúng." },
        { status: 401 }
      );
    }

    const passwordOk = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordOk) {
      return NextResponse.json(
        { error: "Tài khoản hoặc mật khẩu không đúng." },
        { status: 401 }
      );
    }

    const token = await createSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });

    response.cookies.set("hsd_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 6,
    });

    return response;
  } catch (error) {
    console.error("LOGIN_ERROR:", error);

    return NextResponse.json(
      { error: "Có lỗi xảy ra khi đăng nhập." },
      { status: 500 }
    );
  }
}