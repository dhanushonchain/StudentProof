// Database-backed activity logging. Only called server-to-server (jwt callback,
// API routes, server components) via lazy dynamic import, never from client —
// same reason lib/wallet.ts is dynamically imported: this pulls in the Prisma
// client's Node-only engine, which is not Edge-Runtime-safe.

import { prisma } from "./prisma";

export type ActivityEventDTO = {
  id: string;
  eventType: string;
  metadata: unknown;
  timestamp: string;
};

// Called on every fresh sign-in. Creates the User row on first-ever login
// (no-op update if it already exists), then logs a "login" event and, only
// when a wallet was genuinely just funded (not a repeat sign-in where funding
// was skipped), a "wallet_created" event.
export async function logSignIn({
  googleSub,
  email,
  walletAddress,
  walletFunded,
}: {
  googleSub: string;
  email: string;
  walletAddress: string;
  walletFunded: boolean;
}) {
  const user = await prisma.user.upsert({
    where: { googleSub },
    create: { googleSub, email, walletAddress },
    update: {}, // user already exists — nothing to change
  });

  await prisma.activityEvent.create({
    data: { userId: user.id, eventType: "login" },
  });

  if (walletFunded) {
    await prisma.activityEvent.create({
      data: { userId: user.id, eventType: "wallet_created" },
    });
  }

  return user;
}

// Called from /api/activity/logout right before signOut() runs client-side.
export async function logSignOut(walletAddress: string) {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return;

  await prisma.activityEvent.create({
    data: { userId: user.id, eventType: "logout" },
  });
}

// Most recent activity for a user, newest first, capped at `limit`.
export async function getRecentActivity(walletAddress: string, limit = 50): Promise<ActivityEventDTO[]> {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return [];

  const events = await prisma.activityEvent.findMany({
    where: { userId: user.id },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    metadata: event.metadata,
    timestamp: event.timestamp.toISOString(),
  }));
}
