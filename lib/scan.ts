import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

export type ScanActor = {
  id: string;
  username: string;
  role: "ADMIN" | "MANAGER" | "USER";
  active: boolean;
};

// Fast identity check for the scan-increment RPC. The RPC itself verifies
// that the user is active and that the session belongs to this user, so this
// path avoids two extra Supabase round-trips for every barcode.
export async function getScanTokenActor(): Promise<
  { actor: ScanActor; error: null } | { actor: null; error: NextResponse }
> {
  const jar = await cookies();
  const token = jar.get("hsd_session")?.value;
  if (!token) {
    return { actor: null, error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  }
  const session = await verifySessionToken(token);
  if (!session) {
    return { actor: null, error: NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 }) };
  }
  return {
    actor: {
      id: session.userId,
      username: session.username,
      role: session.role,
      active: true,
    },
    error: null,
  };
}

export async function getScanActor(): Promise<
  { actor: ScanActor; error: null } | { actor: null; error: NextResponse }
> {
  const jar = await cookies();
  const token = jar.get("hsd_session")?.value;
  if (!token) return { actor: null, error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  const session = await verifySessionToken(token);
  if (!session) return { actor: null, error: NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 }) };

  const { data, error } = await supabaseServer.from("users")
    .select("id, username, role, active").eq("id", session.userId).maybeSingle();
  if (error) {
    console.error("SCAN_ACTOR_ERROR", error);
    return { actor: null, error: NextResponse.json({ error: "Không thể xác minh tài khoản." }, { status: 500 }) };
  }
  if (!data || !data.active) return { actor: null, error: NextResponse.json({ error: "Tài khoản không hoạt động." }, { status: 401 }) };
  return { actor: data as ScanActor, error: null };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function canAccessScanOwner(actor: ScanActor, ownerId: string) {
  if (actor.id === ownerId || actor.role === "ADMIN") return true;
  if (actor.role !== "MANAGER") return false;
  const { data, error } = await supabaseServer.from("users").select("id")
    .eq("id", ownerId).eq("parent_id", actor.id).eq("role", "USER").maybeSingle();
  return !error && Boolean(data);
}

export async function getScanSession(actor: ScanActor, sessionId: string) {
  const { data, error } = await supabaseServer.from("scan_sessions")
    .select("id, user_id, username_snapshot, status, created_at, completed_at")
    .eq("id", sessionId).maybeSingle();
  if (error) throw error;
  if (!data) return { session: null, forbidden: false };
  if (!(await canAccessScanOwner(actor, data.user_id))) return { session: null, forbidden: true };
  return { session: data, forbidden: false };
}
