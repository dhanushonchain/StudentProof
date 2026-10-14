"use client";

import { useEffect } from "react";

const CREAM = "#E1E0CC";

// Landing page for the developer sign-in popup (see BusinessLoginButton).
// Tells the opener the sign-in finished, then closes. Opened as a normal tab
// (no opener), it sends the user back to /sdk instead.
export default function LoginPopupDonePage() {
  useEffect(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "sp-business-login" }, window.location.origin);
      window.close();
    } else {
      window.location.replace("/sdk");
    }
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-16">
      <p className="text-sm" style={{ color: CREAM }}>
        Sign-in complete. You can close this window.
      </p>
    </main>
  );
}
