"use client";

import { useState } from "react";

const CREAM = "#E1E0CC";

export default function ApiKeyReveal({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="rounded-xl p-4 text-left" style={{ border: `1px solid ${CREAM}20`, background: "#09090B" }}>
        <code className="block break-all font-mono text-sm" style={{ color: CREAM }}>
          {apiKey}
        </code>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(apiKey);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="mt-3 w-full rounded-xl border py-2.5 text-sm font-medium transition hover:opacity-80"
        style={{ borderColor: `${CREAM}30`, color: CREAM }}
      >
        {copied ? "Copied" : "Copy API key"}
      </button>
    </div>
  );
}
