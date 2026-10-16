"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { SdkModalContent } from "../sdk/sdk-content";
import { TopAccessNav, type AccessPath } from "@/components/nav-bar/nav-bar";


const CREAM = "#E1E0CC";
const BG = "#050608";
const DocsContent = ({ modal = false, onClose }: { modal?: boolean; onClose?: () => void }) => {
  const [activeSection, setActiveSection] = useState("what");
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);

  const menuItems = [
    { id: "what",         title: "What is StudentProof" },
    { id: "problems",     title: "What StudentProof Solves" },
    { id: "architecture", title: "Architecture" },
    { id: "team",         title: "Team" },
    { id: "faq",          title: "FAQ" },
  ];

  /* ---- shared text styles ---- */
  const label = {
    fontSize: "0.7rem",
    letterSpacing: "0.25em",
    textTransform: "uppercase" as const,
    color: `${CREAM}60`,
    marginBottom: "1.5rem",
  };

  const h1Style = {
    fontWeight: 600,
    fontSize: "clamp(2.8rem, 5vw, 5rem)",
    lineHeight: 0.9,
    letterSpacing: "-0.05em",
    color: CREAM,
    marginBottom: "2rem",
  };

  const lead = {
    fontSize: "1rem",
    lineHeight: 1.6,
    color: `${CREAM}90`,
    marginBottom: "4rem",
  };

  const h2Style = {
    fontWeight: 600,
    fontSize: "2rem",
    letterSpacing: "-0.04em",
    color: CREAM,
    marginBottom: "1.25rem",
  };

  const h3Style = {
    fontWeight: 600,
    fontSize: "1.15rem",
    letterSpacing: "-0.03em",
    color: CREAM,
    marginBottom: "0.6rem",
  };

  const body = {
    fontSize: "0.9rem",
    lineHeight: 1.7,
    color: `${CREAM}80`,
  };

  /* ---- card ---- */
  const card = "rounded-2xl p-4 sm:p-5 md:p-7";
  const cardStyle = {
    border: `1px solid ${CREAM}15`,
    background: `${CREAM}05`,
  };

  return (
    <div
      className={`relative flex flex-col md:flex-row ${modal ? "h-full overflow-hidden rounded-3xl" : "min-h-screen"}`}
      style={{ background: BG, color: CREAM }}
    >
      {modal && onClose && (
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-gray-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close documentation"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* ===================== Sidebar ===================== */}
      <aside
        className={`w-full shrink-0 flex flex-col px-6 py-6 sm:px-8 sm:py-8 md:w-64 md:py-10 overflow-y-auto border-b md:border-b-0 md:border-r ${modal ? "md:h-full" : "md:sticky md:top-0 md:h-screen"}`}
        style={{ borderColor: `${CREAM}12` }}
      >
        {/* Logo */}
        <Link href="/" className="inline-block mb-8 md:mb-12 group">
          <Image
            src="/StudentProof.svg"
            alt="StudentProof"
            width={311}
            height={65}
            priority
            className="h-auto w-40 transition-opacity group-hover:opacity-70"
          />
        </Link>

        <p style={{ ...label }}>Documentation</p>

        <nav className="flex gap-1 overflow-x-auto no-scrollbar md:block md:space-y-1 md:overflow-visible">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className="shrink-0 whitespace-nowrap text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 md:w-full md:whitespace-normal"
              style={{
                color: activeSection === item.id ? CREAM : `${CREAM}55`,
                background: activeSection === item.id ? `${CREAM}10` : "transparent",
                letterSpacing: "-0.01em",
              }}
            >
              {item.title}
            </button>
          ))}
        </nav>

        <div className="pt-10 text-xs md:mt-auto" style={{ color: `${CREAM}30` }}>
          StudentProof © 2025
        </div>
      </aside>

      {/* ===================== Content ===================== */}
      <section className={`flex-1 mx-auto px-4 py-8 sm:px-6 md:max-w-4xl md:px-12 md:py-14 overflow-y-auto ${modal ? "h-full md:pr-16" : ""}`}>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >

            {/* ============ WHAT ============ */}
            {activeSection === "what" && (
              <>
                <p style={label}>Documentation</p>
                <h1 style={h1Style}>StudentProof<br />Documentation</h1>
                <p style={lead}>
                  StudentProof is a reusable student verification platform that enables educational
                  institutions to issue blockchain-backed student credentials. Students verify once
                  and securely reuse their credential across websites, hackathons, scholarships,
                  internships, developer platforms, and student discount services.
                </p>

                <div className="space-y-5">
                  <div className={card} style={cardStyle}>
                    <h2 style={h2Style}>What is StudentProof?</h2>
                    <p style={body}>
                      StudentProof is a blockchain-based reusable student verification platform.
                      Instead of uploading a student ID card every time a website asks for proof,
                      students verify themselves once through StudentProof. Once verified, they
                      receive a wallet-bound student credential that can be reused across multiple
                      applications.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className={card} style={{ border: `1px solid ${CREAM}20`, background: `${CREAM}08` }}>
                      <h3 style={h3Style}>Verify Once</h3>
                      <p style={body}>
                        Students complete verification only one time. Their credential becomes
                        reusable across platforms.
                      </p>
                    </div>

                    <div className={card} style={{ border: `1px solid ${CREAM}20`, background: `${CREAM}08` }}>
                      <h3 style={h3Style}>Reuse Anywhere</h3>
                      <p style={body}>
                        Any application integrating StudentProof can instantly verify student status
                        using the SDK.
                      </p>
                    </div>
                  </div>

                  <div className={card} style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}06` }}>
                    <h3 style={h3Style}>Core Idea</h3>
                    <p style={body}>
                      StudentProof separates student verification from verification reuse.
                      Educational institutions verify students only once. After credential issuance,
                      organizations can independently verify student status without needing access
                      to the student&apos;s personal documents or relying on StudentProof as a trusted
                      intermediary.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* ============ PROBLEMS ============ */}
            {activeSection === "problems" && (
              <>
                <p style={label}>Documentation</p>
                <h1 style={h1Style}>What StudentProof<br />Solves</h1>
                <p style={lead}>
                  Student verification today is fragmented. Every organization asks students to
                  upload the same ID card repeatedly, creating friction, privacy concerns, and
                  unnecessary verification work. StudentProof provides a reusable verification
                  layer that benefits students, educational institutions, and third-party applications.
                </p>

                <div className="grid lg:grid-cols-2 gap-5 mb-10">
                  {[
                    { icon: "📄", title: "Repeated Uploads", desc: "Students repeatedly upload the same ID card to hackathons, scholarships, internships, discount platforms and university services." },
                    { icon: "🔒", title: "Privacy Risks", desc: "Organizations often collect names, photos and other personal information even though they only need to know whether someone is a verified student." },
                    { icon: "🏫", title: "No University Infrastructure", desc: "Many colleges do not provide student email addresses or verification APIs. StudentProof enables verification without requiring universities to maintain dedicated infrastructure." },
                    { icon: "⚡", title: "Reusable Verification", desc: "Once verified, students receive a reusable blockchain-backed credential that any integrated application can verify instantly using the StudentProof SDK." },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className={`${card} transition-all duration-200`}
                      style={{ ...cardStyle, cursor: "default" }}
                    >
                      <div className="text-4xl mb-4">{item.icon}</div>
                      <h3 style={h3Style}>{item.title}</h3>
                      <p style={body}>{item.desc}</p>
                    </div>
                  ))}
                </div>

                <div className={card} style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}06` }}>
                  <h2 style={{ ...h2Style, fontSize: "1.5rem" }}>Why StudentProof?</h2>
                  <div className="grid md:grid-cols-3 gap-6 mt-4">
                    {[
                      { title: "Students", desc: "Verify once and reuse your credential anywhere." },
                      { title: "Universities", desc: "No need to build or maintain verification servers." },
                      { title: "Developers", desc: "Integrate one SDK and instantly verify student status." },
                    ].map((item) => (
                      <div key={item.title}>
                        <h3 style={h3Style}>{item.title}</h3>
                        <p style={body}>{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ============ ARCHITECTURE ============ */}
            {activeSection === "architecture" && (
              <>
                <p style={label}>Documentation</p>
                <h1 style={h1Style}>Architecture</h1>
                <p style={lead}>
                  StudentProof separates verification from verification reuse. Students verify only
                  once, receive a reusable blockchain-backed credential, and later prove their student
                  status without exposing personal information again.
                </p>

                {/* System diagram */}
                <h2 style={h2Style}>System Diagram</h2>
                <div className={`${card} mb-12`} style={{ ...cardStyle, background: "#ffffff" }}>
                  <Image
                    src="/architecture.svg"
                    alt="StudentProof system architecture: users and integrators, the Next.js app, core logic, and external services with the PostgreSQL database"
                    width={1800}
                    height={1130}
                    unoptimized
                    className="h-auto w-full"
                  />
                </div>


                {/* Components */}
                <h2 style={h2Style}>Core Components</h2>
                <div className="grid md:grid-cols-2 gap-5">
                  {[
                    { title: "Google Authentication", desc: "Students authenticate using their personal Gmail account, eliminating the need for university-issued email addresses." },
                    { title: "Derived Wallet", desc: "A wallet is derived from your Google account, so students use blockchain without managing private keys." },
                    { title: "Reclaim zkTLS Verification", desc: "Enrollment is proven directly from the university portal using zero-knowledge proofs, without ever exposing login credentials or personal data to StudentProof." },
                    { title: "Blockchain Credential", desc: "Verified students receive a soulbound (non-transferable) credential that stays valid until explicitly revoked by the issuing authority." },
                  ].map((item) => (
                    <div key={item.title} className={card} style={cardStyle}>
                      <h3 style={h3Style}>{item.title}</h3>
                      <p style={body}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ============ TEAM ============ */}
            {activeSection === "team" && (
              <>
                <p style={label}>Documentation</p>
                <h1 style={h1Style}>Meet the Team</h1>

                {/* Founder */}
                <div className={`${card} mb-10`} style={cardStyle}>
                  <div className="flex flex-col md:flex-row gap-8 items-center">
                    <div>
                      <h2 style={{ ...h2Style, marginBottom: "0.25rem" }}>Dhanush Yangola</h2>
                      <p className="text-sm" style={{ color: `${CREAM}60` }}>Founder & Full Stack Blockchain Developer</p>
                    </div>
                  </div>
                </div>

                {/* Vision */}
                <h2 style={h2Style}>Vision</h2>
                <div className={`${card} mb-10`} style={cardStyle}>
                  <p style={body}>
                    StudentProof aims to become the reusable verification layer for students worldwide.
                    Instead of repeatedly uploading student ID cards, students should verify once and
                    securely prove their student status anywhere while keeping personal information private.
                  </p>
                </div>

                {/* Tech Stack */}
                <h2 style={h2Style}>Technology Stack</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(
                    [
                      ["Next.js", "#f38ba8"],
                      ["React", "#89dceb"],
                      ["Tailwind CSS", "#94e2d5"],
                      ["TypeScript", "#89b4fa"],
                      ["Reclaim Protocol", "#fab387"],
                      ["Solidity", "#cba6f7"],
                      ["Avalanche C-Chain", "#eba0ac"],
                      ["viem", "#f9e2af"],
                      ["PostgreSQL", "#74c7ec"],
                      ["Prisma", "#b4befe"],
                      ["Google OAuth", "#a6e3a1"],
                      ["Node.js", "#f5c2e7"],
                    ] as const
                  ).map(([tech, color]) => (
                    <div
                      key={tech}
                      className="rounded-xl py-4 text-center text-sm font-medium transition-all duration-200 hover:scale-[1.03]"
                      style={{ border: `1px solid ${color}80`, background: `${color}22`, color, letterSpacing: "-0.01em" }}
                    >
                      {tech}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ============ FAQ ============ */}
            {activeSection === "faq" && (
              <>
                <p style={label}>Documentation</p>
                <h1 style={h1Style}>Frequently Asked<br />Questions</h1>
                <p style={lead}>
                  Everything you need to know about StudentProof, reusable student verification and
                  blockchain-backed credentials.
                </p>

                <div className="space-y-3 mb-14">
                  {[
                    { question: "What is StudentProof?", answer: "StudentProof is a reusable student verification platform. Students verify once and receive a blockchain-backed credential that can be reused across multiple websites and applications." },
                    { question: "Why not just use a university email?", answer: "Many colleges don't provide institutional email addresses or verification APIs. StudentProof works with a student's personal Gmail account, making verification accessible to every institution." },
                    { question: "Why use blockchain?", answer: "Blockchain creates tamper-resistant, wallet-bound credentials that can be independently verified by third parties without relying on StudentProof as a central authority after issuance." },
                    { question: "Does StudentProof store my student ID?", answer: "No. StudentProof minimizes exposure of personal information. Verification happens once, after which only the credential is reused." },
                    { question: "Can organizations verify students instantly?", answer: "Yes. Applications integrate the StudentProof SDK to instantly check whether a wallet belongs to a verified student without requesting another ID upload." },
                    { question: "Do credentials expire?", answer: "No, not automatically. Credentials are soulbound and remain valid until explicitly revoked by the issuing authority — for example if a student's enrollment status changes." },
                    { question: "Can any university use StudentProof?", answer: "Yes. Institutions only need to provide student records for verification. They do not need to maintain their own verification servers or issue student email accounts." },
                  ].map((faq, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-xl"
                      style={{ border: `1px solid ${CREAM}12`, background: `${CREAM}04` }}
                    >
                      <button
                        onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                        className="w-full flex items-center justify-between px-7 py-5 text-left transition-all"
                        style={{ color: CREAM }}
                      >
                        <span className="font-medium text-base" style={{ letterSpacing: "-0.02em" }}>
                          {faq.question}
                        </span>
                        <span
                          className="text-2xl ml-6 shrink-0 transition-transform duration-200"
                          style={{ color: `${CREAM}50`, transform: openFAQ === index ? "rotate(45deg)" : "none" }}
                        >
                          ⌄
                        </span>
                      </button>

                      <AnimatePresence>
                        {openFAQ === index && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <div className="px-7 pb-6" style={body}>
                              {faq.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div
                  className="rounded-2xl p-6 text-center sm:p-8 md:p-10"
                  style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}06` }}
                >
                  <h2 style={{ ...h2Style, marginBottom: "0.75rem" }}>Still have questions?</h2>
                  <p className="mb-8 mx-auto max-w-md" style={body}>
                    StudentProof is under active development. If you&apos;d like to contribute, collaborate,
                    or learn more, we&apos;d love to hear from you.
                  </p>
                  <button
                    className="px-8 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-70"
                    style={{ background: CREAM, color: BG, letterSpacing: "-0.02em" }}
                  >
                    Contact Team
                  </button>
                </div>
              </>
            )}

          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
};

export const DocsModal = ({
  onClose,
  initialPath = "/docs",
}: {
  onClose: () => void;
  initialPath?: AccessPath;
}) => {
  const [activePath, setActivePath] = useState<AccessPath>(initialPath);

  return (
    <AnimatePresence>
      <motion.div
        key="docs-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-6 pb-4 pt-12"
        style={{ backdropFilter: "blur(1px)" }}
        onClick={onClose}
      >
        <TopAccessNav currentPath={activePath} onSelect={setActivePath} className="z-[60]" />
        <motion.div
          key="docs-modal-card"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 h-[86vh] w-full max-w-[92rem] overflow-hidden rounded-3xl bg-black"
          onClick={(e) => e.stopPropagation()}
        >
          {activePath === "/docs" ? (
            <DocsContent modal onClose={onClose} />
          ) : (
            <SdkModalContent onClose={onClose} />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default function DocsPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <TopAccessNav currentPath="/docs" />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative h-[86vh] w-full max-w-[92rem] overflow-hidden rounded-3xl bg-black"
      >
        <DocsContent modal onClose={() => { window.location.href = "/"; }} />
      </motion.div>
    </main>
  );
}
