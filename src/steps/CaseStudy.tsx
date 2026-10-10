// "How it's built" — a short case study of the production system behind this
// preview. Static content; reachable from the banner without entering the app.

const FLOW: { title: string; detail: string }[] = [
  {
    title: "Sign in",
    detail:
      "Google OAuth, restricted to the organization's Workspace domain. The API verifies the token with Google, then issues an HMAC-signed, HTTP-only session cookie.",
  },
  {
    title: "Scan",
    detail:
      "Receipts are read on the member's device: tesseract.js for photos, pdf.js for PDFs. A heuristic pass pulls out the total and date and scores how receipt-like the text is.",
  },
  {
    title: "Confirm",
    detail:
      "Name, student number and department are prefilled from the member roster (a Google Sheet read through a read-only service account).",
  },
  {
    title: "Submit",
    detail:
      "Files upload straight from the browser to blob storage using a short-lived, scoped token. A serverless function converts currencies, applies the finance rules, builds the claim PDF and merges the receipts into it.",
  },
  {
    title: "Deliver",
    detail:
      "Finance gets one email with the merged PDF; the member gets a confirmation. The claim, its lines and its status are stored so it can be reopened later.",
  },
];

const STACK: [string, string][] = [
  ["Frontend", "React, TypeScript, Vite"],
  ["API", "Vercel serverless functions"],
  ["Database", "Turso (libSQL)"],
  ["File storage", "Vercel Blob"],
  ["Auth", "Google OAuth + signed session cookie"],
  ["Roster", "Google Sheets API"],
  ["PDF", "pdf-lib"],
  ["Email", "SMTP via nodemailer"],
];

const DECISIONS: { title: string; detail: string }[] = [
  {
    title: "Scan on the device, not the server",
    detail:
      "OCR is the slowest step. Running it in the browser avoids function time limits and means an abandoned claim costs nothing.",
  },
  {
    title: "Upload only at submit",
    detail:
      "Files go directly to storage, past the 4.5 MB function body limit, and only once the member commits. Tokens are capped at 10 MB and image or PDF types.",
  },
  {
    title: "Write the record before doing the work",
    detail:
      "The claim is saved as \"processing\" before the PDF and email steps, so a failure halfway leaves a traceable record instead of a silent loss.",
  },
  {
    title: "Flags as data",
    detail:
      "A claim is flagged for finance when the claimant isn't on the roster, isn't in a lead role, the total is over $100 CAD, or a line is in another currency. Flags are stored on the claim rather than typed into an email.",
  },
  {
    title: "Currency resolved on the server",
    detail: "Conversion to CAD happens once, at submit, so the PDF total and the flag rules always agree.",
  },
  {
    title: "Built to fit in an inbox",
    detail:
      "Receipt photos are rotated, downscaled and re-encoded before merging, and the PDF is checked against the 25 MB email limit before anything is sent.",
  },
];

const PREVIEW: { label: string; live: boolean }[] = [
  { label: "Receipt scanning", live: true },
  { label: "Amount and date extraction", live: true },
  { label: "Claim PDF generation", live: true },
  { label: "Google sign-in", live: false },
  { label: "Member roster", live: false },
  { label: "Database and file storage", live: false },
  { label: "Email to finance", live: false },
];

export function CaseStudy({ onClose }: { onClose: () => void }) {
  return (
    <div className="app">
      <div className="col">
        <div className="head">
          <span className="mark">blueprint reimbursements</span>
          <div className="head-right">
            <button className="head-link" onClick={onClose}>← Back to the app</button>
          </div>
        </div>

        <section className="step-enter">
          <h1 className="title">How it's built</h1>
          <p className="sub">
            Blueprint members pay for things out of pocket and claim them back from the university.
            That used to mean filling in a form by hand, attaching receipts and emailing finance. This
            app turns it into three steps and gives finance one clean PDF.
          </p>

          <h2 className="dsec">How a claim moves</h2>
          {FLOW.map((s, i) => (
            <div className="lrow" key={s.title}>
              <div>
                <div className="lt">{i + 1}. {s.title}</div>
                <div className="ls">{s.detail}</div>
              </div>
            </div>
          ))}

          <h2 className="dsec">Stack</h2>
          <dl className="dgrid">
            {STACK.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>

          <h2 className="dsec">Design decisions</h2>
          {DECISIONS.map((d) => (
            <div className="lrow" key={d.title}>
              <div>
                <div className="lt">{d.title}</div>
                <div className="ls">{d.detail}</div>
              </div>
            </div>
          ))}

          <h2 className="dsec">What this preview runs</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            This public build is static: it has no server, credentials or stored data, so it is safe
            to leave open. The parts that run in the browser are the real code.
          </p>
          {PREVIEW.map((p) => (
            <div className="lrow" key={p.label}>
              <div className="lt">{p.label}</div>
              <span className={`badge badge--${p.live ? "submitted" : "draft"}`}>
                {p.live ? "Live" : "Simulated"}
              </span>
            </div>
          ))}

          <div className="act">
            <button className="btn" onClick={onClose}>Try the app</button>
          </div>
        </section>
      </div>
    </div>
  );
}
