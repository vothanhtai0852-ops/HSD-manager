import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("hsd_session")?.value;

    if (!token) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    const session = await verifySessionToken(token);

    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    const { data: user, error } = await supabaseServer
      .from("users")
      .select("id, username, role, active, display_name")
      .eq("id", session.userId)
      .maybeSingle();

    if (error) {
      console.error("ME_DATABASE_ERROR:", error);

      return NextResponse.json(
        { error: "Không thể kiểm tra phiên đăng nhập." },
        { status: 500 }
      );
    }

    if (!user || !user.active) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("ME_ERROR:", error);

    return NextResponse.json(
      { error: "Có lỗi xảy ra khi kiểm tra phiên đăng nhập." },
      { status: 500 }
    );
  }
}