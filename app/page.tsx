import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/session";

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hsd_session")?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await verifySessionToken(token);

  if (!session) {
    redirect("/login");
  }

  redirect("/dashboard");
}