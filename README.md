# UW Blueprint Reimbursement System

A web application for UW Blueprint club members to submit reimbursement requests. Receipts are automatically validated using AI, a university reimbursement form is generated as a PDF, and everything is emailed to the VP Finance for review.

## Features

- **Student submission form** — personal info, expense details, and receipt upload
- **AI receipt validation** — uses Claude Vision (Haiku) to OCR receipt totals and flag discrepancies
- **PDF form generation** — auto-fills the university reimbursement form with submission data
- **Email delivery** — sends VP Finance the filled PDF + original receipts; sends student a confirmation
- **VP Finance dashboard** — review submissions, approve, and forward to the university

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- An [Anthropic API key](https://console.anthropic.com/) for receipt OCR
- A Gmail account (or any SMTP server) for sending emails

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Path to the SQLite database — keep as-is for local use |
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |
| `SMTP_HOST` | SMTP server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (usually `587`) |
| `SMTP_USER` | Your email address |
| `SMTP_PASS` | Your email password or app password |
| `EMAIL_FROM` | Display name + address for outgoing emails |
| `VP_FINANCE_EMAIL` | Email address of the VP Finance |
| `NEXT_PUBLIC_APP_URL` | The URL where the app is running (e.g. `http://localhost:3000`) |

> **Gmail users:** You need to create an [App Password](https://myaccount.google.com/apppasswords) — your normal password won't work with SMTP. Use that app password as `SMTP_PASS`.

### 3. Set up the database

```bash
npx prisma migrate dev --name init
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

- **Student form:** `http://localhost:3000`
- **VP Finance dashboard:** `http://localhost:3000/dashboard`

## How it works

1. A student fills out the form and uploads their receipts.
2. The receipts are scanned by Claude Vision to extract the total amount.
3. If the receipt total is **less than** the claimed amount **and** the currency is **CAD**, the submission is flagged for manual review.
4. A university reimbursement form PDF is generated with all the submission details.
5. An email is sent to the VP Finance with the PDF and receipts attached.
6. The student receives a confirmation email.
7. The VP Finance reviews the submission in the dashboard, approves it, and forwards it to the university.

## Receipt validation logic

| Situation | Result |
|---|---|
| Receipt total ≥ claimed amount | ✓ Passed |
| Receipt total < claimed amount, currency is CAD | ⚠ Flagged (definite shortfall) |
| Receipt total < claimed amount, foreign currency | ✓ Passed (possible FX conversion) |
| Receipt unreadable / no total found | ⚠ Flagged (manual review needed) |

## API costs

Receipt OCR uses `claude-haiku-4-5`, which is one of the cheapest models available (~$1/million input tokens). You can monitor usage and costs at [console.anthropic.com](https://console.anthropic.com) → **Usage** tab.

## Security

- `.env.local` is gitignored — your API keys and passwords are never committed
- Uploaded receipt files are stored in `uploads/` (also gitignored)
- The database file (`prisma/dev.db`) is gitignored
