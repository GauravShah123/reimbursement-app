# Blueprint Reimbursements — public preview

A public, browser-only preview of the Blueprint reimbursement app. It lets anyone
click through the real experience — add a receipt, have it read, confirm details,
sign, and get the merged claim PDF — without touching the real product.

**Everything here is sample data.** The real product is a separate, private
deployment protected by Google OAuth (restricted to the organization's Google
Workspace domain).

## What is real and what is simulated

| Piece | In this preview |
|-------|-----------------|
| Receipt scanning | **Real.** Images are OCR'd with `tesseract.js` and PDFs parsed with `pdf.js`, in the visitor's browser — the same code path the real product uses. |
| Amount / date extraction | **Real.** Same heuristics (`src/lib/receipt-analyze.ts`). |
| Claim PDF | **Real**, built in the browser with `pdf-lib` (form + receipts merged), with a "sample" watermark. |
| Sign-in | Simulated. One click enters as a made-up sample member; there is no Google OAuth here. |
| Member roster | Simulated. Fixed sample member; no Google Sheets. |
| Exchange rates | Simulated. Fixed sample rates. |
| Storage / history | Simulated. Kept in the tab's memory and reset on reload; no database, no file storage. |
| Email to finance | Simulated. Nothing is ever sent. |

## Why this is safe to leave public

The deployment is **static files only**. There are no serverless functions, no
database, no file storage, no email, and no environment variables or credentials.

- **Nothing to bill per request.** Scanning and PDF generation run on the
  visitor's own device, so heavy use costs the visitor's CPU, not the host's.
  The only hosting cost is static bandwidth.
- **Nothing to rate-limit.** There is no endpoint that does work, so there is
  nothing an attacker can hammer. `/api/*` does not exist (it returns 404).
- **Nothing to steal.** No secrets are in the bundle or the repo, and visitor
  input never leaves the browser. Uploaded receipts are held as local `blob:` URLs.
- **Hardening headers** (`vercel.json`): a Content-Security-Policy that only
  allows this origin plus the OCR engine's CDN (`cdn.jsdelivr.net`) and Google
  Fonts, and blocks framing, plugins and form posts.
- In-browser limits (3 receipts per claim, 10 MB each, 12 stored claims) only
  bound one tab's memory.

Keep it that way: do not add an `api/` directory, environment variables, or a
storage/database integration to this project. `.gitignore` blocks `.env*` and
`secrets/`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build
npm run preview    # http://localhost:4173, with the production security headers
```

## Deploy (Vercel)

Import the repo; the Vite preset is auto-detected. **Set no environment
variables and attach no storage.** For extra peace of mind, deploy it under a
Hobby account or set a spend limit on the team.
