"use client";

import { motion } from "framer-motion";
import { TopAccessNav } from "@/components/nav-bar/nav-bar";
import { PlaceholderDocsContent } from "@/app/docs/page";

export default function PricingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <TopAccessNav currentPath="/pricing" />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative h-[86vh] w-full max-w-[92rem] overflow-hidden rounded-3xl bg-black"
      >
        <PlaceholderDocsContent
          page="/pricing"
          modal
          onClose={() => {
            window.location.href = "/";
          }}
        />
      </motion.div>
    </main>
  );
}
