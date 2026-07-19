import { auth } from "@/auth";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { X } from "lucide-react";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const name = session.user?.name ?? "Student";
  const email = session.user?.email ?? "";
  const image = session.user?.image;
  const initial = name.charAt(0).toUpperCase();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 bg-black/45" />

      <section className="relative z-10 w-full max-w-lg rounded-3xl bg-black p-10 text-center">
        <Link
          href="/"
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-gray-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close dashboard"
        >
          <X className="h-4 w-4" />
        </Link>

        <div className="flex justify-center">
          <Image
            src="/StudentProof.svg"
            alt="StudentProof"
            width={300}
            height={65}
            priority
            className="h-auto w-64"
          />
        </div>

        <div className="mt-10 flex justify-center">
          {image ? (
            <div
              aria-label={`${name} profile photo`}
              className="h-24 w-24 rounded-full border border-white/15 bg-cover bg-center"
              style={{ backgroundImage: `url(${image})` }}
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-white/10 text-3xl font-bold text-[#E1E0CC]">
              {initial}
            </div>
          )}
        </div>

        <div className="mt-8">
          <h1 className="text-4xl font-bold" style={{ color: "#E1E0CC", lineHeight: 1.2 }}>
            Welcome, {name}
          </h1>

          {email && (
            <p className="mt-4 text-sm" style={{ color: "#E1E0CC", lineHeight: 1.2 }}>
              {email}
            </p>
          )}
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
          <p className="text-sm" style={{ color: "#E1E0CC", lineHeight: 1.5 }}>
            Your StudentProof account is ready. Continue your verification flow to receive and reuse your Proof of Student.
          </p>
        </div>
      </section>
    </main>
  );
}
