import { useState } from "react";
import { api } from "../lib/api.js";
import type { SessionUser } from "../lib/types.js";

// The real product signs members in with Google OAuth, restricted to the
// organization's Google Workspace domain. This public preview has no auth at
// all — the button just drops you in as a made-up sample member.
export function SignIn({ onSignedIn }: { onSignedIn: (u: SessionUser) => void }) {
  const [busy, setBusy] = useState(false);

  async function enter() {
    setBusy(true);
    const { data } = await api<{ user: SessionUser }>("/api/auth/demo", { method: "POST" });
    setBusy(false);
    onSignedIn(data.user);
  }

  return (
    <div className="app">
      <div className="col" style={{ paddingTop: 96 }}>
        <h1 className="signin-title">
          blueprint
          <br />
          reimbursements
        </h1>
        <p className="signin-lead">
          Thanks for taking on expenses for the Blueprint community. In the real product you sign in
          with your Blueprint Google account to submit a reimbursement — we read your receipts and
          email finance for you.
        </p>
        <button className="btn-google" onClick={enter} disabled={busy} aria-busy={busy}>
          {busy ? "Entering…" : "Continue as a sample member"}
        </button>
        <p className="support">
          No account needed. Receipts you add are read on your device and never uploaded, and
          nothing is sent to anyone.
        </p>
      </div>
    </div>
  );
}
