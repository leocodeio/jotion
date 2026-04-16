# Local-first data architecture (Convex removed)

This project no longer uses Convex, Clerk auth, or EdgeStore cloud storage.

Everything is now local:

1. On first run, open `/setup`.
2. Enter an **absolute folder path** (for example `C:\Users\you\JotionLocal`).
3. Jotion creates:
   - `jotion.sqlite` (local SQLite database)
   - `media/` (folder-based media storage, organized by `YYYY/MM`)

## Current backend flow

- Local config API: `app/api/local/config/route.ts`
- Local document API: `app/api/local/documents/route.ts`
- Local media API: `app/api/local/media/route.ts`
- SQLite access: `lib/local/db.ts`
- Document data operations: `lib/local/documents.ts`
- Media upload/read/delete: `lib/local/media.ts`

## Media storage behavior

- Cover images and editor uploads are saved under:
  - `<configured-folder>\media\<year>\<month>\...`
- URLs are served via:
  - `/api/local/media?path=...`

## Notes

- `.jotion-local.json` in project root stores the selected local folder.
- No external auth provider is required.
- No external database is required.
- No external object storage is required.
