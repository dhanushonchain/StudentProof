import { auth } from "@/auth";
import { getRecentActivity } from "@/lib/activity-db";
import { getCredentials, getLatestVerification } from "@/lib/verification-db";
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
  // Every credential this user has ever been issued, most recent first — a
  // wallet can hold several (e.g. BSc, later MSc). Today's dashboard only
  // renders the first one; the full array is threaded through so a future
  // multi-credential UI needs no backend changes.
  const credentials = user.walletPublicKey ? await getCredentials(user.walletPublicKey) : [];

  // The currently-configured contract, not whatever's stored on the
  // Credential row — if the contract is ever redeployed again, this keeps
  // the Snowtrace link pointed at the live contract rather than a value
  // frozen at mint time.
  const credentialContractAddress = process.env.STUDENT_CREDENTIAL_REGISTRY_ADDRESS ?? null;

  return (
    <DashboardClient
      user={user}
      activity={activity}
      verification={verification}
      credentials={credentials}
      credentialContractAddress={credentialContractAddress}
    />
  );
}
