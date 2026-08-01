import { auth } from "@/auth";
import { getRecentActivity } from "@/lib/activity-db";
import { getLatestVerification } from "@/lib/verification-db";
import { redirect } from "next/navigation";
import DashboardClient, { type DashboardUser } from "./dashboard-client";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const user: DashboardUser = {
    name: session.user?.name ?? "Dhanush Yangola",
    email: session.user?.email ?? "yangoladhanush@gmail.com",
    image: session.user?.image ?? null,
    walletPublicKey: session.user?.walletPublicKey ?? null,
    loginAt: session.user?.loginAt ?? null,
  };

  const activity = user.walletPublicKey ? await getRecentActivity(user.walletPublicKey) : [];
  const verification = user.walletPublicKey ? await getLatestVerification(user.walletPublicKey) : null;

  return <DashboardClient user={user} activity={activity} verification={verification} />;
}
