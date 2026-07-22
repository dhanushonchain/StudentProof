import { auth } from "@/auth";
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

  return <DashboardClient user={user} />;
}
