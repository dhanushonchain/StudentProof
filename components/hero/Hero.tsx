"use client";

import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { DocsModal } from "@/app/docs/page";
import { LoginModal } from "@/app/login/page";
import { ProfileMenu, type ProfileMenuUser } from "@/components/profile-menu/profile-menu";

/* ---------------- WordsPullUp ---------------- */
interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
  style?: React.CSSProperties;
}

export const WordsPullUp = ({ text, className = "", showAsterisk = false, style }: WordsPullUpProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const words = text.split(" ");

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        return (
          <motion.span
            key={i}
            initial={{ y: 20, opacity: 0 }}
            animate={isInView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="inline-block relative"
            style={{ marginRight: isLast ? 0 : "0.25em" }}
          >
            {word}
            {showAsterisk && isLast && (
              <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em]">*</span>
            )}
          </motion.span>
        );
      })}
    </div>
  );
};

/* ---------------- WordsPullUpMultiStyle ---------------- */
interface Segment {
  text: string;
  className?: string;
}

interface WordsPullUpMultiStyleProps {
  segments: Segment[];
  className?: string;
  style?: React.CSSProperties;
}

export const WordsPullUpMultiStyle = ({ segments, className = "", style }: WordsPullUpMultiStyleProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const words: { word: string; className?: string }[] = [];
  segments.forEach((seg) => {
    seg.text.split(" ").forEach((w) => {
      if (w) words.push({ word: w, className: seg.className });
    });
  });

  return (
    <div ref={ref} className={`inline-flex flex-wrap justify-center ${className}`} style={style}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={{ y: 20, opacity: 0 }}
          animate={isInView ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className={`inline-block ${w.className ?? ""}`}
          style={{ marginRight: "0.25em" }}
        >
          {w.word}
        </motion.span>
      ))}
    </div>
  );
};

/* ---------------- Hero ---------------- */
const navItems = [
  { label: "DOCS", href: "/docs" },
  { label: "SDK", href: "/sdk" },
  { label: "API", href: "/api" },
  { label: "GitHub", href: "https://github.com/dhanush-devx/StudentProof.git" },
];

const PrismaHero = ({ user = null }: { user?: ProfileMenuUser | null }) => {
  const [showLogin, setShowLogin] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [docsInitialPath, setDocsInitialPath] = useState<"/docs" | "/sdk" | "/api">("/docs");

  return (
    <>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {showDocs && <DocsModal initialPath={docsInitialPath} onClose={() => setShowDocs(false)} />}
      {user && <ProfileMenu user={user} />}

      <section className="h-screen w-full">
        <div className="relative h-full w-full overflow-hidden">
          
          {/* Background video */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src="/hero.mp4" type="video/mp4"/>
          </video>

          {/* Noise overlay */}
          <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />

          {/* Gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

          {/* Navbar */}
          {!showDocs ? (
            <nav className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
              <div className="flex items-center gap-3 rounded-b-2xl bg-black px-4 py-2 sm:gap-6 md:gap-12 md:rounded-b-3xl md:px-8 lg:gap-14">
                {navItems.map((item) => {
                  const isDocsSurface = item.href === "/docs" || item.href === "/sdk" || item.href === "/api";

                  if (isDocsSurface) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setDocsInitialPath(item.href as "/docs" | "/sdk" | "/api");
                          setShowDocs(true);
                        }}
                        className="text-[10px] transition-colors sm:text-xs md:text-sm"
                        style={{ color: "rgba(225, 224, 204, 0.8)" }}
                      >
                        {item.label}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="text-[10px] transition-colors sm:text-xs md:text-sm"
                      style={{ color: "rgba(225, 224, 204, 0.8)" }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>
          ) : null}

          {/* Hero content */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-10 sm:px-6 md:px-10">
            <div className="grid grid-cols-12 items-end gap-4">
              
              <div className="col-span-12 lg:col-span-8">
                <h1
                  className="leading-none"
                >
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="w-[88vw] max-w-[920px] sm:w-[78vw] lg:w-[50vw]"
                  >
                    <Image
                      src="/StudentProof.svg"
                      alt="StudentProof"
                      width={311}
                      height={65}
                      priority
                      className="h-auto w-full"
                    />
                  </motion.div>
                </h1>
              </div>

              <div className="col-span-12 flex flex-col gap-5 pb-2 lg:col-span-4 lg:-translate-x-12 lg:pb-4 xl:-translate-x-20">
                
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-xs text-[#E1E0CC] sm:text-sm md:text-base"
                  style={{ lineHeight: 1.2 }}
                >
                  Millions of students do not have university email addresses. StudentProof replaces email-based verification with reusable on-chain Proof of Student. Verify once using your student ID and securely prove your student status anywhere.
                </motion.p>

                <motion.button
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.7,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  onClick={() => setShowLogin(true)}
                  className="group inline-flex items-center gap-2 self-start rounded-full bg-[#F5F5F2] py-1 pl-5 pr-1 text-sm font-medium transition-all hover:gap-3 sm:text-base"
                >
                  Get Started
              
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black transition-transform group-hover:scale-110 sm:h-10 sm:w-10">
                    <ArrowRight className="h-4 w-4 text-[#E1E0CC]" />
                  </span>
                </motion.button>

              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default PrismaHero;
