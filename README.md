# Jotion (Local-first)

Jotion is now a fully local, single-user note app built with Next.js.

Cloud dependencies were removed:

- No Convex
- No Clerk auth
- No EdgeStore
- No external DB

## What changed

The app now asks you to configure a local folder at `/setup`.

After you grant a folder path, Jotion stores everything there:

- `jotion.sqlite` for document data
- `media/` for uploaded files (organized by year/month)

## Run locally

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:3000/setup` (first-time setup)
- `http://localhost:3000/documents`

## Local storage layout example

```text
C:\Users\you\JotionLocal
├─ jotion.sqlite
└─ media
   └─ 2026
      └─ 04
         └─ <uploaded-files>
```

## Tech stack

- Next.js
- better-sqlite3
- Tailwind CSS
- Zustand
