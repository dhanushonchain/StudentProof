import { auth } from "@/auth";
import PrismaHero from "@/components/hero/Hero";
import { MinimalFooter as Footer } from "@/components/ui/minimal-footer";
import type { ProfileMenuUser } from "@/components/profile-menu/profile-menu";

export default async function DemoOne() {
  const session = await auth();

  const user: ProfileMenuUser | null = session
    ? {
        name: session.user?.name ?? "Dhanush Yangola",
        image: session.user?.image ?? null,
      }
    : null;

  return (
    <>
      <PrismaHero user={user} />
      <Footer />
    </>
  );
}
