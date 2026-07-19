"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import LoginButton from "@/app/api/auth/LoginButton";
import { WordsPullUp } from "@/components/hero/Hero";

/* ---------------- LoginModal ---------------- */
export const LoginModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <AnimatePresence>
      <motion.div
        key="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-6"
        style={{ backdropFilter: "blur(1px)" }}
        onClick={onClose}
      >
        <motion.div
          key="modal-card"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-lg rounded-3xl bg-black p-10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Logo */}
          <div className="flex justify-center">
            <span
              className="font-medium tracking-[-0.07em] text-[2.8rem] leading-none"
              style={{ color: "#E1E0CC" }}
            >
              <WordsPullUp text="StudentProof" />
            </span>
          </div>

          {/* Heading */}
          <div className="mt-10 text-center">
            <h2 className="text-4xl font-bold" style={{ color: "#E1E0CC", lineHeight: 1.2 }}>
              Verify your Student Identity
            </h2>
            <p className="mt-4 text-sm" style={{ color: "#E1E0CC", lineHeight: 1.2 }}>
              Continue with your Google account to securely verify your student
              identity and receive your reusable Proof of Student.
            </p>
          </div>

          {/* Google Button */}
          <div className="mt-10">
            <LoginButton />
          </div>

          {/* Footer */}
          <p className="mt-10 text-center text-sm" style={{ color: "#E1E0CC", lineHeight: 1.2 }}>
            By continuing you agree to our{" "}
            <Link href="/terms" style={{ color: "#E1E0CC" }} className="underline hover:opacity-70">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" style={{ color: "#E1E0CC" }} className="underline hover:opacity-70">
              Privacy Policy
            </Link>
            .
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LoginModal;
