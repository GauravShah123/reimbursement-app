import type { ReactNode } from "react";
import type { SessionUser } from "../lib/types.js";

const STEP_INDEX: Record<string, number> = { receipts: 1, details: 2, review: 3, done: 3 };

export function Shell({
  step,
  user,
  onSignOut,
  onShowHistory,
  children,
}: {
  step: string;
  user?: SessionUser | null;
  onSignOut?: () => void;
  onShowHistory?: () => void;
  children: ReactNode;
}) {
  const n = STEP_INDEX[step] ?? 1;
  const pct = (Math.min(n, 3) / 3) * 100;
  return (
    <div className="app">
      <div className="col">
        <div className="head">
          <span className="mark">blueprint reimbursements</span>
          <div className="head-right">
            {onShowHistory && (
              <button className="head-link" onClick={onShowHistory}>My requests</button>
            )}
            <span className="stepn">{step === "done" ? "Done" : `Step ${n} of 3`}</span>
            {user && onSignOut && (
              <>
                <span className="head-sep" aria-hidden="true" />
                <button className="head-signout" onClick={onSignOut}>Sign out</button>
              </>
            )}
          </div>
        </div>
        <div className="prog"><i style={{ width: `${pct}%` }} /></div>
        <div className="step-enter" key={step}>{children}</div>
      </div>
    </div>
  );
}
