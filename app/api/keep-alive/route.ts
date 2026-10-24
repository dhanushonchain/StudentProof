import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Free-tier databases (Aiven, Layerbase) power off or archive after a period
// with no activity. Aiven drops the DNS record entirely, so every request to
// the site fails — this endpoint exists purely so an external cron can register
// continuous activity. force-dynamic: a cached 200 would report success without
// ever touching the database, which defeats the point of the ping.
export const dynamic = "force-dynamic";

function isAuthorized(provided: string | null): boolean {
  const expected = process.env.KEEP_ALIVE_TOKEN;
  if (!expected || !provided) return false;
  const actual = Buffer.from(provided, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  // Constant-time compare — a plain === leaks the token prefix by response time.
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ms: Date.now() - startedAt });
  } catch (error) {
    // Detail goes to server logs only; the body stays generic so a connection
    // string or host name never reaches a client.
    console.error("[KeepAlive] database ping failed:", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
