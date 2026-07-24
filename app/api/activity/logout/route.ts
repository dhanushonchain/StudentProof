import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  const walletAddress = session?.user?.walletPublicKey;

  if (!walletAddress) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { logSignOut } = await import("@/lib/activity-db");
  await logSignOut(walletAddress);

  return NextResponse.json({ ok: true });
}
