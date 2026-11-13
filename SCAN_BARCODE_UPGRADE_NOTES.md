# KINGKONG MART - Scan Barcode performance update

## Changes included

- Camera area is collapsed by default and is mounted visibly only after pressing **Mở camera**.
- ZXing is restricted to common retail barcode formats and configured for 100 ms success/attempt intervals, with a 960x540 preferred camera stream to reduce per-frame decoding work.
- Scan results and quantity totals update optimistically as soon as a code is recognized; Supabase writes continue through an ordered queue so rapid scans are not blocked by each response.
- Repeated identical frames are debounced, while the same barcode can be recognized again after it leaves the camera view.
- Manual code input receives focus when an editable session is opened and regains focus after manual submission and camera start/stop. The input stays enabled while queued writes are running.
- Success/failure audio gain is raised from 0.15 to 0.45 (three times the previous Web Audio gain setting). Actual audible volume is still subject to device and browser volume controls.
- Quantity edits save automatically when the input loses focus. The row-level **Lưu** button is removed; **Xóa** remains.
- Scan success/error notices and module-switch notices appear centered in the page.
- Scan increment API no longer performs separate user/session lookups before the database RPC; the RPC performs the active-user and session-owner checks atomically.
- Scan history/detail validation reads and the dashboard alert/product batch reads are parallelized where the required scope is known.
- No database migration is added by this update.

## Apply

1. Back up the current project folder.
2. Extract this ZIP over a copy of the current project, preserving your local `.env` / `.env.local` files. They are intentionally not included.
3. Run `npm ci` if dependencies are not already installed.
4. Run `npm run build` before deploying.

## Verification note

All 55 TypeScript/TSX source files passed a TypeScript transpile/syntax check in the preparation environment. A full Next.js production build could not be run here because the dependency installation did not complete and the local `next` executable was unavailable. Camera timing and the 500 ms experience must still be measured on the actual iPhone/Android devices and network/Supabase environment; no browser-side code can guarantee every server request will finish under 500 ms.
