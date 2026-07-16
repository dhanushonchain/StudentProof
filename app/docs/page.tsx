"use client";

import { useState } from "react";
import Link from "next/link";

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("what");
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);

  const menuItems = [
    {
      id: "what",
      title: "What is StudentProof",
    },
    {
      id: "problems",
      title: "What StudentProof Solves",
    },
    {
      id: "architecture",
      title: "Architecture",
    },
    {
      id: "team",
      title: "Team",
    },
    {
      id: "faq",
      title: "FAQ",
    },
  ];

  return (
    <main className="min-h-screen bg-[#09090B] text-white flex">

      {/* ================= Sidebar ================= */}

      <aside className="w-72 border-r border-white/10 px-8 py-12 sticky top-0 h-screen">

        <Link href="/">
          <h1 className="text-4xl font-bold mb-12 tracking-tight cursor-pointer transition-transform hover:scale-105">
            <span className="text-white">Student</span>
            <span className="bg-gradient-to-r from-cyan-400 to-orange-400 bg-clip-text text-transparent">
              Proof
            </span>
          </h1>
        </Link>

        <p className="uppercase text-xs tracking-[0.25em] text-white/40 mb-6">
          Documentation
        </p>

        <div className="space-y-2">

          {menuItems.map((item) => (

            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-300

                ${
                  activeSection === item.id
                    ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }

              `}
            >
              {item.title}
            </button>

          ))}

        </div>

      </aside>

      {/* ================= Content ================= */}

      <section className="flex-1 max-w-5xl mx-auto px-16 py-16">
      {activeSection === "what" && (
        <>
          <p className="uppercase tracking-[0.25em] text-cyan-400 text-sm mb-4">
            Documentation
          </p>

          <h1 className="text-6xl font-bold mb-8">
            StudentProof Documentation
          </h1>

          <p className="text-xl leading-10 text-white/70 mb-20">
            StudentProof is a reusable student verification platform that
            enables educational institutions to issue blockchain-backed
            student credentials. Students verify once and securely reuse
            their student credential across websites, hackathons,
            scholarships, internships, developer platforms, and student
            discount services without repeatedly uploading their student ID.
          </p>

          <div className="space-y-10">

            <div className="rounded-2xl border border-white/10 bg-white/5 p-8">

              <h2 className="text-4xl font-bold mb-6">
                What is StudentProof?
              </h2>

              <p className="text-white/70 leading-9 text-lg">
                StudentProof is a blockchain-based reusable student
                verification platform.

                Instead of uploading a student ID card every time a website
                asks for proof, students verify themselves once through
                StudentProof.

                Once verified, they receive a wallet-bound student
                credential that can be reused across multiple applications.
              </p>

            </div>

            <div className="grid md:grid-cols-2 gap-6">

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-6">

                <h3 className="text-2xl font-semibold mb-4">
                  Verify Once
                </h3>

                <p className="text-white/70">
                  Students complete verification only one time.
                  Their credential becomes reusable across platforms.
                </p>

              </div>

              <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-6">

                <h3 className="text-2xl font-semibold mb-4">
                  Reuse Anywhere
                </h3>

                <p className="text-white/70">
                  Any application integrating StudentProof can instantly
                  verify student status using the SDK.
                </p>

              </div>

            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-orange-500/10 p-8">

              <h3 className="text-2xl font-semibold mb-5">
                Core Idea
              </h3>

              <p className="text-white/70 leading-9">
                StudentProof separates student verification from student
                verification reuse.

                Educational institutions verify students only once.

                After credential issuance, organizations can independently
                verify student status without needing access to the student's
                personal documents or relying on StudentProof as a trusted
                intermediary.
              </p>

            </div>

          </div>
        </>
        )}
      {activeSection === "problems" && (
        <>
          <p className="uppercase tracking-[0.25em] text-cyan-400 text-sm mb-4">
            Documentation
          </p>

          <h1 className="text-6xl font-bold mb-8">
            What StudentProof Solves
          </h1>

          <p className="text-xl leading-10 text-white/70 mb-20">
            Student verification today is fragmented. Every organization asks
            students to upload the same ID card repeatedly, creating friction,
            privacy concerns, and unnecessary verification work. StudentProof
            provides a reusable verification layer that benefits students,
            educational institutions, and third-party applications.
          </p>

          <div className="grid lg:grid-cols-2 gap-8">

            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 hover:border-cyan-500/40 transition-all">

              <div className="text-5xl mb-5">📄</div>

              <h2 className="text-2xl font-semibold mb-4">
                Repeated Student ID Uploads
              </h2>

              <p className="text-white/70 leading-8">
                Students repeatedly upload the same ID card to hackathons,
                scholarships, internships, discount platforms and university
                services.
              </p>

            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 hover:border-cyan-500/40 transition-all">

              <div className="text-5xl mb-5">🔒</div>

              <h2 className="text-2xl font-semibold mb-4">
                Privacy Risks
              </h2>

              <p className="text-white/70 leading-8">
                Organizations often collect names, photos and other personal
                information even though they only need to know whether someone
                is a verified student.
              </p>

            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 hover:border-orange-500/40 transition-all">

              <div className="text-5xl mb-5">🏫</div>

              <h2 className="text-2xl font-semibold mb-4">
                No University Infrastructure
              </h2>

              <p className="text-white/70 leading-8">
                Many colleges do not provide student email addresses or
                verification APIs. StudentProof enables verification without
                requiring universities to maintain dedicated infrastructure.
              </p>

            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 hover:border-orange-500/40 transition-all">

              <div className="text-5xl mb-5">⚡</div>

              <h2 className="text-2xl font-semibold mb-4">
                Reusable Verification
              </h2>

              <p className="text-white/70 leading-8">
                Once verified, students receive a reusable blockchain-backed
                credential that any integrated application can verify instantly
                using the StudentProof SDK.
              </p>

            </div>

          </div>

          <div className="mt-16 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-orange-500/10 p-8">

            <h2 className="text-3xl font-bold mb-6">
              Why StudentProof?
            </h2>

            <div className="grid md:grid-cols-3 gap-6">

              <div>
                <h3 className="text-xl font-semibold mb-3 text-cyan-400">
                  Students
                </h3>

                <p className="text-white/70">
                  Verify once and reuse your credential anywhere.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-cyan-400">
                  Universities
                </h3>

                <p className="text-white/70">
                  No need to build or maintain verification servers.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-cyan-400">
                  Developers
                </h3>

                <p className="text-white/70">
                  Integrate one SDK and instantly verify student status.
                </p>
              </div>

            </div>

          </div>
        </>
        )}
      {activeSection === "architecture" && (
        <>
          <p className="uppercase tracking-[0.25em] text-cyan-400 text-sm mb-4">
            Documentation
          </p>

          <h1 className="text-6xl font-bold mb-8">
            StudentProof Architecture
          </h1>

          <p className="text-xl leading-10 text-white/70 mb-20">
            StudentProof separates verification from verification reuse.
            Students verify only once, receive a reusable blockchain-backed
            credential, and later prove their student status without exposing
            personal information again.
          </p>

          {/* Flow */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 mb-20">

            <div className="flex flex-col items-center space-y-5">

              <div className="w-80 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-5 text-center">
                <h3 className="text-xl font-semibold">👨‍🎓 Student</h3>
                <p className="text-white/60 mt-2">
                  Creates a StudentProof account.
                </p>
              </div>

              <div className="text-3xl text-cyan-400">↓</div>

              <div className="w-80 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-5 text-center">
                <h3 className="text-xl font-semibold">🔐 Google Login</h3>
                <p className="text-white/60 mt-2">
                  Student signs in using a personal Gmail account.
                </p>
              </div>

              <div className="text-3xl text-cyan-400">↓</div>

              <div className="w-80 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-5 text-center">
                <h3 className="text-xl font-semibold">👛 Auto Wallet</h3>
                <p className="text-white/60 mt-2">
                  An account abstraction wallet is created automatically.
                </p>
              </div>

              <div className="text-3xl text-cyan-400">↓</div>

              <div className="w-80 rounded-xl border border-orange-500/30 bg-orange-500/10 p-5 text-center">
                <h3 className="text-xl font-semibold">🪪 Student ID Upload</h3>
                <p className="text-white/60 mt-2">
                  Student uploads their college ID.
                </p>
              </div>

              <div className="text-3xl text-orange-400">↓</div>

              <div className="w-80 rounded-xl border border-orange-500/30 bg-orange-500/10 p-5 text-center">
                <h3 className="text-xl font-semibold">
                  🤖 OCR Verification
                </h3>

                <p className="text-white/60 mt-2">
                  EasyOCR extracts student information and verifies it
                  against the seeded university database.
                </p>
              </div>

              <div className="text-3xl text-orange-400">↓</div>

              <div className="w-80 rounded-xl border border-green-500/30 bg-green-500/10 p-5 text-center">
                <h3 className="text-xl font-semibold">
                  🎓 Credential Issued
                </h3>

                <p className="text-white/60 mt-2">
                  A reusable blockchain credential is issued to the student's
                  wallet.
                </p>
              </div>

              <div className="text-3xl text-green-400">↓</div>

              <div className="w-80 rounded-xl border border-green-500/30 bg-green-500/10 p-5 text-center">
                <h3 className="text-xl font-semibold">
                  🌍 Third-Party Applications
                </h3>

                <p className="text-white/60 mt-2">
                  Applications verify student status using the StudentProof
                  SDK without requesting the original ID card.
                </p>
              </div>

            </div>

          </div>

          {/* Components */}

          <h2 className="text-4xl font-bold mb-10">
            Core Components
          </h2>

          <div className="grid md:grid-cols-2 gap-8">

            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-2xl font-semibold mb-4">
                Google Authentication
              </h3>

              <p className="text-white/70 leading-8">
                Students authenticate using their personal Gmail account,
                eliminating the need for university-issued email addresses.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-2xl font-semibold mb-4">
                Account Abstraction Wallet
              </h3>

              <p className="text-white/70 leading-8">
                Wallets are created automatically, allowing students to use
                blockchain without managing private keys.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-2xl font-semibold mb-4">
                OCR Verification Engine
              </h3>

              <p className="text-white/70 leading-8">
                Student IDs are processed using OCR and validated against
                seeded institutional records.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-2xl font-semibold mb-4">
                Blockchain Credential
              </h3>

              <p className="text-white/70 leading-8">
                Verified students receive a non-transferable credential that
                expires automatically after their education period ends.
              </p>
            </div>

          </div>

        </>
        )}
      {activeSection === "team" && (
        <>
          <p className="uppercase tracking-[0.25em] text-cyan-400 text-sm mb-4">
            Documentation
          </p>

          <h1 className="text-6xl font-bold mb-8">
            Meet the Team
          </h1>

          <p className="text-xl leading-10 text-white/70 mb-20">
            StudentProof is currently being designed and developed as an
            academic project with the vision of making student verification
            reusable, privacy-preserving and accessible worldwide.
          </p>

          {/* Founder Card */}

          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-white/5 to-orange-500/10 p-10 mb-16">

            <div className="flex flex-col md:flex-row gap-10 items-center">

              <div className="w-36 h-36 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 flex items-center justify-center text-5xl font-bold">
                DY
              </div>

              <div>

                <h2 className="text-4xl font-bold mb-3">
                  Dhanush Yangola
                </h2>

                <p className="text-cyan-400 text-xl mb-6">
                  Founder & Full Stack Blockchain Developer
                </p>

                <p className="text-white/70 leading-9 max-w-3xl">
                  Dhanush is building StudentProof with the goal of
                  simplifying student verification for educational
                  institutions and developers. The platform focuses on
                  reusable credentials, blockchain interoperability,
                  privacy-first verification and developer-friendly APIs.
                </p>

              </div>

            </div>

          </div>

          {/* Vision */}

          <h2 className="text-4xl font-bold mb-8">
            Vision
          </h2>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 mb-16">

            <p className="text-white/70 leading-9 text-lg">
              StudentProof aims to become the reusable verification layer
              for students worldwide.

              Instead of repeatedly uploading student ID cards, students
              should verify once and securely prove their student status
              anywhere while keeping personal information private.
            </p>

          </div>

          {/* Mission */}

          <h2 className="text-4xl font-bold mb-8">
            Mission
          </h2>

          <div className="grid md:grid-cols-3 gap-6 mb-16">

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-6">

              <div className="text-4xl mb-4">
                🎓
              </div>

              <h3 className="text-2xl font-semibold mb-4">
                Students
              </h3>

              <p className="text-white/70">
                Verify once and reuse credentials anywhere.
              </p>

            </div>

            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-6">

              <div className="text-4xl mb-4">
                🏫
              </div>

              <h3 className="text-2xl font-semibold mb-4">
                Universities
              </h3>

              <p className="text-white/70">
                Issue trusted credentials without maintaining verification
                infrastructure.
              </p>

            </div>

            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-6">

              <div className="text-4xl mb-4">
                💻
              </div>

              <h3 className="text-2xl font-semibold mb-4">
                Developers
              </h3>

              <p className="text-white/70">
                Integrate a single SDK to instantly verify students.
              </p>

            </div>

          </div>

          {/* Tech Stack */}

          <h2 className="text-4xl font-bold mb-8">
            Technology Stack
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">

            {[
              "Next.js",
              "React",
              "Tailwind CSS",
              "TypeScript",
              "Python",
              "EasyOCR",
              "OpenCV",
              "Stellar",
              "Soroban",
              "PostgreSQL",
              "Google OAuth",
              "Node.js",
            ].map((tech) => (

              <div
                key={tech}
                className="rounded-xl border border-white/10 bg-white/5 py-5 text-center hover:border-cyan-500/30 transition-all"
              >
                {tech}
              </div>

            ))}

          </div>

        </>
        )}
      {activeSection === "faq" && (
        <>
          <p className="uppercase tracking-[0.25em] text-cyan-400 text-sm mb-4">
            Documentation
          </p>

          <h1 className="text-6xl font-bold mb-8">
            Frequently Asked Questions
          </h1>

          <p className="text-xl leading-10 text-white/70 mb-20">
            Everything you need to know about StudentProof, reusable student
            verification and blockchain-backed credentials.
          </p>

          {[
            {
              question: "What is StudentProof?",
              answer:
                "StudentProof is a reusable student verification platform. Students verify once and receive a blockchain-backed credential that can be reused across multiple websites and applications.",
            },
            {
              question: "Why not just use a university email?",
              answer:
                "Many colleges don't provide institutional email addresses or verification APIs. StudentProof works with a student's personal Gmail account, making verification accessible to every institution.",
            },
            {
              question: "Why use blockchain?",
              answer:
                "Blockchain creates tamper-resistant, wallet-bound credentials that can be independently verified by third parties without relying on StudentProof as a central authority after issuance.",
            },
            {
              question: "Does StudentProof store my student ID?",
              answer:
                "No. StudentProof minimizes exposure of personal information. Verification happens once, after which only the credential is reused.",
            },
            {
              question: "Can organizations verify students instantly?",
              answer:
                "Yes. Applications integrate the StudentProof SDK to instantly check whether a wallet belongs to a verified student without requesting another ID upload.",
            },
            {
              question: "Do credentials expire?",
              answer:
                "Yes. Student credentials have an expiry date based on the student's education period. Once expired, applications will no longer treat the credential as valid.",
            },
            {
              question: "Can any university use StudentProof?",
              answer:
                "Yes. Institutions only need to provide student records for verification. They do not need to maintain their own verification servers or issue student email accounts.",
            },
          ].map((faq, index) => (
            <div
              key={index}
              className="mb-5 rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <button
                onClick={() =>
                  setOpenFAQ(openFAQ === index ? null : index)
                }
                className="w-full flex items-center justify-between px-8 py-6 text-left hover:bg-white/5 transition-all"
              >
                <span className="text-xl font-semibold">
                  {faq.question}
                </span>

                <span className="text-3xl text-cyan-400">
                  {openFAQ === index ? "−" : "+"}
                </span>
              </button>

              {openFAQ === index && (
                <div className="px-8 pb-8 text-white/70 leading-8">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}

          <div className="mt-20 rounded-3xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-orange-500/10 p-10 text-center">

            <h2 className="text-3xl font-bold mb-4">
              Still have questions?
            </h2>

            <p className="text-white/70 max-w-2xl mx-auto leading-8 mb-8">
              StudentProof is currently under active development.
              If you'd like to contribute, collaborate, or learn more,
              we'd love to hear from you.
            </p>

            <button className="px-8 py-4 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 font-semibold hover:scale-105 transition-transform">
              Contact Team
            </button>

          </div>
        </>
        )}
      </section>
    </main>
  );
}