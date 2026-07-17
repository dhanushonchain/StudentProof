import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div>
        <h1 className="text-4xl font-bold">
          Welcome {session.user?.name}
        </h1>

        <p>{session.user?.email}</p>

        <img
          src={session.user?.image ?? ""}
          alt=""
          className="w-20 h-20 rounded-full mt-6"
        />
      </div>
    </main>
  );
}