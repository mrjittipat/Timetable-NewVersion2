# skill.md — Timetable AI (System Skeleton & Build Guide — User-Defined Constraints)

> **Template Notice:** เงื่อนไขพื้นฐาน (Basic constraints) และเงื่อนไขพิเศษ (Special constraints) เดิมถูกถอดออกแล้วเพื่อให้ผู้ใช้กำหนดเองในภายหลัง ส่วนที่คงไว้คือโครงสร้างระบบทั้งหมด (Backend, Solver engine, Validator framework, Frontend pages, Export, Auth, Chatbot, Docker) เมื่อคุณกำหนดเงื่อนไขแล้ว ให้เติมในจุดที่ทำเครื่องหมาย `[TODO]` ให้ครบก่อนสั่งสร้างระบบ

This one file is everything you need: the rules, the build order and the specification (Part F).
Every supporting file (tests, chatbot knowledge, fonts, images, Docker files) is described in Part D so you can create it yourself.

**How to use this template:** once you have filled in your own Basic and Special constraints (in §1.3 and the corresponding `[TODO]` sections in §2.4, §3, §4, §5, §6, §11, §12, Part D), put this file and your data (`CSV/` with 7 files, plus `DataIndex.pdf` if any) in a folder and instruct your AI coding assistant to start with Part A.1.

**Keep this file in view.** Your tool may not load it automatically. Read it in full before any work.
Whenever you start a new chat, your earlier messages get summarised, or you are unsure of a rule, read
Parts A–E again plus the SPEC sections (§) of the step you are on. Never work from memory of this file.

Contents: A Mission and workflow · B Rules · C Build steps 0–14 · D Supporting files you create ·
E Pitfalls already met · F SPEC (source of truth, §1–§13)

---

## Part A. Mission and autonomous workflow

Build a Thai web app that creates a weekly class timetable for วิทยาลัยเทคนิคพังงา (Phang Nga Technical
College): it imports 7 CSV/XLSX files, solves the timetable with a CSP search plus simulated annealing,
checks the result with an independent validator (using the user-defined constraints), lets an admin edit
the timetable by drag-and-drop, and exports `output.csv`, Excel and PDF in the official college form. It
also has login with roles, public read-only pages with QR codes, a dashboard with charts and an offline
Thai rule-based chatbot. Everything runs offline in one Docker container on port 3000.

### A.1 First 10 minutes
1. **Git first.** If the folder is not a git repository yet: `git init`, then commit the untouched
   inputs (`skill.md`, `DataIndex.pdf`, `CSV/`) as `Original skill.md and competition data`, so every
   later change to this file can be seen with `git diff` and undone.
2. **Read `DataIndex.pdf`** (if present). If your file-reading tool cannot render PDFs on this
   machine, extract text with `pdftotext -layout -enc UTF-8 DataIndex.pdf -` or Python (`pypdf` /
   `fitz`). Images in the PDF (sample output, sample forms) may be unreadable; say so.
3. **Inspect `CSV/`**: headers, BOMs, row counts, odd rows (missing columns, invalid ids, trailing spaces).
   Never edit `CSV/`; it is the read-only seed for "reset".
4. **Check tools**: `node -v` (≥ 20), `npm -v`, `git --version`, `docker --version` (and whether Docker
   Desktop is running), Python + PIL (optional, for the logo), internet access (for `npm install` and
   the font).
5. **Check constraints & data** against this file (SPEC §1 in Part F):
   - If §1.3 still contains `[TODO]` placeholders, **stop and ask the user to supply their Basic and Special constraints** before writing code (or adapt this file from `DataIndex.pdf` after user approval).
   - If constraints are already filled in and only data (names/ids/counts) differs, update the test examples in Part D.2 and Part C "Done when" checks, commit, and start Part C.
   - If rules or formats differ from what is written in SPEC, show a comparison table and wait for user approval before updating every affected section (§1, §2.2, §2.4, §3, §4, §5, §6, §8, §10.5, §11, §12, Part D.2, Part C).

### A.2 Working loop (repeat for every step in Part C)
1. Do the step completely: code, install, run.
2. Check every "Done when" item with **real command output** (or a real browser check for UI steps).
3. Fix until it passes. If a step fails twice for the same reason, stop and explain to the user
   instead of guessing.
4. Commit: `git add -A && git commit -m "Step N: <what>"` (English message).
5. Post a 2–4 line progress note (Thai) and go straight on to the next step.

Only stop to ask the user when you are truly blocked (no internet for packages/fonts, Docker not
installed, a rule contradicts SPEC in a way you cannot resolve, or `[TODO]` constraints have not been defined yet).

### A.3 Finish
At the end report in Thai: what was built, the evidence for every "Done when" (test counts, row counts,
file names), anything that differs from SPEC and why, and how to run it (`docker compose up -d --build`,
login `admin` / `admin1234`).

### A.4 Toggleable special constraints
The system supports switching each toggleable special constraint (`S1`, `S2`, `S3`) on/off from the Solve page (then click "เริ่มจัดตาราง") or via the chat command (e.g. `จัดตารางใหม่ เปิด S1 S2 ปิด S3`), and downloading `output.csv` from the Export page. By default, all three special constraints (`S1`, `S2`, `S3`) are **enabled**.

---

## Part B. Rules

When Parts A–E and Part F (SPEC) disagree, **SPEC wins**. When SPEC is silent, pick the simplest
option that matches the existing patterns and say what you chose.

### B.1 Stack (fixed: do not substitute)
- **Backend**: Node.js ≥ 20, Express 5, ES modules (`"type": "module"`), no TypeScript, no database.
  Dependencies: `express multer csv-parse csv-stringify exceljs pdfkit qrcode`. Nothing else.
  The solver is plain JavaScript. Never use OR-Tools, Python, or an external solver.
- **Frontend**: Angular (latest major, currently 22) with standalone components, signals, the new
  control flow (`@if`, `@for`, `@switch`), reactive forms, lazy routes, functional guards and an
  HTTP interceptor. SCSS. No UI library (no Material, no Tailwind, no Bootstrap), no chart library.
  Icons are inline Lucide SVG paths in one `Icon` component.
- **Storage**: CSV/JSON files under `backend/data` and `backend/output`, plus in-memory state.
- **Docker**: one multi-stage image; the Node server serves the Angular build and `/api`.

### B.2 Repository layout (must match)
```
CSV/                       competition data (read-only seed for "reset")
DataIndex.pdf  skill.md  NOTES.md (optional build notes, e.g. a font fallback)
backend/
  package.json             "type": "module"; scripts: start, dev, test
  src/server.js
  src/routes/api.js
  src/services/            paths schema csv config store context validator solver diagnose
                           solve-worker editor grid stats exporter auth
  src/services/chatbot/    nlu.js bot.js knowledge.js          (knowledge.js: you write it, Part D.3)
  test/                    validator.test.js chatbot.test.js run-solver.js   (you write them, Part D.2)
  fonts/                   Sarabun-Regular.ttf Sarabun-Bold.ttf  (+ OFL.txt)  (Part D.4)
  assets/logo.png          optional; the PDF has a no-logo layout            (Part D.4)
  data/.gitkeep  output/   data/ must exist in git; output/ created at runtime
frontend/                  Angular app (src/app/core, layout, pages/*, shared)
  public/                  favicon.svg favicon.ico logo.png (campus.jpg optional) (Part D.4)
  proxy.conf.json          /api -> http://localhost:3000                       (Part D.5)
Dockerfile docker-compose.yml .dockerignore .gitignore .gitattributes          (Part D.5)
```

### B.3 Non-negotiable rules
1. **Tests are the contract.** `backend/test/` has three scripts (Part D.2) that import exact module
   paths and export names (SPEC §12). Write them **before** the code they test (validator and solver
   tests in step 3, chatbot test in step 7), then never weaken them to make code pass.
   `cd backend && npm test` must end with every line `PASS` before the backend is done.
2. **Same seed, same timetable.** Use the exact RNG (mulberry32), constants, ordering and tie-breaks in
   SPEC §5. Do not add randomness elsewhere (no `Math.random()` inside the solver).
3. **`output.csv` has exactly** `group_id,timeslot_id,subject_id,teacher_id,room_id`. No BOM, no extra
   columns. (Unless the competition statement says otherwise — then follow it and note it.)
4. **All user-facing text is Thai** and must match the strings in SPEC where SPEC gives them.
   Code, comments, identifiers and commit messages are English.
5. **Never trust the solver.** Every timetable that is saved (solver or manual edit) is re-validated
   by `validator.js`, and the result is returned with the response.
6. **Offline at runtime.** No runtime calls to external services. (Google Fonts in `index.html` is the
   only network asset and the UI must still work without it.) Build-time downloads (npm, the Sarabun
   font) are fine.
7. Keep files small and focused like the layout above. One short comment that says *why*, above
   non-obvious code only.
8. Do not touch other projects, containers or images on the machine (see Part E.6).

### B.4 Theme (frontend)
Maroon (แดงเลือดหมู) and white. Tokens live in `src/styles.scss` `:root` (SPEC §10.1): primary
`#800020`, font `IBM Plex Sans Thai`. The web timetable is lightly themed; PDF/Excel are strictly
black-and-white official forms.

### B.5 Checks you will use
- Backend: `cd backend && npm test`. Server: start it, then request the endpoints (see Part E.1 for a
  safe way on Windows).
- Frontend: `cd frontend && npx ng build` must succeed with no errors.
- Browser: serve the built frontend from the backend (`FRONTEND_DIST`) and test it in a browser (your tool's built-in browser if it has one, otherwise a headless browser script or ask the user).
- Docker: `docker compose up -d --build`, then open http://localhost:3000.
- Default login after first start: `admin` / `admin1234` (must change password).

---

## Part C. Build steps (do them in order, without waiting between steps)

### Step 0 — Prepare the folder
- The repository already exists (A.1 step 1). Write `.gitignore`, `.gitattributes`,
  `backend/data/.gitkeep` (Part D.5).
- Get the fonts and create the images (Part D.4).
- Commit: `Step 0: repository setup, fonts and images`.

**Done when:** `git log` shows the Step 0 commit; `backend/fonts/Sarabun-Regular.ttf` and
`Sarabun-Bold.ttf` exist (or the fallback in D.4 is in place and noted).

### Step 1 — Backend foundation (SPEC §2)
Create `backend/package.json`, `src/services/paths.js`, `schema.js`, `csv.js`, `config.js`, `store.js`
and `src/server.js` (for now only `/api/health`, and serving the frontend dist if present; create
`src/routes/api.js` as an empty router). Run `npm install` (commit `package-lock.json`).

**Done when:**
- `cd backend && node -e "import('./src/services/store.js').then(s=>{s.init();console.log(Object.fromEntries(Object.entries(s.getData()).map(([k,v])=>[k,v.length])))})"`
  shows all 7 tables and none is 0.
- Server started on a spare port answers `GET /api/health` with `{"ok":true}`.

### Step 2 — Context + Validator (SPEC §3, §4)
Loop order and warning texts exactly as SPEC. Print the context warnings of the data.

**Done when:** context warnings list any data quirks and there is **no** unexpected `error`-level warning
(unless the input CSV data is really broken — then report it).

### Step 3 — Solver (SPEC §5) + the first two tests
Write `test/run-solver.js` and `test/validator.test.js` (Part D.2) first. Then `src/services/solver.js`
with every detail of §5 (mulberry32, buildBlocks, splitHours, Board, MRV DFS + restarts, simulated
annealing, toRows) and `src/services/solve-worker.js` (§5.7). Loop order, rng use and tie-breaks must
match SPEC so the same seed gives the same timetable.

**Done when:**
- `node test/run-solver.js --all` prints `PASS` for every configured constraint combination.
- `node test/validator.test.js` prints `PASS` for every user-defined constraint check.
- Solving twice with seed 42 gives byte-identical rows (show a hash of both), and another seed differs.

### Step 4 — Diagnose, Grid, Editor, Stats (SPEC §6, §7)
**Done when** (real output shown): `diagnose` with the current constraints gives `feasible = true`;
`bestSeed` with 5 seeds returns results sorted by soft cost; `buildGrid('group', 'G1', …)` merges
consecutive periods into spans.

### Step 5 — Auth + API (SPEC §9)
`src/services/auth.js` and every route of §9.2 except `/chat` and `/chat/action` (step 7). Exports call
`exporter.js` (stub `exportCsv` for real now; PDF/Excel/QR in step 6). Mount `guard` in `server.js`.
Test with a cookie-keeping HTTP client: login admin, `GET /api/data`, `POST /api/solve`,
`GET /api/timetable`, `POST /api/timetable/move`, `GET /api/timetable/grid?view=group&id=G1`.

**Done when:** solve via API gives `status: "success"` and `validation.passed: true`; no login → 401;
a viewer account → 403 on POST and on `/users`.

### Step 6 — Export (SPEC §8)
`exporter.js` complete: output.csv, PDF college form (logo, subject table ท. ป. น. ช., 4 signature
blocks), Excel of the same layout, QR PDF. Generate sample PDFs for a teacher and a group, render the
first page to PNG (Part E.5) and **look at it**.

**Done when:** each person's PDF is exactly 1 A4 landscape page, Thai renders correctly, the logo shows
(if present), long subject names are clipped with "…", a two-name advisor wraps to 2 lines inside the
box; `output.csv` header is exact; the Excel file has sheets per group, teacher, room and `output`.

### Step 7 — Chatbot (SPEC §11.1–11.3)
Write `chatbot/knowledge.js` (Part D.3) and `test/chatbot.test.js` (Part D.2), then `nlu.js`, `bot.js`,
and the routes `/chat` and `/chat/action`.

**Done when:** `cd backend && npm test` prints all **`PASS` lines and no `FAIL`** (the most important
backend checkpoint). Then exercise `/chat` and `/chat/action` on a live server once (solve via chat,
schedule question, export button).

### Step 8 — Frontend foundation (SPEC §10.1–10.4)
Create the Angular app (Part E.3 for the scaffold), `index.html`, `styles.scss` with tokens, core
(models, api, state, auth, toast, confirm, chat), shared (icon, avatar, confirm-dialog, toasts),
all routes (placeholder pages for now), Shell (sidebar, top bar, 2-item profile menu, banners,
chat widget) and the Login page (§10.5). Set `proxyConfig` in `angular.json`.

**Done when:** `npx ng build` has no errors; with the backend serving the build, the login page shows,
login works and the sidebar is maroon.

### Step 9 — Dashboard + Data (SPEC §10.5)
**Done when:** 5 KPI cards, 3 charts (each switchable to a table), the latest-result card; on Data,
dropping a CSV imports it, rows can be added/edited/deleted, and the confirm dialog appears top-centre.

### Step 10 — Solve page (SPEC §10.5)
Special constraints, basic constraints, saved seeds, parameters, document header, run row (best-seed
search beside the start card, same height), diagnosis, results.

**Done when:** "เริ่มจัดตาราง" gives results and Validator "ผ่านทุกข้อ"; "เริ่มค้นหา" gives the
ranked seeds; "วิเคราะห์สาเหตุ" gives the diagnosis card; both columns end on the same line (measure
the bottoms).

### Step 11 — Timetable page (SPEC §10.5–10.6)
View switch, "แสดงทั้งหมด", seed bar + save seed, drag-and-drop move/swap, detail panel (move, change
teacher/room), undo, share/QR, Excel, PDF preview.

**Done when:** dragging a span to another cell moves it and the validation badge updates at once;
undo restores exactly the previous rows; the PDF preview opens in-page with a print button.

### Step 12 — Report, Export, Settings, Users, Public (SPEC §10.5)
**Done when:** changing avatar and name updates the top bar immediately; password change works
(test on a temporary account, then delete it); a teacher account can be created and lands on its own
timetable; `/p` works without login.

### Step 13 — Chat widget (SPEC §11.4)
**Done when**, typed in the real widget: "ตาราง G1 วันจันทร์", "ห้องไหนว่าง วันพุธ คาบ 3",
"จัดตารางใหม่" (click confirm → it really solves and the card shows done),
"ส่งออก PDF ของ G1" (opens the preview) — all four answer correctly.

### Step 14 — Docker and final check (SPEC §13)
Write `Dockerfile`, `docker-compose.yml`, `.dockerignore` (Part D.5); first check Part E.6 for
conflicts; then `docker compose up -d --build`.

**Done when:** `npm test` prints all `PASS` (run once more on a clean `backend/data`), `/api/health` 200, and in
the container: login → solve → download `output.csv`, Excel and PDF all work; http://localhost:3000
works from login to export. Report every item with evidence.

### If you lose context mid-way
Read this file, run `git log --oneline` to see which step was committed last, run
`cd backend && npm test`, then continue from the next step.

---

## Part D. Supporting files you create

### D.1 Overview
| file(s) | when | how |
|---|---|---|
| `backend/test/*.js` | step 3 and step 7, before the code they test | D.2 |
| `backend/src/services/chatbot/knowledge.js` | step 7 | D.3 |
| `backend/fonts/*`, `backend/assets/logo.png`, `frontend/public/*` | step 0 | D.4 |
| `.gitignore`, `.gitattributes`, `proxy.conf.json`, Docker files | step 0 / 8 / 14 | D.5 |

### D.2 The three test scripts (`backend/test/`)
Plain Node scripts (no test framework). Each prints one line per check starting with `PASS` or `FAIL`,
and exits 1 if any failed. All start with `store.init(); const data = store.getData();`.
**Derive ids from the data where possible** so they also work with different datasets.

**`validator.test.js`.** `cfg = mergeConfig(DEFAULT_CONFIG)`, `ctx = buildContext(data, cfg)`,
`good = solve(data, cfg).rows`. Line 1: `validate(good)` passes. Then one deliberate mutation per
check (`I1..I4`, `B1..B6`, `S1..S3`) on a fresh copy must make the matching check fail (print its first violation):
- `I1`: corrupt `room_id` to an unknown room (`BAD_ROOM`) → `I1` fails.
- `I2`: drop one row from a group's course → `I2` fails.
- `I3`: move one row into an occupied group/teacher slot → `I3` fails.
- `I4`: assign a subject to a teacher not in `teach.csv` → `I4` fails.
- `B1`: move a row into Period 1 (`08:00-08:30` Homeroom) → `B1` fails.
- `B2`: move a row into Period 6 (`12:30-13:30` พักเที่ยง) → `B2` fails.
- `B3`: move a group's Thursday P2-P3 activity out of Thu P2-P3 (or replace ปวช.1 Thu P2-P3 with non-Scout) → `B3` fails.
- `B4`: assign `T01` (ครูวุฒิวงศ์) to a ปวช. or DB group → `B4` fails.
- `B5`: move `G04` or `G05` Thursday P2-P3 off `T01` or out of Thu P2-P3 → `B5` fails.
- `B6`: move `G02` or `G03` Thursday P2-P3 off `T02` or out of Thu P2-P3 → `B6` fails.
- `S1`: overload a `Leader` past 30 periods (or drop below 20) → `S1` fails.
- `S2`: overload a `Teacher` past 35 periods (or drop below 25) → `S2` fails.
- `S3`: move a group's block to create an empty usable slot between its first and last occupied slot on that day → `S3` fails.

**`run-solver.js`.** `base = loadConfig()`; runs: `all-on` (`S1,S2,S3` all true), `basic-only` (`S1,S2,S3` all false), `load-only` (`S1,S2` true, `S3` false), and `no-gap-only` (`S1,S2` false, `S3` true). For each, `mergeConfig({ ...base, constraints })`, solve, and PASS only if `status === 'success'` and `validate(...).passed`. Print rows, restarts, soft cost and seconds; on failure print the message/errors or the failed checks.

**`chatbot.test.js`.** `config = loadConfig()`, `ctx`, `solved = solve(data, config)`,
`env = { data, config, ctx, rows: solved.rows, meta: { stats: solved.stats, source: 'solver' },
validation: validate(...) }`. For each case call `reply(msg, {}, env)` and `extract(msg, ctx)`; PASS if
the intent matches and the optional entity check holds:

| message | intent | entity check |
|---|---|---|
| สวัสดีครับ | greeting | |
| ทำอะไรได้บ้าง | help | |
| ตาราง G01 วันจันทร์ | schedule | groups[0]=G01, days[0]=Mon |
| ครูวุฒิวงศ์สอนอะไรวันพุธ | schedule | teachers[0]=T01 |
| การออกแบบและจัดการฐานข้อมูล เรียนที่ไหน | subject | no teacher, subjects[0]=21901-1003 |
| ครูยุวดีสอนอะไร | schedule | teachers[0]=T07 |
| ครู T02 ว่างคาบไหนวันศุกร์ | free | teachers[0]=T02, days[0]=Fri |
| ห้องไหนว่าง วันพุธ คาบ 3 | free_resources | days[0]=Wed, periods[0]=3 |
| ครูคนไหนว่าง วันจันทร์ คาบ 4 | free_resources | |
| วันอังคาร คาบ 2 ใครเรียนอะไร | at_time | |
| ห้อง 631 ใช้ทำอะไรบ้าง | schedule | rooms[0]=631 |
| วิชา 31901-2004 เรียนที่ไหน | subject | |
| ผลตรวจเงื่อนไข | validation | |
| ทำไมข้อ S1 ไม่ผ่าน | validation | numbers includes `S1` |
| เงื่อนไขข้อ S1 คืออะไร | explain | numbers includes `S1` |
| ภาระสอนของครู | load | |
| T01 สอนกี่คาบ | load | |
| การใช้ห้อง | room_usage | |
| ข้อสังเกตจากข้อมูล | warnings | |
| สรุปภาพรวม | summary | |
| จัดตารางใหม่ เปิด S1 ปิด S3 | solve | on=['S1'], off=['S3'] |
| จัดตาราง seed 123 | solve | seed = 123 |
| สุ่ม seed ใหม่ | solve | randomSeed |
| ย้าย 21901-1003 ของ G01 ไปพุธ คาบ 2 | move | target = { day: Wed, period: 2 } |
| หาช่องว่างให้ 21901-1003 ของ G01 | find_slot | |
| บันทึก seed | save_seed | |
| ทำไมจัดตารางไม่ได้ | diagnose | |
| หา seed ที่ดีที่สุด 30 seed | best_seed | |
| ส่งออก PDF ของ G01 | export | |
| ไปหน้าส่งออก | navigate | |
| วิธีนำเข้าข้อมูล | howto | |
| อัลกอริทึมทำงานยังไง | algorithm | |
| ขอบคุณ | thanks | |
| กินข้าวยัง | unknown | |

Follow-up line: `first = reply('ตาราง G03', {}, env)`, then `reply('แล้ววันพุธล่ะ ว่างคาบไหน', first.context, env)`
must have intent `free` and `context.id === 'G03'`.

### D.3 `backend/src/services/chatbot/knowledge.js`
Static content only (no logic), four named exports:
- `CONSTRAINTS`: object keyed by `I1..I4`, `B1..B6`, `S1..S3`, each `{ name, detail, why, fix }` in Thai
  (name = short title, detail = the rule as in SPEC §1.3, why = common cause of a failure, fix = how to fix it).
- `PAGES`: `[{ path, title, keywords[] }]` for `/`, `/data`, `/solve`, `/timetable`, `/teacher-summary`, `/report`,
  `/export`, `/settings` (titles as the sidebar labels).
- `HOWTO`: `[{ keys[], title, page, steps[] }]` covering import data, solve, edit by hand, export,
  seeds, share/QR, accounts.
- `ALGORITHM`: array of Thai lines explaining CSP Search (MRV, backtracking, restarts), Simulated
  Annealing (soft cost), the independent validator, and seed determinism (`**bold**` allowed).

### D.4 Fonts and images
- **Sarabun font** (SIL OFL, free to bundle):
  `curl -sSL -o backend/fonts/Sarabun-Regular.ttf https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf`,
  same for `Sarabun-Bold.ttf`, and `OFL.txt`. Check with `file` that they are TrueType.
  **No internet:** ask the user for the files; as a last resort for local runs only, copy a Thai
  TrueType font from `C:\Windows\Fonts` (e.g. Tahoma `tahoma.ttf`/`tahomabd.ttf`) under the Sarabun file
  names and record it in `NOTES.md` (do not ship Windows fonts in a distributed image).
- **Logo** (`backend/assets/logo.png`, 512×512, also copied to `frontend/public/logo.png`): a simple
  generic emblem, never a copy of a real organization's logo — e.g. a maroon gear ring with a white
  calendar mark, drawn with Python PIL. Without Python, skip it: SPEC §8.1 has a no-logo PDF layout;
  the login page then shows a calendar icon tile.
- **Favicon**: hand-write `frontend/public/favicon.svg` (maroon rounded square + white calendar);
  `favicon.ico` from PIL if available, otherwise link only the SVG.
- **Login picture** (`campus.jpg`): not available — use a maroon gradient with light radial highlights
  and a faint grid pattern instead, and drop the photo credit line.

### D.5 Small config files
`backend/data/.gitkeep` (empty). `.gitignore`:
```
node_modules/
frontend/dist/
frontend/.angular/
backend/output/
backend/data/*
!backend/data/.gitkeep
.claude/
.env
*.log
.DS_Store
Thumbs.db
```
`.gitattributes`: `* text=auto eol=lf` plus `binary` for `*.png *.jpg *.ico *.ttf *.pdf`.

`frontend/proxy.conf.json`:
```json
{ "/api": { "target": "http://localhost:3000", "secure": false, "changeOrigin": false } }
```

`Dockerfile`:
```dockerfile
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

FROM node:24-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 TZ=Asia/Bangkok
RUN apk add --no-cache tzdata
WORKDIR /app
# Same layout as the repository so paths.js resolves ../CSV and ../frontend/dist.
COPY CSV/ ./CSV/
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/
COPY backend/src ./backend/src
COPY backend/fonts ./backend/fonts
COPY backend/assets ./backend/assets
COPY backend/data ./backend/data
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN mkdir -p backend/output && chown -R node:node /app/backend/data /app/backend/output
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "src/server.js"]
```
(If there is no logo, keep an empty `backend/assets/.gitkeep` so the COPY works.)

`docker-compose.yml`: service `timetable`, `build: .`, image `timetable-ai:latest`, container
`timetable-ai`, ports `3000:3000`, volumes `timetable-data:/app/backend/data` and
`timetable-output:/app/backend/output`, `restart: unless-stopped`, both volumes declared.

`.dockerignore`: `**/node_modules`, `frontend/dist`, `frontend/.angular`, `backend/output`,
`backend/data/*` with `!backend/data/.gitkeep`, `.git`, `.claude`, `*.log`, `*.md`, `DataIndex.pdf`.

---

## Part E. Pitfalls already met (avoid them)

### E.1 Windows and shells
- Git Bash rewrites arguments that start with `/` into Windows paths (`/api/health` →
  `C:/Program Files/Git/api/health`). Pass paths without the leading slash, or use PowerShell.
- Never kill every `node.exe` (it can kill the user's other work and may be blocked). To test a server,
  write a small Node script that `spawn`s `src/server.js` on a spare port (e.g. 3100), waits for the
  "listening" log line, runs `fetch` calls (keeping the `set-cookie` value), then kills only that child.
- Python's `-I` (isolated) flag hides user-installed packages such as PIL; run your own scripts without it.

### E.2 Backend
- `csv-parse` with `relax_column_count`: a short row (e.g. a subject row with no `credit`) parses with the
  missing field `undefined` → `normalizeRow` makes it `0`. Report such rows as data quirks.
- Solver: `options()` calls `rng()` inside `pickRoom` for every candidate — this is part of determinism;
  do not "optimise" it away. `unassign` must re-add the id at the **end** of the `unplaced` Set.
- In SA, if `options()` is ever empty, re-assign the old placement.
- `bestSeed`: generate the extra seeds with a seeded `mulberry32` (derived from the current seed), never
  `Math.random()`.
- NLU: remove all subject names from the text before matching teacher first names, and match a first
  name that also occurs inside any subject name only as `ครู<name>` (ครูพัฒนา vs การพัฒนา…).
- Move target (`ไปพุธ คาบ 1`) must be cut out of the text before extracting source days/periods.
- `/api/solve/best` and `/chat/action` reuse the same helpers as `/solve` (one `runSolve`, `runBest`,
  `addSeed`) so behaviour cannot drift.

### E.3 Angular 22
- Scaffold in a temporary folder and merge into `frontend/` without overwriting `public/` or
  `proxy.conf.json`: `npx -y @angular/cli@latest new frontend --style=scss --skip-tests --ssr=false --skip-git --routing --defaults --zoneless`,
  then copy everything except `node_modules` and `public/favicon.ico`, then `npm install` in `frontend/`.
- Raise the production budgets (initial ~800 kB warning / 1.5 MB error; component style 16/32 kB).
- `tsconfig` has `noPropertyAccessFromIndexSignature`: use `row['field']` for `Record` rows.
- A route with `redirectTo` cannot carry a query string or guards. For `/users` →
  `/settings?tab=users`, use a component-less route whose `canActivate` is `[adminGuard, () =>
  inject(Router).createUrlTree(['/settings'], { queryParams: { tab: 'users' } })]` with `children: []`.
- Call `inject()` before any `await` in guards and interceptors.
- SVG inside Angular templates: render each shape with `<svg:path [attr.d]>` etc.; `[innerHTML]` would
  strip SVG.
- The `Icon` host has an inline `display`; to size/centre an icon tile, use `align-items/justify-content`
  rather than `display: grid` on the host.
- Chat action cards: signals replace card objects on every update, so address a card by
  **message id + card index**, not by object reference (otherwise the card stays on "กำลังทำงาน…").
- A percentage width (bar inside a table cell) needs a parent with a fixed width.
- Do not show "no timetable" empty states while the first request is still loading
  (`@else if (state.timetable())`).
- Query params with `withComponentInputBinding()`: inputs `view`/`id` (use `alias` if the field names
  clash with computed signals).

### E.4 Browser testing
- Run `node src/server.js` in `backend` on port 3000 (it serves the built frontend), open
  http://localhost:3000 in whatever browser your tool can drive (a built-in browser, a browser
  extension, or a headless browser script such as Playwright run from a temporary folder), rebuild the
  frontend (`npx ng build`) and reload to see changes. If you cannot drive a browser at all, check the
  pages by fetching the API they call and ask the user to look at the UI, listing what to check.
- Screenshots right after navigation may be blank or show the loading state; take another one or read
  the DOM with a script. Simulate drag-and-drop with `DragEvent` + `DataTransfer` in a page script, and
  file drops the same way.
- Do not trigger the native print dialog; checking that the print button calls the same-origin iframe's
  `print()` is enough.
- Clean up test accounts and restore the admin profile after testing.

### E.5 PDF checking
`pdftoppm` may be missing. Render with PyMuPDF: `python -c "import fitz; d=fitz.open('G1.pdf');
print(d.page_count); d[0].get_pixmap(dpi=110).save('G1.png')"`, then open the PNG and check text fits,
Thai marks are attached, and the page count is 1 per entity (all groups + teachers + rooms for `view=all`).

### E.6 Docker on a shared machine
- Docker Desktop may not be running: start it, wait until `docker info` works.
- **Before** `docker compose up`, run `docker ps -a` and `docker images`: another project may already use
  the container name `timetable-ai`, port 3000, or the tag `timetable-ai:latest`. Building would steal
  that tag from the other project, and `up` fails on the name. Do not stop or remove anything that is
  not yours. If there is a conflict, build with a different tag and run a test container on another port
  (e.g. `docker build -t timetable-ai:rebuild . && docker run -d --name timetable-ai-rebuild -p 3001:3000
  timetable-ai:rebuild`), verify there, and tell the user how to switch when the other project is
  stopped. Keep the compose file as SPEC says.
- Run the final end-to-end check (health, SPA fallback, login, solve, CSV/Excel/PDF downloads with
  sizes and page counts) against the container, not the dev server.

---

## Part F. SPEC (source of truth)

Section numbers (§1–§13) are the ones referred to above. Files that SPEC names but does not define in
full (tests, `knowledge.js`, Docker files, fonts, images) are described in Part D.


The complete specification of a finished system. Rebuild it exactly. Thai strings in quotes are UI
text and must be used verbatim.

Contents: 1 Competition task · 2 Backend foundation · 3 Context · 4 Validator · 5 Solver ·
6 Diagnose & best seed · 7 Grid, editor, stats · 8 Export · 9 Auth & API · 10 Frontend ·
11 Chatbot · 12 Test contract · 13 Docker & run

---

## 1. Competition task

Thai national vocational AI skills competition (ปวส.). Build an AI timetable scheduler.

### 1.1 Input: 7 files in `CSV/` (derived from `ข้อมูลการสอน.xlsx` ภาคเรียนที่ 2/2569, also importable as CSV or XLSX)

| file | fields | notes |
|---|---|---|
| teacher.csv | teacher_id, teacher_name, role, department, special_role | role `Leader` (หัวหน้าสาขาวิชา: วุฒิวงศ์, กันตพิชญ์) or `Teacher` (รวมถึงลักษมี หัวหน้างานทะเบียน) |
| room.csv | room_id, room_name, room_type | 9 ห้องเรียน (631–639) |
| student_group.csv | group_id, group_name, student_count, advisor, department, level, year | 10 กลุ่มเรียน (IT & DB ปวช.1–3, ปวส.1–2); advisor may list two separated by `/` |
| subject.csv | subject_id, subject_name, theory, practice, credit, hours | periods per week = `hours > 0 ? min(theory + practice, hours) : theory + practice`; term 2 uses `20000-2002` (term 1 uses `20000-2001`) |
| teach.csv | teacher_id, subject_id | who may teach what |
| timeslot.csv | timeslot_id, day, period, start, end | 50 rows: Mon–Fri × periods 1–10; P1 `08:00–08:30` (Homeroom), P2–P5 `08:30–12:30` (1h each), P6 `12:30–13:30` (พักเที่ยง), P7–P10 `13:30–17:30` (1h each) |
| register.csv | group_id, subject_id | which group takes which subject |

Data quirks the code must handle: UTF-8 BOM on some files and headers; `student_count` like `14.0`;
trailing/leading spaces; invalid room ids (not matching `/^[A-Za-z0-9_-]+$/`); duplicate
teach rows; `student_groups.csv` accepted as an alias of `student_group.csv`; missing optional columns default safely.

### 1.2 Output

`output.csv` with exactly `group_id,timeslot_id,subject_id,teacher_id,room_id`. One row = one group in
one period with one subject, teacher and room. No BOM.

### 1.3 Constraints (User-Defined)

**Integrity checks (always on):**
- `I1`: ข้อมูลอ้างอิงครบถ้วนและถูกต้อง (ทุกแถวมี `group_id`, `timeslot_id`, `subject_id`, `teacher_id`, `room_id` ตรงกับข้อมูลตั้งต้น)
- `I2`: จำนวนคาบครบตามหลักสูตร (`min(ทฤษฎี + ปฏิบัติ, จำนวนชั่วโมงเรียน)` ต่อคู่กลุ่ม-วิชา)
- `I3`: ไม่มีกลุ่มเรียน ครู หรือห้องเรียน ซ้อนทับกันในคาบเดียวกัน (ยกเว้นคาบกิจกรรมเรียนร่วมวันพฤหัสบดี คาบ 2–3)
- `I4`: ครูผู้สอนมีสิทธิ์สอนรายวิชานั้นตาม `teach.csv`

**Basic constraints (always on):**
- `B1` (ข้อ 1): คาบที่ 1 เวลา `08:00–08:30` เป็นคาบ Homeroom ทั้งวิทยาลัย ห้ามจัดรายวิชาใด ๆ ลงในคาบที่ 1
- `B2` (ข้อ 5): คาบพักเที่ยง (คาบที่ 6 เวลา `12:30–13:30`) ห้ามจัดรายวิชาลงในคาบพักเที่ยง
- `B3` (ข้อ 2): วันพฤหัสบดี คาบ 2–3 เป็นรายวิชากิจกรรม และสำหรับนักเรียน ปวช. ปีที่ 1 เป็นคาบกิจกรรมลูกเสือวิสามัญ (`20000-2002` เทอม 2 / `20000-2001` เทอม 1)
- `B4` (ข้อ 7): ครูวุฒิวงศ์ เอียดศรีชาย (`T01`) สอนเฉพาะ ปวส.1 และ ปวส.2 สาขาวิชาเทคโนโลยีสารสนเทศเท่านั้น ห้ามสอน ปวช. หรือสาขาอื่น
- `B5` (ข้อ 8): ครูวุฒิวงศ์ เอียดศรีชาย (`T01`) เป็นครูที่ปรึกษา ปวส.1 และ ปวส.2 สาขาเทคโนโลยีสารสนเทศ ลงเรียนกิจกรรมพร้อมกันในวันพฤหัสบดี คาบ 2–3
- `B6` (ข้อ 9): ครูลิขิต ชมขวัญ (`T02`) เป็นครูที่ปรึกษา ปวช.2 และ ปวช.3 สาขาเทคโนโลยีสารสนเทศ ลงเรียนกิจกรรมพร้อมกันในวันพฤหัสบดี คาบ 2–3

**Special constraints (toggleable on/off, default all ON):**
- `S1` (ข้อ 3): ครูหัวหน้าแผนกวิชา (Leader) สอนอย่างต่ำ 20 คาบ และสูงสุดไม่เกิน 30 คาบต่อสัปดาห์ (นับตามเวลาจริง)
- `S2` (ข้อ 4): ครูธรรมดา (Teacher รวมหัวหน้างานทะเบียน) สอนอย่างต่ำ 25 คาบ และสูงสุดไม่เกิน 35 คาบต่อสัปดาห์ (นับตามเวลาจริง)
- `S3` (ข้อ 10): ตารางเรียนของนักเรียน/นักศึกษาห้ามมีช่องว่างคั่นระหว่างคาบเรียนในแต่ละวัน (ยกเว้น Homeroom และพักเที่ยง; ครูว่างได้)

**Additional system requirement:**
- **ข้อ 6**: มีหน้าแสดงข้อมูลสรุปการสอนของครูรายบุคคล แสดงจำนวน ทฤษฎี ปฏิบัติ หน่วยกิต คาบรวม ปวช. คาบรวม ปวส. และคาบรวมทั้งหมด (นับตามเวลาจริง)

---

## 2. Backend foundation

Node ESM. `backend/package.json`:
```json
{ "name": "timetable-backend", "type": "module",
  "scripts": { "test": "node test/validator.test.js && node test/chatbot.test.js && node test/run-solver.js --all",
               "start": "node src/server.js", "dev": "node --watch src/server.js" },
  "dependencies": { "csv-parse": "^7", "csv-stringify": "^6", "exceljs": "^4.4", "express": "^5",
                    "multer": "^2", "pdfkit": "^0.20", "qrcode": "^1.5" } }
```

### 2.1 `services/paths.js`
Exports: `BACKEND_DIR` (= `src/..`), `DATA_DIR` (`backend/data`), `OUTPUT_DIR` (`backend/output`),
`FONT_DIR` (`backend/fonts`), `ASSET_DIR` (`backend/assets`), `SEED_DIR` (`../CSV` from backend),
`FRONTEND_DIST` (`../frontend/dist/frontend/browser`).

### 2.2 `services/schema.js`
```js
export const ENTITIES = {
  teacher:       { file: 'teacher.csv',       aliases: ['teacher','teachers'],             fields: ['teacher_id','teacher_name','role','department','special_role'], key: ['teacher_id'], int: [] },
  room:          { file: 'room.csv',          aliases: ['room','rooms'],                   fields: ['room_id','room_name','room_type'],                     key: ['room_id'],                  int: [] },
  student_group: { file: 'student_group.csv', aliases: ['student_group','student_groups','group','groups'], fields: ['group_id','group_name','student_count','advisor','department','level','year'], key: ['group_id'], int: ['student_count','year'] },
  subject:       { file: 'subject.csv',       aliases: ['subject','subjects'],             fields: ['subject_id','subject_name','theory','practice','credit','hours'], key: ['subject_id'],     int: ['theory','practice','credit','hours'] },
  teach:         { file: 'teach.csv',         aliases: ['teach','teaches'],                fields: ['teacher_id','subject_id'],                             key: ['teacher_id','subject_id'],  int: [] },
  timeslot:      { file: 'timeslot.csv',      aliases: ['timeslot','timeslots'],           fields: ['timeslot_id','day','period','start','end'],            key: ['timeslot_id'],              int: ['period'] },
  register:      { file: 'register.csv',      aliases: ['register','registers','registration'], fields: ['group_id','subject_id'],                          key: ['group_id','subject_id'],    int: [] },
};
export const OUTPUT_FIELDS = ['group_id','timeslot_id','subject_id','teacher_id','room_id'];
```
- `entityFromFilename(name)`: lowercase, strip `.csv|.xlsx|.xls`, trim, match an alias, else `null`.
- `rowKey(entity, row)`: key field values joined with `|`.
- `normalizeRow(entity, raw)`: keep only `fields`; every value `String(v).trim()` (`''` for null);
  `int` fields → `Math.round(Number(v))`, or 0 if not finite.

### 2.3 `services/csv.js`
- `parseCsv(text)`: strip a leading BOM; csv-parse sync with `columns` = headers with BOM removed and
  trimmed, `skip_empty_lines`, `trim`, `relax_column_count`.
- `toCsv(rows, fields)`: csv-stringify with `header: true, columns: fields`.
- `parseXlsx(buffer)` → `{ sheetName: rows[] }`. First non-empty row is the header. Skip all-blank
  rows. Cell text: Date → `H:MM` from UTC hours/minutes (Excel stores 8:00 as a date); richText joined;
  `.text`; `.result`; otherwise `String(v)`.

### 2.4 `services/config.js`
```js
export const DEFAULT_CONFIG = {
  constraints: {
    S1: true,
    S2: true,
    S3: true,
  },
  params: {
    homeroomPeriod: 1,
    breakPeriod: 6,
    maxPerDay: 8,
    maxBlock: 4,
    latestPreferredPeriod: 9,
    leaderMinPeriods: 20,
    leaderMaxPeriods: 30,
    teacherMinPeriods: 25,
    teacherMaxPeriods: 35,
    timeLimitSec: 20,
    seed: 42,
  },
  document: { college: 'วิทยาลัยเทคนิคพังงา', semester: '2', year: '2569', curriculumHeadName: '', deputyName: '', directorName: '',
              publicEnabled: true, publicBaseUrl: '' },
};
```
- File `backend/data/config.json`. `loadConfig()` → merged file or a clone of defaults (also on parse error).
- `saveConfig(cfg)` writes `mergeConfig(cfg)` (2-space JSON) and returns it.
- `mergeConfig(cfg = {})` → `{ savedSeeds: array or [], document: {...defaults, ...cfg.document},
  constraints: {...defaults.constraints, ...cfg.constraints}, params: {...defaults.params, ...cfg.params} }`
  (also deep-merge any nested constraint parameter objects defined by the user by one level).
- Saved seed shape: `{ id, name, seed, constraints, params: { maxBlock, timeLimitSec, ...constraintParams }, softCost, savedAt }`.

### 2.5 `services/store.js` (in-memory data backed by files)
- State: `data` (entity → rows) and `timetable` (`{ rows, meta }` or null).
- `init()`: mkdir data/output; for each entity, copy the file from `SEED_DIR` if missing in `DATA_DIR`,
  then read it (`parseCsv` → `normalizeRow` → dedupe by `rowKey`, keeping the first). Load
  `output/output.csv` (+ `output/meta.json`) if present, normalising rows with `normalizeOutputRow`.
- `normalizeOutputRow(r)`: the 5 output fields as trimmed strings.
- `getData()`, `getEntity(e)`; `replaceEntity(e, rawRows)` (normalise + dedupe + persist);
  `addRow` (400 `ต้องระบุ <fields>` if a key field is empty; 409 `มีข้อมูลรหัส <key> อยู่แล้ว`);
  `updateRow(e, key, raw)` (merge, 404 `ไม่พบข้อมูลรหัส <key>`, 409 on a key collision);
  `deleteRow(e, key)`; every change rewrites the entity CSV.
- `resetData()`: copy all 7 files from `SEED_DIR` over `DATA_DIR`, then `init()`.
- `getTimetable()`; `setTimetable(rows, meta)`: normalise, sort by group_id then timeslot_id (both
  `localeCompare(..., undefined, { numeric: true })`), set `meta.updatedAt` (ISO), write
  `output.csv` (`toCsv` with `OUTPUT_FIELDS`) and `meta.json`.
- `httpError(status, message)` → Error with `.status`.

### 2.6 `server.js`
`store.init()`, `initAuth()`, Express app: `trust proxy`, `express.json({ limit: '5mb' })`,
`GET /api/health` → `{ ok: true }`, `app.use('/api', guard, api)`. If `FRONTEND_DIST` exists, serve it
statically and send `index.html` for any non-`/api` GET (SPA fallback). Error handler: status
`err.status || 500` (log 5xx), JSON `{ message: err.message || 'เกิดข้อผิดพลาด' }`. Port `PORT` or 3000.

---

## 3. Context (`services/context.js`)

`buildContext(data, config)` builds lookups shared by solver, validator, exporter and chatbot, and a
`warnings` list of `{ level: 'warn' | 'error', message }`. Iteration orders below matter for determinism.

- `days`: distinct `timeslot.day` in file order. `slotsById`: Map id → `{...row, id, dayIdx}` in file
  order. `periods`: distinct periods ascending.
- `daySlots[dayIdx]`: that day's usable slot ids sorted by period (filtering out `homeroomPeriod` = 1 and `breakPeriod` = 6).
- `teachers`, `groups`, `subjects`: Maps by id in file order. `rooms`: Map in file order, skipping ids
  not matching `/^[A-Za-z0-9_-]+$/` with warning `ห้อง "<id>" มีรหัสไม่ถูกต้อง จึงไม่นำมาใช้จัดตาราง`.
- `teachersBySubject`: Map subject → teacher ids in teach.csv order; skip unknown teachers with warning
  `teach.csv อ้างถึงครู <id> ที่ไม่มีใน teacher.csv`.
- `hours(subjectId)` = `s.hours > 0 ? Math.min(s.theory + s.practice, s.hours) : s.theory + s.practice` (0 if unknown).
- `registrations`: register rows deduped, in file order, skipping (level `error`):
  unknown group `register.csv อ้างถึงกลุ่ม <g> ที่ไม่มีใน student_group.csv`, unknown subject
  `register.csv อ้างถึงวิชา <s> ที่ไม่มีใน subject.csv`. Kept but flagged: no teacher (error)
  `วิชา <s> ที่กลุ่ม <g> ลงทะเบียน ไม่มีครูผู้สอนใน teach.csv`; 0 hours (warn) `วิชา <s> มีจำนวนคาบเป็น 0`.
  Groups with no registration (warn) `กลุ่ม <g> ไม่มีรายวิชาที่ลงทะเบียน`.
- `roomsFor(subjectId)`: returns candidate room ids in `rooms` order (all rooms).
- User-constraint helpers:
  - `groupMeta(groupId)` → `{ department, level, year, isYear1Pvc }` (reads fields or parses `group_name`).
  - `teacherBounds(teacherId)` → `{ min, max }` (`Leader` → 20–30; `Teacher` → 25–35).
  - `isActivity(subjectId)` (`20000-*` / `30000-*` / name starts with `กิจกรรม`), `isScout(subjectId)` (name contains `ลูกเสือ`).
  - `isWutthiwong(teacherId)` (T01 or name contains `วุฒิวงศ์`), `isLikhid(teacherId)` (T02 or name contains `ลิขิต`).
  - `thuActivitySlots`: `[Thu P2 id, Thu P3 id]`.
  - `jointCohorts`: concurrent Thu P2–P3 advisor/scout cohorts derived from advisor/level (`T01` -> `G04+G05`, `T02` -> `G02+G03`, `T03` -> `G01+G06` Scout). `isJointSlotAllowed(slotId, groups, teacherId)` returns true if rows belong to the same joint cohort.
- Returns `{ config, params, constraints, warnings, days, periods, daySlots, slotsById,
  teachers, groups, subjects, rooms, teachersBySubject, registrations, hours, roomsFor,
  groupMeta, teacherBounds, isActivity, isScout, isWutthiwong, isLikhid, thuActivitySlots, jointCohorts, isJointSlotAllowed }`.

---

## 4. Validator (`services/validator.js`)

`validate(rows, data, config, ctx = buildContext(data, config))` checks any timetable independently.

- **Checks structure (`checks[]`):**
  - **Integrity (`type: 'integrity'`):**
    - `I1` (1): ข้อมูลอ้างอิงครบถ้วนและถูกต้อง (ทุกแถวมีรหัสกลุ่ม, คาบ, วิชา, ครู, ห้อง ครบและมีอยู่ในข้อมูล)
    - `I2` (2): จำนวนคาบครบตามรายวิชาที่ลงทะเบียน (`min(ท+ป, จำนวนชั่วโมงเรียน)` ต่อคู่กลุ่ม-วิชา)
    - `I3` (3): ไม่มีกลุ่มเรียน ครู หรือห้องเรียน ซ้อนทับกันในคาบเดียวกัน (ยกเว้นคาบกิจกรรมเรียนร่วม พฤหัสบดี คาบ 2–3)
    - `I4` (4): ครูผู้สอนมีสิทธิ์สอนรายวิชานั้นตาม `teach.csv`
  - **Basic (`type: 'basic'`, always enabled):**
    - `B1` (5): คาบที่ 1 (08:00–08:30) เป็นคาบ Homeroom ห้ามจัดรายวิชาลง
    - `B2` (6): คาบพักเที่ยง (คาบที่ 6 เวลา 12:30–13:30) ห้ามจัดรายวิชาลง
    - `B3` (7): วันพฤหัสบดี คาบ 2–3 เป็นรายวิชากิจกรรม และ ปวช. ปี 1 เป็นคาบลูกเสือวิสามัญ
    - `B4` (8): ครูวุฒิวงศ์ เอียดศรีชาย สอนเฉพาะ ปวส.1–2 สาขาเทคโนโลยีสารสนเทศเท่านั้น
    - `B5` (9): ครูวุฒิวงศ์ เอียดศรีชาย สอนกิจกรรม ปวส.1 และ ปวส.2 IT พร้อมกัน พฤหัสบดี คาบ 2–3
    - `B6` (10): ครูลิขิต ชมขวัญ สอนกิจกรรม ปวช.2 และ ปวช.3 IT พร้อมกัน พฤหัสบดี คาบ 2–3
  - **Special (`type: 'special'`, toggleable via `config.constraints`):**
    - `S1` (11): ครูหัวหน้าแผนกวิชา (Leader) สอน 20–30 คาบต่อสัปดาห์ (นับตามเวลาจริง)
    - `S2` (12): ครูธรรมดา (Teacher) สอน 25–35 คาบต่อสัปดาห์ (นับตามเวลาจริง)
    - `S3` (13): ตารางเรียนของนักเรียน/นักศึกษาห้ามมีช่องว่างคั่นระหว่างวัน (ยกเว้น Homeroom และพักเที่ยง)
  - Basic checks (`type: 'basic'`) are always enabled (`enabled: true`).
  - Special checks (`type: 'special'`) read their toggle state from `config.constraints`; when off,
    return `enabled: false, passed: true`.
  - Violation messages are short Thai lines naming the relevant entity and slot (`<day> คาบ <period>`).

Result: `{ passed, checks: [{ id, no, name, type: 'integrity'|'basic'|'special', enabled, passed,
violationCount, violations (first 50) }], stats: { rows, groups } }`.

---

## 5. Solver (`services/solver.js`)

`solve(data, config, { onProgress })`. Phase 1 CSP search finds a timetable meeting every hard
constraint; phase 2 simulated annealing lowers the soft cost without breaking any. **Reproduce every
detail below**: the same seed must give the same timetable.

### 5.1 Setup
- `rng = mulberry32(Number(params.seed) || 1)`, deadline = start + max(1, timeLimitSec || 20) s.
```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
- Errors = context warnings of level `error` + problems from `buildBlocks`. If any → failure
  `ข้อมูลไม่พร้อมสำหรับการจัดตาราง`.

### 5.2 Courses and blocks (`buildBlocks`)
- Course = `{ id, subjectId, groups[], hours, teachers[], rooms = ctx.roomsFor(subject), kind, subByGroup? }`.
  Problems: no teacher `<subject> (<g+g>) ไม่มีครูที่สอนได้`; no room `... ไม่มีห้องที่ใช้ได้ตามเงื่อนไข`.
- First create fixed Thursday P2–P3 (`thuActivitySlots`) blocks (`kind = 'activity'`):
  - Joint cohorts (`T01` -> `G04+G05`, `T02` -> `G02+G03`, `T03` -> `G01+G06` Scout `20000-2002`) with `subByGroup` mapping each group to its registered activity `subject_id`.
  - Single-group fixed activity blocks for any remaining group's activity subject at Thu P2–P3 using its advisor (or `teachersBySubject`).
- Walk remaining `registrations` in order, skipping 0-hour subjects and already-scheduled activity courses, and create `kind = 'normal'` courses. Apply `B4`: filter out `T01` (ครูวุฒิวงศ์) for any group not in `IT ปวส.1` or `IT ปวส.2`.
- Blocks: split hours by `splitHours(h, maxBlock)`: n = ceil(h / max(1, maxBlock)), sizes `floor(h/n)`,
  the first `h % n` get +1 (6→[3,3], 5→[3,2]), or assign `fixed = { day: thuDayIdx, slots: thuActivitySlots, teacher }` for activity courses. Block = `{ id, course, len, fixed }`; `course.blockIds` lists its blocks.

### 5.3 Board
State: maps `group` (`g|slot`→block), `teacher` (`t|slot`), `room` (`r|slot`), `dayLoad` (`g|dayIdx`→periods),
`place[blockId]` (`{ day, slots, teacher, room }` or null), `courseTeacher` (course → `{ id, refs }`),
`unplaced` = `new Set(blocks ids 0..n-1)`. `clear()` resets everything (same Set order).

- `options(b, rng)` → feasible placements, in this order:
  - teachers = the course's held teacher if any (all blocks of a course use one teacher), else `course.teachers`.
  - positions: `b.fixed` alone, or for each `dayIdx` in order and each start `i` (0…) a window of `b.len`
    consecutive entries of `daySlots[dayIdx]`. If `course.blockIds.length ≤ days.length`, skip days already
    used by another placed block of the same course (spread blocks over days).
  - keep a position if every course group is free in all its slots (and passes `maxPerDay` and `S3` no-gap check during SA / post-assign check); then for each teacher (in order) free in all slots (and if `S1`/`S2` is enabled, `teacherLoad + needHours <= teacherMax`), call `pickRoom` and push `{ day, slots, teacher, room }` if a room was found.
- `pickRoom(course, slots, rng)`: first, the room of any already-placed block of the course that is free
  in all slots (no rng used). Otherwise `start = floor(rng() * rooms.length)` and scan rooms cyclically
  from `start`; return the first free one, or null.
- `assign` / `unassign` update all maps, `dayLoad`, `teacherLoad`, `courseTeacher` refs (delete at 0) and `unplaced`
  (`unassign` re-adds the id at the **end** of the Set).
- Constructor also builds `groupBlocks`: Map group → its blocks (block id order).
- `score(b, opt)` = Σ over slots (+3 if period > `latestPreferredPeriod`) + Σ over groups (`dayLoad(g, day) × 0.3` + `wasteAfter(g, b, opt) × 4` + internal gap penalty if `S3` enabled) + teacher slack/department balance (when `S1`/`S2` enabled, gently prefer same-department teacher and teachers with more remaining slack so loads stay in `[min, max]`).
- `wasteAfter(g, b, opt)`: `minLen` = smallest len of g's blocks that are not b, not placed and not fixed
  (none → 0). Walk `daySlots[opt.day]`; a slot is free if not in opt.slots and g has nothing there.
  Sum the lengths of free runs with `0 < run < minLen`.
- `canStillFit(g)`: `lens` = lens of g's unplaced, non-fixed blocks (empty → true). When `S3` is enabled,
  verify any internal gap run inside `[first..last]` on any day is `>= minRem` and total internal gaps
  `<= sum(lens)` (and `0` when `lens` is empty). `runs` = lengths of g's free runs (internal gaps + outer free prefixes/suffixes) over every day's `daySlots`. For each distinct L in lens: count/need = number/sum of lens
  ≥ L; fits/room = Σ floor(r/L) / Σ r over runs with r ≥ L. Return false if count > fits or need > room.
- `teacherCapacityOk()`: when `S1` or `S2` is enabled, verify committed + unheld courses fit remaining teacher bounds `[min, max]` (including IT-only / DB-only course pools and per-teacher minimum reachability).
- `groupCost(g)`: for each day, over `daySlots` indexes the group occupies: `first`, `last`, `n`;
  +3 per occupied slot with period > `latestPreferredPeriod`; + `(last - first + 1 - n) × 2` (gaps);
  then with `loads` = periods per day and `avg` their mean, + Σ `(load - avg)² × 0.3`.
  `totalCost()` = Σ over groups.
- `toRows()`: for each block in id order, each slot, each group → row (using `subByGroup[g]` if present, else `course.subjectId`). Sort by group_id
  (`localeCompare` numeric) then by the slot's index in `slotsById` order.

### 5.4 Phase 1: DFS with MRV and restarts
```
NODE_LIMIT = 4000, MAX_RESTARTS = 200
while not found and restarts < 200 and now < deadline:
    board.clear(); budget = 4000; found = dfs(); nodes += used; restarts++
    if not found: onProgress('รอบที่ <n> ยังไม่พบคำตอบ เริ่มใหม่')
dfs():
    if unplaced is empty: return true
    if --budget <= 0 or now > deadline: return false
    for id in unplaced (Set order): opts = options(block, rng)
        if opts is empty: failCount[id]++; return false
        keep the block with fewest opts; on a tie prefer the larger len
    ranked = opts mapped to key score(best, o) + rng()*2, sorted ascending, first 8
    for opt in ranked: assign
        if not board.teacherCapacityOk() or not every group of best.course canStillFit: unassign; continue
        if dfs() return true; unassign; if budget <= 0 return false
    return false
```
On failure: message `ไม่พบตารางที่ผ่านทุกเงื่อนไขภายในเวลาที่กำหนด`, error
`วางบล็อกเหล่านี้ไม่ได้บ่อยที่สุด: <top 5 by failCount, "<subject> <name> กลุ่ม <g+g> (<len> คาบ)" joined by "; ">`.

### 5.5 Phase 2: simulated annealing
```
movable = blocks without fixed; ITER = 20000; temp = 5; cooling = (0.01/temp)^(1/ITER)
for i < ITER and now < deadline (temp *= cooling each iteration):
    b = movable[floor(rng()*movable.length)]
    before = Σ groupCost(g) over b's groups; old = place[b]
    unassign(b); opts = options(b, rng)
    if S3 enabled: filter opts to those leaving every group of b gap-free on old.day and opt.day
    if S1/S2 enabled: filter opts where teacher stays within [min, max] (keeping courseTeacher consistency)
    if opts is empty: assign(b, old); continue
    cand = opts[floor(rng()*opts.length)]; assign(b, cand)
    if (S3 enabled and any group of b has gap) or (S1/S2 enabled and not teacherCapacityOk()): unassign(b); assign(b, old); continue
    delta = Σ groupCost after − before
    if delta > 0 and rng() >= exp(-delta/temp): unassign(b); assign(b, old)
```
(When `delta ≤ 0`, `rng()` is not called for the acceptance test.)

### 5.6 Result
Success: `{ status: 'success', message: 'จัดตารางสำเร็จ', rows, warnings, stats: { courses, blocks,
restarts, nodes, saIterations, softCostBefore, softCostAfter, seconds, seed, constraints: {...},
params: { maxBlock, timeLimitSec, ...constraintParams } } }`. Costs and seconds are rounded to 2 decimals.
Failure: `{ status: 'failed', message, errors, rows: [], warnings, stats: { seconds } }`.
Progress messages: `เริ่มค้นหา <B> บล็อก จาก <C> รายวิชา-กลุ่ม`, `ปรับปรุงตารางด้วย Simulated Annealing`.

### 5.7 Worker (`services/solve-worker.js`)
A `worker_threads` worker: `workerData = { mode: 'solve'|'diagnose'|'best', data, config, options }`.
It posts `{ type: 'progress', message }` and finally `{ type: 'result', result }`. The API runs every
solve, diagnosis and best-seed search through it (`runWorker(data, config, mode, options)`, which
collects progress messages into `log`).

---

## 6. Diagnose and best seed (`services/diagnose.js`)

### 6.1 `diagnose(data, config, { probeSeconds = 4, onProgress })`
1. `capacityChecks(ctx)` → findings `{ level: 'error'|'warn'|'ok', area, message }`:
   - Check each group's total periods ≤ `usablePerWeek` (`daySlots` total = 40), and check Thursday P2–P3 activity coverage for every group (plus Year 1 Scout `20000-2001`/`20000-2002`).
   - Check teacher min/max capacity (`S1` 20–30 for Leaders, `S2` 25–35 for Teachers) vs total required teacher-periods (counting joint Thu cohorts once), and `T01` (ครูวุฒิวงศ์) eligible IT ปวส.1–2 capacity.
   - Check room count ≥ max concurrent classes (e.g. Thu P2–P3).
   - If no findings → one `ok` finding (area `ความจุ`).
   - Data errors from the context are added with area `ข้อมูล`.
2. Probes: solve with the current constraints (`เงื่อนไขปัจจุบัน`) using `timeLimitSec = probeSeconds`. If it
   fails and no blocking `กลุ่ม`/`ข้อมูล` error exists: one probe per enabled special constraint (`S1`, `S2`, `S3`) switched off
   (`ปิดข้อ <id>`), and if none succeeds and more than one was enabled, one with all off
   (`ปิดเงื่อนไขพิเศษทั้งหมด`).
3. `culprits` = constraint numbers whose single-off probe succeeded. Suggestions (Thai) depend on the
   case; plus advice per area. The first 5 search errors are appended as findings (area `การค้นหา`).
4. Returns `{ feasible, culprits, probes: [{ label, ok, seconds }], findings, suggestions }`.

### 6.2 `bestSeed(data, config, { count = 20, seeds, onProgress })`
Seeds = the current seed plus random distinct seeds 1…99999 up to `count`. Solve each with
`timeLimitSec = min(config, 10)`. Keep the success with the lowest `softCostAfter`. `results` =
`{ seed, ok, softCost, seconds }` sorted (successes first, by soft cost). Returns `{ best, results, seconds }`.

---

## 7. Grid, editor, stats

### 7.1 `services/grid.js`
- `DAY_TH = { Mon:'จันทร์', Tue:'อังคาร', Wed:'พุธ', Thu:'พฤหัสบดี', Fri:'ศุกร์', Sat:'เสาร์', Sun:'อาทิตย์' }`,
  `VIEWS = ['group','teacher','room']`.
- `entitiesFor(view, ctx)` → list of `{ id, title, subtitle, heading, info: [[label, value]...], signer, signerName }`:
  - group: title `กลุ่มเรียน <id> <name>`, subtitle `ครูที่ปรึกษา: <advisor> · จำนวนนักเรียน <n> คน`,
    heading `ตารางเรียน`, info `[['กลุ่มเรียน', '<name> (<id>)'], ['ครูที่ปรึกษา', advisor]]`,
    signer `ครูที่ปรึกษา`, signerName = advisor before the first `/`.
  - teacher: title `ครูผู้สอน <id> <name>`, subtitle `ตำแหน่ง: หัวหน้างาน/หัวหน้าแผนก (Leader)` or
    `ตำแหน่ง: ครูผู้สอน (Teacher)`, heading `ตารางสอน`, info `[['ผู้สอน', name]]`, signer `ครูผู้สอน`.
  - room: title `ห้องเรียน <name> (<id>)`, subtitle `ประเภทห้อง: <type>`, heading `ตารางการใช้ห้องเรียน`,
    info `[['ห้องเรียน', '<name> (<id>)'], ['ประเภทห้อง', type]]`, signer `ผู้ดูแลห้อง`, signerName `''`.
- `buildGrid(view, id, rows, ctx)` → `{ days: [{key, label}], periods: [{ period, start, end, isBreak, isHomeroom, breakLabel }],
  cells: per day a list of spans, total }`. Span = `{ start, span, subject_id, subject_name, teacher_id,
  teacher (name), room, groups[], clash }`. Consecutive periods merge when subject, teacher, room and
  groups are equal. `clash`: for group view, more than one row in a period; otherwise rows with
  different subjects (or non-cohort rows sharing a teacher/room). `total` = distinct slots used.
- `subjectName(id, ctx)`: subject name from `subjects`.
- `subjectSummary(view, id, rows, ctx)` → `{ list: [{ subject_id, name, t, p, n, h }], total: { t, p, n, h } }`
  for the subjects in that timetable (sorted by id);
  t/p/n = theory/practice/credit, h = effective scheduled hours (`ctx.hours(subject_id)`).

### 7.2 `services/editor.js`
- `moveSpan(rows, ctx, { view, id, fromDay, fromPeriod, length = 1, toDay, toPeriod })`: source and target
  are `length` consecutive usable slots (`daySlots`); 400 `ช่วงคาบปลายทางไม่พอหรือตรงกับคาบพัก` if
  either is invalid, 400 `ช่วงต้นทางและปลายทางซ้อนกัน` if they overlap (and differ). Moving rows = rows of
  the entity in the source slots (plus joint partners if joint-class constraints are defined). Rows of the
  same groups already in the target slots (plus partners) swap into the source slots. 404
  `ไม่พบคาบที่ต้องการย้าย`. Returns new rows; does not validate.
- `editSpan(rows, ctx, { view, id, day, period, length, teacher_id, room_id })`: set the teacher and/or
  room on the span and its partners. 404 `ไม่พบคาบที่ต้องการแก้ไข`.

### 7.3 `services/stats.js` — `timetableStats(rows, ctx)` for the dashboard and teacher summary
`{ days, periods, homeroomPeriod, breakPeriod, maxPerDay, groups, usablePerWeek, teacherLoad: [{ id, name, role, periods,
perDay[] }] (desc), teacherSummary: [{ id, name, role, department, specialRole, theory, practice, credit,
pvcPeriods, pvsPeriods, totalPeriods, minLoad, maxLoad, inRange, subjects: [{ subject_id, subject_name, groups[],
level, theory, practice, credit, periods, isJoint }] }], roomUsage: [{ id, type, periods, pct }] (desc by pct),
heat: days × periods of groups in class (null at homeroom/break period), groupDaily: [{ id, name, total, perDay[] }] }`.
- Note on `teacherSummary` (Rule 6): `totalPeriods`, `pvcPeriods`, and `pvsPeriods` count distinct `(teacher_id, timeslot_id)` slots ("นับตามเวลาจริง"); `theory`, `practice`, and `credit` sum per distinct teaching session (so joint simultaneous sessions count once).

---

## 8. Export (`services/exporter.js`)

Official Thai vocational-college form, black on white. `docInfo(ctx)` = defaults merged with
`config.document`. Semester text = `<semester>/<year>` (e.g. `2/2569`). Header info lines =
`[['ภาคเรียน', semester text], ...entity.info]`. Signatures (4, every view):
`{entity.signerName, entity.signer}`, `{curriculumHeadName, 'หัวหน้างานพัฒนาหลักสูตร'}`, `{deputyName, 'รองผู้อำนวยการฝ่ายวิชาการ'}`,
`{directorName, 'ผู้อำนวยการ' + college}`; an empty name prints dotted lines.

Cell content per view (PDF and Excel): subject id only (bold; no subject name, it is in the subject table),
then "who": teacher view → groups joined by `+`; group view → teacher name; room view → `<groups> <teacher>`.
Then the room id alone (no `ห้อง` prefix) except in room view.

- `exportCsv(rows)` → `toCsv(rows, OUTPUT_FIELDS)`.
- Views: `view = 'all'` means group, teacher and room in that order; `id` limits to one entity.

### 8.1 PDF (`exportPdf(rows, ctx, { view = 'group', id })`)
pdfkit, A4 landscape, margin 24, fonts `th` = `fonts/Sarabun-Regular.ttf`, `th-bold` = `Sarabun-Bold.ttf`.
One page per entity; set `page.margins.bottom = 0` and position everything absolutely (no automatic page
breaks). Line width 0.7, black. All single-line text is clipped to its width with `…`, cutting on
grapheme clusters (`Intl.Segmenter('th', { granularity: 'grapheme' })`) so Thai marks stay attached.
Layout (W = page width − 48, x0 = 24):
- **Header block** (height `topH = 18 + per × rowH + 16`, `per = max(8, ceil(subjects / 2))`,
  `rowH = min(15, 150 / per)`):
  - left box 230 pt wide: if `assets/logo.png` exists (the generic emblem from Part D.4), the logo 42 × 42 centred at the top (y + 5), then the
    college name (bold 14) centred, the heading (bold 12), then info lines from 37 pt below the name, every
    17 pt: label (bold 11) at x + 14, value (regular 11, may wrap to 2 lines, `lineGap: -2`) at x + 84.
    Without a logo: name bold 16 at y + 14, heading bold 13, info every 20 pt.
  - right side: subject table split into 2 halves of `(W − 230) / 2`. Columns per half: รหัสวิชา (64),
    ชื่อรายวิชา (rest), ท. ป. น. ช. (19 each). Header row 18 high (bold 8.5); `per` rows of `rowH`
    (regular 8; the name column left-aligned with 3 pt padding). The left half is filled first.
    Total row (16 high): left half shows `รวม` right-aligned across code + name and the sums of
    ท. ป. น. ช.; right half shows `รวม <total> คาบ/สัปดาห์` centred.
- **Day grid** starts 8 pt below. Day column 58 wide; period columns share the rest equally. Two header
  rows of 16: row 1 `เวลา` + `<start> - <end>` (regular 7.5); row 2 `วัน/คาบ` + period number (bold 9).
  Day rows: Monday–Friday from the data, height `min(70, (pageH − 24 − 54 − 14 − gridTop) / days)`;
  day label bold 11. Spans are drawn as one merged rectangle; the non-empty lines (id bold 9, who regular 7.5,
  room regular 7.5) are stacked 11 pt apart and centred vertically, each clipped to the cell width. Homeroom column (P1) shows `Homeroom` (bold 8) and break period (P6) shows `พัก` (bold 11).
- **Signatures** 16 pt below the grid, 4 equal columns, regular 10.5: `ลงชื่อ ......…`, `( name )`, role.
- Footer bottom-right (7 pt, grey #444): `พิมพ์เมื่อ <th-TH date, Asia/Bangkok>`.
- No entities → one page `ไม่พบข้อมูลตาราง`.

### 8.2 Excel (`exportXlsx(rows, ctx, { view = 'all', id })`)
exceljs, font `TH SarabunPSK`, thin black borders, gridlines hidden, landscape A4 fit to 1 page,
centred, margins 0.3/0.4. One sheet per entity named `กลุ่ม <id>` / `ครู <id>` / `ห้อง <id>` (illegal
characters replaced by `-`, max 31). Then a sheet `output` with the raw rows (bold, boxed header).

Same layout as the PDF on narrow unit columns: `k = max(3, ceil(36 / periods))` units per period,
2 units for the day column (width 6), others width 4.6, `cols = 2 + k × periods`. Header block rows
1…`per + 2` (height 18): left box `leftU = cols − 26` units with an outline only (college size 18 bold
in rows 1–2, heading 15 bold in row 3, info lines from row 5 as rich text "label  value" size 13,
left-aligned, shrink to fit); right side 2 halves × 13 units (code 3, name 6, ท. ป. น. ช. 1 each), header
row bold 12, total row as in the PDF. Grid from row `per + 4`: `เวลา` row and `วัน/คาบ` row (height 20),
day rows height 72 with merged spans (rich text: id bold 12 + who and room size 11), `Homeroom` cells at P1, and `พัก` cells at P6.
Signatures 2 rows below in 4 column groups of `floor(cols / 4)` units, the last one to the end (size 14). Print area set to the used range.

### 8.3 QR cards (`exportQrPdf(items, ctx)`)
A4 portrait, 2 × 3 cards per page with a dashed grey border: college (bold 11), title (bold 12.5), QR
image, `สแกนเพื่อดูตารางเรียนล่าสุด`, the URL (7.5, grey).

---

## 9. Auth and API

### 9.1 `services/auth.js`
- Users in `data/users.json`: `{ username, name, role: 'admin'|'teacher'|'viewer', teacher_id, avatar,
  mustChangePassword, createdAt, salt, hash }`. Password hash = `scryptSync(password, salt(16 random
  bytes hex), 64)` hex; verify with `timingSafeEqual`.
- `initAuth()`: load users; if no admin exists, create `admin` / `admin1234`, name `ผู้ดูแลระบบ`,
  `mustChangePassword: true`. `DEFAULT_ADMIN = { username: 'admin', password: 'admin1234' }`.
- `publicUser(u)` = `{ username, name, role, teacher_id, avatar, mustChangePassword }`.
- Sessions: in-memory Map token (32 random bytes hex) → `{ username, expires }`, 12 hours. Cookie
  `tt_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`. Logout clears it.
- Validation: username `/^[a-zA-Z0-9._-]{3,32}$/`; password ≥ 6 chars; role in ROLES; name not blank.
  At least one admin must remain (cannot demote or delete the last one; cannot delete yourself).
  An admin resetting another user's password sets `mustChangePassword: true` and drops their sessions.
  `changeOwnPassword(current, next)`: current must verify, next ≠ current, clears `mustChangePassword`.
- `updateProfile(username, { name, avatar })`: name trimmed, 1–80 chars; avatar `''` or a data URL
  matching `/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/` of at most 200 KB, else 400
  `รูปโปรไฟล์ต้องเป็น PNG, JPEG หรือ WebP ขนาดไม่เกิน 200 KB`.
- `guard` middleware (mounted on `/api`): open paths `/auth/(login|logout|me)`, `/public/*`, `/health`.
  Others need a session (401 `กรุณาเข้าสู่ระบบ`). Non-GET/HEAD requests need admin (403
  `บัญชีนี้ดูข้อมูลได้อย่างเดียว เฉพาะผู้ดูแลระบบที่แก้ไขได้`) except `/auth/password`, `/auth/profile`,
  `/chat`. `requireAdmin` for `/users` (403 `เฉพาะผู้ดูแลระบบ`).

### 9.2 Routes (`routes/api.js`, all under `/api`)
Async handlers are wrapped so errors reach the error handler. `context()` = `buildContext(getData(), loadConfig())`.

| method & path | behaviour |
|---|---|
| GET `/data` | `{ data, schema: ENTITIES, warnings, summary: { teachers, leaders, rooms, groups, subjects, registrations, timeslots, totalPeriods } }` |
| GET `/data/:entity` | rows (404 unknown entity) |
| POST `/data/reset` | `resetData()` |
| POST/PUT/DELETE `/data/:entity[/:key]` | add (201) / update / delete a row |
| POST `/import` | multer memory, field `files` (≤ 20, 10 MB). Filenames decoded latin1→utf8. `.xlsx`: each sheet whose name is an entity (or the single sheet named by the file) replaces that entity; also supports workbook format of `ข้อมูลการสอน.xlsx` (sheets `2_2569`/`1_2570`, `ครูผู้สอน`, `ห้องเรียน`). `.csv`: entity from filename, 400 if a key column is missing. Returns `{ imported: [{file, entity, rows}], skipped, warnings }` |
| GET/PUT `/config` | `{ config, defaults }` / save (keeps the stored `savedSeeds`) |
| GET/POST/DELETE `/seeds[/:id]` | list / add (409 if the same seed+constraints+params exists; id = base36 time + 4 random chars; name ≤ 80, default `Seed <n>`) / delete |
| POST `/solve` | body may override `constraints`, `params`, `document` (saved to config). Run the worker; on success validate and `setTimetable(rows, { stats, validationPassed, source: 'solver' })`. Returns `{ ...result, validation, log }` |
| POST `/diagnose` | worker `diagnose` with `probeSeconds: 4` |
| POST `/solve/best` | `count` clamped 2–60 (default 20). Worker `best`. On success set `params.seed` to the best seed, save config, validate, store with `bestOf`. Returns `{ status, message: 'seed ที่ดีที่สุดคือ <n>', best: { seed, softCost }, results, seconds, validation }` |
| GET `/stats` | `timetableStats` |
| GET `/auth/me` | `{ user, defaultPassword, defaultAdmin }` (`defaultAdmin` = credentials only while the default password is still active) |
| POST `/auth/login` `/auth/logout` `/auth/password`; PUT `/auth/profile` | as above |
| GET/POST/PUT/DELETE `/users[/:username]` | admin CRUD |
| GET `/public/info` | `{ enabled, college, semester, year, hasTimetable }` (always open) |
| GET `/public/entities`, `/public/grid?view&id`, `/public/qr?view&id` (SVG) | 403 `ผู้ดูแลระบบปิดการเผยแพร่ตารางสาธารณะ` when `publicEnabled` is false |
| GET `/share?view&id` | `{ url, base, enabled }`; public URL = `<publicBaseUrl or request origin>/p/<view>/<id>` |
| GET `/export/qr-pdf?view&inline` | QR card PDF for every entity of the view |
| GET `/timetable` | `{ rows, meta, validation }` (empty when none) |
| PUT `/timetable` | save given rows (source `manual`), validate, return with validation |
| POST `/timetable/validate`, `/timetable/move`, `/timetable/edit` | validate rows / `moveSpan` / `editSpan` then save as `manual` |
| GET `/timetable/entities` | `{ group: [...], teacher: [...], room: [...] }` from `entitiesFor` |
| GET `/timetable/grid?view&id` | `{ entity, ...grid }` (first entity if id unknown) |
| GET `/timetable/grids?view` | every grid of the view ("show all") |
| GET `/document` | `config.document` |
| GET `/export/csv` | `output.csv` attachment |
| GET `/export/xlsx?view&id` | `timetable-<view>[-<id>].xlsx` |
| GET `/export/pdf?view&id&inline` | `Content-Disposition` inline when `inline` is set (for the preview) |
| POST `/chat` | `{ message (≤ 500), context }` → `reply(...)` (§11) |
| POST `/chat/action` | `{ kind, payload }`: `solve`, `move`, `diagnose`, `best_seed`, `save_seed` (run, store, answer `{ ok, text, refresh? }`) |

Export routes without a timetable → 404 `ยังไม่มีตารางเรียน กรุณากดจัดตารางก่อน`.

---

## 10. Frontend (Angular)

`ng new frontend --style=scss --skip-tests --ssr=false`, standalone, `provideHttpClient(withFetch(),
withInterceptors([authInterceptor]))`, `provideRouter(routes, withComponentInputBinding())`.
`index.html`: `lang="th"`, title `วิทยาลัยเทคนิคพังงา · ระบบจัดตารางเรียนอัตโนมัติ`, theme-color `#800020`,
Google Font IBM Plex Sans Thai 400/500/600/700. Dev server proxies `/api` (`proxy.conf.json`, Part D.5;
set `"proxyConfig"` in angular.json serve options). Page titles: `<page> · วิทยาลัยเทคนิคพังงา`.

### 10.1 Design tokens and global styles (`src/styles.scss`)
```scss
:root {
  --maroon-950:#3a000e; --maroon-900:#4a0012; --maroon-800:#5c0017; --maroon-700:#800020; --maroon-600:#9b1b30;
  --maroon-200:#ecc7ce; --maroon-100:#f8e7ea; --maroon-50:#fcf4f5;
  --bg:#faf7f7; --surface:#fff; --text:#22161a; --text-muted:#6b5a5e; --border:#e8dadd; --border-strong:#d5bcc2;
  --success:#1e7b4f; --success-bg:#e8f5ee; --warning:#9a5b00; --warning-bg:#fff4e0; --danger:#b42318; --danger-bg:#fdecea;
  --radius-sm:6px; --radius:10px; --radius-lg:14px;
  --shadow-sm:0 1px 2px rgba(58,0,14,.06); --shadow:0 4px 16px rgba(58,0,14,.08); --shadow-lg:0 18px 48px rgba(58,0,14,.18);
  --focus:0 0 0 3px rgba(128,0,32,.28); --sidebar-w:248px; --header-h:60px; --ease:cubic-bezier(.2,.7,.2,1);
}
```
Body: font `'IBM Plex Sans Thai', 'Sarabun', 'Leelawadee UI', Tahoma, sans-serif`, 14px/1.55, bg `--bg`.
h1 22px, h2 17px, h3 15px, weight 600. `[hidden] { display: none !important }`. `:focus-visible` uses `--focus`.
Global classes: `.page` (padding 24, max-width 1480, column gap 20), `.page-head` (title block + actions,
`.eyebrow` 12px/600 maroon above h1, description muted), `.card` (white, border, radius-lg, shadow-sm) with
`.card-head` (14px 18px, bottom border) and `.card-body` (18px), `.grid-2`, `.row`, `.muted`, `.small`,
`.spacer`, `.btn` (min-height 38, radius 10; `.primary` maroon-700 filled, `.danger`, `.ghost`, `.sm` 32,
`.icon` 36 square, `.lg` 46), `.field` (label 13/500, `.hint`, `.error`), `.input`, `.switch` (42×24 toggle,
maroon when on), `.badge` (+ `.success/.warning/.danger/.neutral`), `.alert` (+ `.warning/.danger/.success/.info`),
`.table` (sticky maroon-50 header), `.segmented` (pill tab group; selected = white with maroon text),
`.scrim` + `.dialog` (modal, max 560 px) + `.dialog-foot`, `.spinner`, `.empty`, `.sr-only`, and
reduced-motion support. Respect 960 px and 640 px breakpoints.

### 10.2 Core (`src/app/core`)
- `models.ts`: types for every API shape in §9 (DataResponse, OutputRow, Check, Validation, SolveStats,
  SavedSeed, TimetableResponse, SolveResponse, DocumentInfo, Config, EntityRef, GridSpan, Grid, View).
- `api.ts` (`Api` service, promise-based with `firstValueFrom`): data CRUD, import (FormData `files`),
  config, seeds, solve, timetable, saveTimetable, entities, grid, grids, move, edit,
  `exportUrl(kind, view?, id?, inline?)` → `/api/export/<kind>?...`. `errorMessage(err)`: status 0 →
  `เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจว่า backend ทำงานอยู่ (พอร์ต 3000)`, else `error.message`.
- `state.ts` (`AppState`): signals `data`, `timetable`, `loading`, `version` (+ `bump()`), computed
  `hasTimetable`, `validationPassed`; `refresh()`, `refreshData()`, `refreshTimetable()`.
- `auth.ts`: `AuthService` (signals `user`, `defaultAdmin`, computed `isAdmin`; `ensureLoaded`, `me`,
  `login`, `logout`, `updateProfile`, `changePassword`), `ROLE_TH = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู',
  viewer: 'ผู้ชม' }`, `authGuard` (→ `/login?next=`), `adminGuard` (→ `/`), `authInterceptor` (a 401 not
  from `/api/auth/` or `/api/public/` clears the user and goes to login). **Call `inject()` before any `await`.**
- `toast.ts` (`Toasts`: success/error/info, auto-dismiss 4 s, errors 8 s). Toasts sit bottom-right at
  `bottom: 96px` (above the chat button) with a 4 px coloured left border.
- `confirm.ts` (`Confirm.ask(opts)` → boolean, `Confirm.prompt(opts with input)` → string|null). The
  themed dialog replaces `window.confirm/prompt` and sits **top-centre** (top 16 px, width ≤ 460) like the
  browser's own, with a 4 px maroon top border (red when `danger`). Never use native dialogs.
- `chat.ts` (`ChatService`, §11.4).

### 10.3 Routes
```
/login                      LoginPage (public)
/p                          PublicIndex (public)
/p/:view/:id                PublicView (public)
'' (Shell, authGuard)
  ''         Dashboard      'ภาพรวม'
  data       DataPage       'จัดการข้อมูล'
  solve      SolvePage      'จัดตาราง'
  timetable  TimetablePage  'ตารางเรียน'
  teacher-summary TeacherSummaryPage 'สรุปภาระสอนครู'
  report     ReportPage     'ผลตรวจเงื่อนไข'
  export     ExportPage     'ส่งออก'
  settings   SettingsPage   'ตั้งค่า'
  users      → redirect '/settings?tab=users' (adminGuard)
**  → ''
```
All pages are lazy (`loadComponent`). The root `App` holds `<router-outlet>`, `<app-confirm-dialog>` and the toasts.

### 10.4 Shell (signed-in layout)
- **Sidebar** (fixed, 248 px, gradient maroon-800 → maroon-950, white text): brand (white rounded square
  with a calendar icon + `วิทยาลัยเทคนิคพังงา` / `ระบบจัดตารางเรียนอัตโนมัติ`); nav links with icons:
  ภาพรวม (dashboard, `/`, exact), จัดการข้อมูล (database), จัดตารางอัตโนมัติ (sparkles), ตารางเรียน (calendar),
  สรุปภาระสอนครู (users, `/teacher-summary`), ผลตรวจเงื่อนไข (shield), ส่งออกไฟล์ (download). Active link = white background, maroon text.
  At the bottom a translucent status card linking to `/report`: label `สถานะตารางล่าสุด`, then one of
  `ยังไม่ได้จัดตาราง` / `กดจัดตารางอัตโนมัติเพื่อเริ่ม`, `ผ่านทุกเงื่อนไข` / `<n> คาบในตาราง`,
  `มีเงื่อนไขไม่ผ่าน` / `ดูรายละเอียดที่ผลตรวจเงื่อนไข`. On narrow screens the sidebar slides in from a menu button.
- **Top bar**: menu button (mobile), title `ระบบจัดตารางเรียนด้วยอัลกอริทึมปัญญาประดิษฐ์`, button
  `โหลดข้อมูลใหม่` (refresh), then the profile button (avatar 32 + name + role + chevron). The profile
  dropdown shows avatar 40, name, `username · role`, then exactly two items: `ตั้งค่า` (→ `/settings`) and
  `ออกจากระบบ` (red).
- Banners: if `mustChangePassword` → warning `บัญชีนี้ยังใช้รหัสผ่านเริ่มต้นหรือรหัสที่ผู้ดูแลตั้งให้
  กรุณาเปลี่ยนรหัสผ่านเพื่อความปลอดภัย` with a `เปลี่ยนรหัสผ่าน` link to settings; non-admin → info
  `บัญชี<role> ดูข้อมูลได้อย่างเดียว การแก้ไขทำได้เฉพาะผู้ดูแลระบบ`.
- A skip link `ข้ามไปยังเนื้อหา`, `<main id="main">`, and `<app-chat-widget>` on every signed-in page.
  The shell calls `state.refresh()` on init.

### 10.5 Pages
Non-admins never see write controls (use `[hidden]="!auth.isAdmin()"` or `@if`).

**Login** (`/login`): two columns (1.15fr / 1fr; one column under 860 px).
- Left: a full-bleed maroon gradient (darker toward the bottom) with light radial highlights and a faint
  grid pattern (Part D.4; if a `campus.jpg` photo is available, put it under the gradient). Top: white
  logo tile + `วิทยาลัยเทคนิคพังงา` / `สำนักงานคณะกรรมการการอาชีวศึกษา`. Middle: pill `SMART TIMETABLE`,
  h1 `ระบบจัดตารางเรียน<br>อัตโนมัติ`, text `จัดตารางเรียนด้วยอัลกอริทึมปัญญาประดิษฐ์ ตรวจครบทุกเงื่อนไข
  พร้อมใช้งานทั้งวิทยาลัย`, three glassy chips (`จัดตารางครบทุกเงื่อนไขในไม่ถึง 1 วินาที`, `ตรวจผลด้วย validator
  อิสระ`, `ผู้ช่วยจัดตารางแบบออฟไลน์`). Bottom: a small photo credit only if a photo is used.
- Right: dotted pale background; card with a 4 px maroon top bar, icon tile, `เข้าสู่ระบบ`,
  `ใช้บัญชีที่ผู้ดูแลระบบสร้างให้`, fields `ชื่อผู้ใช้` and `รหัสผ่าน` (with a `แสดง/ซ่อน` button), error
  alert, primary button `เข้าสู่ระบบ`, an info alert with the default credentials while they are active,
  divider `หรือ`, link `ดูตารางเรียนแบบไม่ต้องเข้าสู่ระบบ` (→ `/p`), footer
  `© วิทยาลัยเทคนิคพังงา · ระบบจัดตารางเรียนอัตโนมัติ`. After login go to `next`, else `/` (a teacher
  account with `teacher_id` lands on `/timetable?view=teacher&id=<teacher_id>`).

**Dashboard** (`/`): hero (eyebrow `วิทยาลัยเทคนิคพังงา`, h1 `ระบบจัดตารางเรียนอัตโนมัติ`, buttons
`จัดตารางอัตโนมัติ` and `ดูตารางเรียน`); 5 KPI cards (กลุ่มเรียน, ครูผู้สอน, ห้องเรียนที่ใช้ได้, รายวิชา,
คาบที่ต้องจัด, each with a hint); charts (below); two cards: `ผลการจัดตารางล่าสุด` (a ring
`<passed>/<total> เงื่อนไขผ่าน`, facts, check list with ✓/✗ and violation badges, link to the report) and
`ข้อสังเกตจากข้อมูล` (warning alerts or `ข้อมูลพร้อมสำหรับการจัดตาราง`); a 4-step guide.
Charts (`charts.ts`, no library, from `/api/stats`):
1. `ภาระสอนของครู`: horizontal bars sorted desc, value at the tip, a dashed average line, `L` marks a
   Leader, hover/focus tooltip with per-day counts.
2. `ความหนาแน่นของการเรียน`: day × period heat map of groups in class (one maroon hue, light → dark),
   the break/blocked column (if configured) hatched, legend, tooltips.
3. `การใช้ห้องเรียน`: horizontal bars of % use per room, labelled with type.
Each chart has a text alternative (`role="img"` + `aria-label`) and a `ตาราง` / `กราฟ` toggle in its card
head that swaps the chart for a plain data table. Any lunch/break column of the heat map uses a 45° stripe.

**Data** (`/data`): head (eyebrow `ข้อมูลตั้งต้น 7 ไฟล์`, h1 `จัดการข้อมูล`, danger button
`คืนค่าข้อมูลต้นฉบับ` with a confirm); a dropzone (`ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์`, accepts many
.csv/.xlsx); a card with tabs for the 7 entities (icon, Thai label, row count), a search box,
`แสดง <n> จาก <total> แถว`, button `เพิ่มข้อมูล`; table with Thai label + field name per column, key fields
monospace, role as a badge, edit/delete icon buttons. Add/edit dialog: one field per column; foreign keys
(teacher_id, subject_id, group_id) are selects; room_type has a datalist; ints are number inputs.
Field labels: teacher_id `รหัสครู`, teacher_name `ชื่อครู`, role `ตำแหน่ง`, room_id `รหัสห้อง`,
room_name `ชื่อห้อง`, room_type `ประเภทห้อง`, group_id `รหัสกลุ่ม`, group_name `ชื่อกลุ่ม`,
student_count `จำนวนนักเรียน`, advisor `ครูที่ปรึกษา`, subject_id `รหัสวิชา`, subject_name `ชื่อวิชา`,
theory `ทฤษฎี (คาบ)`, practice `ปฏิบัติ (คาบ)`, credit `หน่วยกิต`, timeslot_id `รหัสคาบ`, day `วัน`
(select Mon…Sun), period `คาบที่`, start `เริ่ม`, end `สิ้นสุด`. Select labels are `<id> <name>`.

**Solve** (`/solve`): eyebrow `ขั้นตอนที่ 2`, h1 `จัดตารางอัตโนมัติ`.
- Two columns (1.1fr / 1fr, both columns end on the same line: the last card of each column grows).
  Left: `เงื่อนไขพิเศษ` (badge `เปิด n/<total>`, `เปิดทั้งหมด`/`ปิดทั้งหมด`, list of user-defined special
  constraints with number tile, title, detail, switch; an enabled row is tinted), `เงื่อนไขพื้นฐาน (บังคับ)`
  (numbered list of user-defined basic constraints, badge `เปิดเสมอ`),
  `Seed ที่บันทึกไว้` (list: seed number tile, name, `เงื่อนไขพิเศษ … · block … · … คาบ/วัน · soft cost …`,
  saved date, `Load` (→ sets seed, constraints, params; shows `โหลดแล้ว`) and delete with confirm).
  Right: `พารามิเตอร์อัลกอริทึม` (Random seed + shuffle button, `เวลาสูงสุด (วินาที)`,
  `คาบติดกันสูงสุดต่อบล็อก`, `คาบสูงสุดต่อวัน`, hints), `ข้อมูลหัวกระดาษตาราง` (college, semester, year,
  `หัวหน้างานพัฒนาหลักสูตร`, deputy, director, a switch `เผยแพร่ตารางสาธารณะ`, `ที่อยู่สาธารณะสำหรับลิงก์และ QR (ไม่บังคับ)`, button `บันทึก`).
- Run row (same column split, equal heights): left card `ค้นหา seed ที่ดีที่สุด` (select 10/20/30/50 +
  `เริ่มค้นหา`; before a search an explanation of soft cost; after, a ranked table: อันดับ, Seed, Soft cost
  with a thin in-cell bar, เวลา, `ใช้อยู่` badge or `ใช้ seed นี้`); right card with the 3 algorithm steps
  (CSP Search, Simulated Annealing, Validator), primary `เริ่มจัดตาราง` (shows elapsed seconds while
  running) and `วิเคราะห์สาเหตุ (เมื่อจัดตารางไม่ได้)`.
- Results: diagnosis card (`ผลวิเคราะห์สาเหตุ`, culprit alert, probes ✓/✗, findings by level, suggestions)
  and result card (`ผลลัพธ์`: stats grid of 8 (แถว output, บล็อกที่จัด, รอบค้นหา, Node ที่สำรวจ,
  SA iterations, Soft cost before → after, เวลา, Validator) + links, or the failure reasons; data warnings
  in a `<details>`).
- Changing a switch or parameter updates the config sent with the next solve.

**Timetable** (`/timetable`, query `view` and `id`): eyebrow `ขั้นตอนที่ 3`, h1 `ตารางเรียน`; actions
`ย้อนกลับ (<n>)` (admin, up to 20 steps), `แชร์ / QR`, `Excel`, primary `PDF / พิมพ์` (opens the PDF preview).
- Controls card: segmented view (กลุ่มเรียน / ครูผู้สอน / ห้องเรียน), prev/next buttons and a select whose
  first option is `— แสดงทั้งหมด (ทุกกลุ่มเรียน|ครูทุกคน|ทุกห้อง) —`, then the badge `ผ่านทุกเงื่อนไข` or
  `ไม่ผ่าน <n> เงื่อนไข`.
- Seed bar: `Seed ที่ใช้สร้างตารางนี้` + seed, facts (เงื่อนไขพิเศษ, คาบติดกันสูงสุด, คาบสูงสุด/วัน, Soft cost),
  warning badge `มีการแก้ไขด้วยมือหลังจัด` when `source === 'manual'`, button `บันทึก seed` (prompt for a
  name, default `Seed <n> · เงื่อนไข <list>`; becomes `บันทึก seed นี้แล้ว`). Without a seed:
  `ตารางนี้ไม่ได้สร้างจากอัลกอริทึมโดยตรง จึงไม่มีค่า seed`.
- Sheet component (one per grid; "show all" stacks every grid with a title row): a lightly themed table
  (no header block, no signatures on the web): header `วัน / เวลา` + `คาบ n` and time; break/blocked column cells (if configured)
  `พัก`; spans are buttons showing subject id (bold maroon), name (if span > 1), who and room (muted).
  Colours: header row maroon-700 with white text (break header maroon-600), day column maroon-50,
  break cells light grey `#f6f1f2`, cell borders `--border-strong`, a drop target tinted maroon-100 with a
  2 px maroon inset, a clash shown as a 2 px dashed red outline. Admin: drag a span onto another cell to move/swap (`/timetable/move`), click to open
  a side panel `รายละเอียดคาบ` (details; `ย้ายไปช่วงเวลาอื่น` with day + start period; `เปลี่ยนครูหรือห้อง`
  with teachers from teach.csv and rooms). Every change revalidates and pushes the previous rows to the
  undo history. Read-only users can open the panel without edit sections.
- Share dialog: QR (from `/api/public/qr`), public URL with `คัดลอก`, a warning when publishing is off or the
  URL is localhost, buttons `เปิดดู` and `พิมพ์ QR ทุก<view>`.

**TeacherSummary** (`/teacher-summary`, ข้อ 6): eyebrow `สรุปภาระงานสอนรายบุคคล`, h1 `ข้อมูลสรุปการสอนของครูรายบุคคล`.
- Summary KPI row + filter/search by teacher or department (`ทั้งหมด`, `เทคโนโลยีสารสนเทศ`, `เทคโนโลยีธุรกิจดิจิทัล`) + table/cards per teacher showing:
  - ครูผู้สอน (รหัส, ชื่อ, ตำแหน่ง Leader/Teacher + หน้าที่พิเศษ, สาขาวิชา)
  - ผลรวม ทฤษฎี (`ท.`), ปฏิบัติ (`ป.`), หน่วยกิต (`น.`)
  - **คาบรวม ปวช.**, **คาบรวม ปวส.**, **คาบรวมทั้งหมด (นับตามเวลาจริง)** + เกณฑ์ที่กำหนด (`20–30` สำหรับ Leader / `25–35` สำหรับ Teacher) และสถานะ (`ผ่านเกณฑ์`/`ต่ำกว่าเกณฑ์`/`เกินเกณฑ์`)
  - ตารางรายวิชาที่สอนแบบขยายดูได้ต่อครู (รหัสวิชา, ชื่อวิชา, กลุ่มเรียน, ระดับชั้น, ทฤษฎี, ปฏิบัติ, หน่วยกิต, คาบจัดจริง, หมายเหตุเรียนร่วม).

**Report** (`/report`): eyebrow `Validator อิสระจาก solver`, h1 `ผลตรวจเงื่อนไข`; filter `ทั้งหมด` /
`เฉพาะที่ไม่ผ่าน`; 4 summary cards (ผ่าน, ไม่ผ่าน, ไม่ได้เปิดใช้, แถว output); cards per type (integrity,
basic, special) listing each check as an expandable row (number, name, status badge) with its violations
(and `และอีก n รายการ`).

**Export** (`/export`): eyebrow `ขั้นตอนที่ 4`, h1 `ส่งออกไฟล์`; four format cards: `output.csv` (download),
`Excel (.xlsx)` (all in one file + per view), `PDF (A4 แนวนอน)` (preview buttons per view), `QR code ติดหน้าห้อง`
(QR PDFs per view + `เปิดหน้าตารางสาธารณะ`); then a preview table of the first 12 output rows.

**Settings** (`/settings`, `?tab=users`): eyebrow `บัญชีของฉัน`, h1 `ตั้งค่า`. Tabs `โปรไฟล์` and (admin)
`ผู้ใช้งาน`.
- Profile card: avatar 112 with `เปลี่ยนรูป` (accept png/jpeg/webp/gif/bmp ≤ 10 MB; centre-crop to a square,
  draw on a 256 × 256 canvas over white, `toDataURL('image/jpeg', 0.85)`) and `ลบรูป`; `ชื่อที่แสดง`;
  facts (username, role badge, linked teacher); `บันทึกโปรไฟล์`. The top bar updates immediately.
- Password card: current, new (≥ 6), confirm, `แสดงรหัสผ่าน` checkbox, inline errors, `เปลี่ยนรหัสผ่าน`.
- Users tab (`<app-users>`): table (avatar + name, username, role, linked teacher, status), add/edit dialog
  (username, name, role, teacher, password = reset), delete with confirm, and
  `สร้างบัญชีครูที่ยังไม่มี (<n>)`: one `teacher` account per teacher without one (username = teacher id
  lowercased, random temporary password shown once in a dialog with `คัดลอกทั้งหมด`).

**Public** (`/p`, `/p/:view/:id`, no login): a slim maroon header with the college and `เข้าสู่ระบบ`;
index = segmented view + search + cards linking to each timetable; view = the read-only sheet with the
title and last update time. Show `ยังไม่มีการเผยแพร่ตารางเรียน` when disabled.

### 10.6 Shared components (`src/app/shared`)
- `Icon` (`app-icon`, inputs `name`, `size` default 20): inline Lucide 24×24 paths, stroke 2, `currentColor`,
  `aria-hidden`. Names used: dashboard, database, sliders, calendar, shield, download, upload, play, refresh,
  plus, pencil, trash, x, check, alert, info, search, undo, sheet, file, users, user, door, book, clock,
  sparkles, chat, bot, send, minus, menu, chevron, external, move, layers.
- `Avatar` (`app-avatar`, inputs `src`, `name`, `size`): the image, or the first character of the name on a
  maroon circle.
- `ConfirmDialog` (§10.2), `PdfPreview` (`app-pdf-preview`: modal up to 1180 px wide, full height, iframe of
  the inline PDF URL, buttons `พิมพ์` (prints the iframe), `ดาวน์โหลด PDF`, close; loading text
  `กำลังสร้างเอกสาร…`), `ChatWidget` (§11.4).

---

## 11. Chatbot (offline, Thai, rule-based)

Files: `chatbot/nlu.js` (entities + intents), `chatbot/bot.js` (handlers), `chatbot/knowledge.js`
(**static content, written by you from Part D.3**: `CONSTRAINTS` texts for user-defined constraints,
`PAGES`, `HOWTO`, `ALGORITHM`).

### 11.1 Entities — `extract(text, ctx)`
`normalize`: Thai digits → Arabic, collapse spaces, trim, lowercase. Returns `{ groups, teachers, rooms,
subjects, days, periods, numbers, seed, randomSeed, on, off, target? }`.
- groups: `g01`/`g1`/`G 1` → `G01` (or `G1`) if it exists; a group name in the text; `กลุ่ม(เรียน)?(ที่)? <n>`.
- teachers: `t1`/`T01` → `T01`; teacher first names (prefix ครู/นางสาว/นาง/นาย removed). Remove all subject
  names from the text first; a first name that also occurs inside any subject name counts only as `ครู<name>`.
- rooms: `631`, `r631`, `ห้อง 631`, `ห้องเรียน 631` → match `room_id` or `room_name` or `R<digits>`.
- subjects: `\d{5}-\d{4}` ids that exist; subject names (≥ 4 chars) in the text (plus `ลูกเสือวิสามัญ`, `กิจกรรม`).
- days: จันทร์ อังคาร พุธ พฤหัส ศุกร์ เสาร์ อาทิตย์ / mon…fri; `วันนี้` and `พรุ่งนี้` (Asia/Bangkok).
- periods: `คาบ(ที่)? a [-|–|ถึง b]` → the range (existing periods only).
- target (move): `ไป(ที่|ยัง)? (วัน)? <day>? … คาบ(ที่)? <n>` → `{ day | null, period }`.
- seed: `seed (=|:|เป็น|ค่า)? <digits>`; `randomSeed`: `สุ่ม seed|seed ใหม่|random`.
- numbers: after `ข้อ`, `เงื่อนไข(ที่|ข้อ)?` or `c`, constraint ids matching `I1..I4`, `B1..B6`, `S1..S3` (or plain numbers `1..13` mapped to the check list).
- on/off: `(เปิด|ปิด) (เงื่อนไข|ข้อ)? <ids or ทั้งหมด>` → toggleable special constraint ids `S1`, `S2`, `S3` (plus Thai keywords `หัวหน้า`, `ครูธรรมดา`, `ช่องว่าง`).

### 11.2 Intents — `detectIntent(text, ents)`: ordered rules, first match wins (t = normalized text)
```js
greeting      /^(สวัสดี|หวัดดี|hello|hi|ดีจ้า|ดีครับ|ดีค่ะ)/ and length < 20
thanks        /(ขอบคุณ|ขอบใจ|thank)/ and length < 25
help          /(ทำอะไรได้|ช่วยอะไรได้|ความสามารถ|ใช้ยังไง$|^help$|^ช่วยด้วย|เมนู|คำสั่ง)/
clear         /^(ล้างแชท|เริ่มใหม่|clear)$/
algorithm     /(อัลกอริทึม|algorithm|csp|annealing|ทำงานยังไง|ทำงานอย่างไร|หลักการ)/
howto         /(วิธี|ยังไง|อย่างไร|ทำไง|how)/ and not /(ทำไม)/
navigate      /(ไปหน้า|เปิดหน้า|พาไป|ไปที่หน้า)/
diagnose      /(จัด(?:ตาราง)?ไม่ได้|จัด(?:ตาราง)?ไม่สำเร็จ|วิเคราะห์สาเหตุ|หาสาเหตุ|diagnose|ทำไม.*ไม่สำเร็จ)/
best_seed     /(seed\s*ที่ดีที่สุด|หา\s*seed|ค้นหา\s*seed|best\s*seed|seed\s*ดีสุด|ตารางที่ดีที่สุด)/
save_seed     /(บันทึก|เซฟ|save)\s*seed/
find_slot     /(หาช่อง|ช่องว่างให้|ย้ายไปไหน|ย้ายไปที่ไหน|ควรย้าย|ย้ายได้ที่ไหน|แนะนำช่อง)/
move          /(ย้าย|สลับ)/
export        /(ส่งออก|ดาวน์โหลด|export|pdf|excel|xlsx|csv|พิมพ์ตาราง|ปริ้น|print)/
solve         /(จัดตาราง|รัน|run|solve|สุ่ม\s*seed|seed\s*ใหม่)/ and not /(ผล|สถานะ)/
warnings      /(ข้อสังเกต|คำเตือน|ปัญหาข้อมูล|ข้อมูลผิด|warning|ข้อมูลมีปัญหา)/
explain       numbers.length > 0 and /(คืออะไร|หมายถึง|อธิบาย|คือ)/ and not /(ทำไม|ไม่ผ่าน)/
validation    /(ผ่าน|เงื่อนไข|ผลตรวจ|ชนกัน|ชน|ผิดเงื่อนไข|ละเมิด|validator|ตรวจ)/
free_resources /(ว่าง)/ and /(ห้องไหน|ครูคนไหน|ครูใคร|ห้องอะไร|ใครว่าง)/
free          /(ว่าง)/
load          /(กี่คาบ|ภาระ|ชั่วโมงสอน|workload|สอนเยอะ|สอนมาก|สอนน้อย|จำนวนคาบ)/
room_usage    /(การใช้ห้อง|ใช้ห้อง|ห้องไหนใช้|อัตราการใช้)/ and no room entity
summary       /(สรุป|ภาพรวม|overview|สถานะ)/
at_time       a day and a period, and no group/teacher/room
subject       a subject, and no group/teacher/room
schedule      any group/teacher/room, or /(ตาราง|เรียนอะไร|สอนอะไร)/
→ otherwise 'unknown'
```

### 11.3 Replies — `reply(message, chatCtx, env)`
`env = { data, config, ctx, rows, meta, validation }`. Returns `{ text, cards, suggestions, context, intent }`.
Target = first group, else teacher, else room, else the previous `chatCtx` (marked `fromContext`), so
"แล้ววันพุธล่ะ" follows up on the last target. Card types: `table { title, columns, rows, link? }`,
`list { title, items, ask? }` (ask = items are clickable questions), `action { title, lines, status, action:
{ kind, payload, label, danger? } }` (needs a confirm click; admin only), `buttons { items: [{ label, action }] }`
(`kind: ask | navigate | export`; `auto: true` runs immediately). Intents that need a timetable answer
`ยังไม่มีตารางเรียนในระบบ ต้องจัดตารางก่อนจึงจะตอบคำถามนี้ได้` with a `solve` action card.
Handler behaviour (Thai text, `**bold**` allowed):
- greeting / thanks / clear / unknown (`ขอโทษครับ ผมยังไม่เข้าใจ "<msg>" ...`); help = 4 `list` cards
  (ถามข้อมูลตาราง, วิเคราะห์และอธิบาย, สั่งงาน (กดยืนยันก่อนทำ), ช่วยใช้งานระบบ) of example questions.
- algorithm → `ALGORITHM`; howto → matching `HOWTO` steps + a navigate button; navigate → `auto` button.
- summary (counts, timetable status, seed), warnings (list + button to `/data`), explain (`CONSTRAINTS`
  name and detail; for toggleable special constraints whether each is on), validation (table of all checks with a link to `/report`, or
  for given numbers: pass/fail, common cause `why`, fix, and up to 10 violations).
- schedule: a table วัน | คาบ | วิชา | ครู/กลุ่ม/กลุ่ม·ครู | ห้อง for the target, limited to the asked days and
  periods, with a link to `/timetable?view&id`; sets the context.
- free: free usable periods per day (compressed like `1-3, 6`), noting any blocked slots defined by user constraints.
- free_resources: free rooms grouped by type, or free teachers (`ครู|ใคร` in the text) for the given day(s)
  and period(s); any configured break/blocked period is answered specially.
- at_time: who studies what at a day + period. subject: hours, tags (from user-defined constraints, if any),
  teachers and where it is scheduled.
- load: one teacher (periods per day and subjects), one group (total), or all teachers sorted.
- room_usage: periods and % per room, unused rooms counted.
- solve: action card (seed, enabled specials, block/day limits) with payload `{ constraints, seed }`.
- diagnose / best_seed (count from `<n> seed|ครั้ง|รอบ|ตัว`, 2–60, default 20) / save_seed (from
  `meta.stats`): action cards.
- export: a button (`ดูตัวอย่าง / พิมพ์ PDF` opens the preview; otherwise download) for type pdf/xlsx/csv.
- move: find the span (subject + group, optional source day/period; ask which span if several), preview with
  `moveSpan` + validation before/after, action card (danger + `ย้ายทั้งที่ไม่ผ่าน` if it breaks more checks).
- find_slot: every target window where all groups of the span are free and a pure move keeps the failed
  count ≤ the current one; sorted by period then day; up to 8 buttons that ask the matching move.

### 11.4 Chat widget (frontend)
- `ChatService`: signals `open`, `busy`, `unread`, `messages` (≤ 80 kept), `pdfUrl`; history in
  `localStorage` key `tt-chat-v1:<username>` (`{ messages, context }`), loaded when the user changes;
  `send(text)` → POST `/api/chat` with the stored context; action confirm → POST `/api/chat/action`, then
  `AppState.refresh()` and `bump()` when `refresh` is true; `ask` sends the payload message; `navigate`
  routes; `export` opens the PDF preview or downloads; `clear()`.
- UI: a 60 px round maroon button fixed bottom-right (22 px) with an unread badge; a Messenger-style panel
  above it: header (bot avatar, `ผู้ช่วยจัดตาราง`, green dot `ออฟไลน์ · ตอบทันที`, clear and minimise
  buttons), message list (user bubbles right in maroon, bot bubbles left; cards rendered per type; time
  under each), typing dots while busy, suggestion chips, and a composer (textarea, Enter sends,
  Shift+Enter new line, max 500, placeholder `พิมพ์คำถาม เช่น ตาราง G1 วันจันทร์`). Escape closes.

---

## 12. Test contract (`backend/test/`, written first from Part D.2 — then do not weaken)

`npm test` runs three scripts with the CSV data in `CSV/`. They require these modules and exports:

| module | exports used |
|---|---|
| `src/services/store.js` | `init`, `getData` |
| `src/services/config.js` | `loadConfig`, `mergeConfig`, `DEFAULT_CONFIG` |
| `src/services/context.js` | `buildContext` (ctx fields: `subjects`, `teachers`, `groups`, `rooms` + user constraint helpers) |
| `src/services/solver.js` | `solve` → `{ status, rows, stats, warnings, message, errors }` |
| `src/services/validator.js` | `validate` → `{ passed, checks: [{ id, passed, violations, name }] }` |
| `src/services/chatbot/bot.js` | `reply(message, chatCtx, env)` → `{ intent, text, cards, context }` |
| `src/services/chatbot/nlu.js` | `extract(text, ctx)` |

- `validator.test.js`: the solver output (default config) passes; then one deliberate mutation per
  user-defined basic/special check must be caught by the matching check.
- `chatbot.test.js`: Thai messages → expected intent and entities, plus 1 follow-up that keeps target G3.
- `run-solver.js --all`: combinations of user-defined special constraints; each must solve and pass the validator.
All test output lines must end with `PASS`.

---

## 13. Docker and run

- `Dockerfile` (Part D.5): stage 1 `node:24-alpine` builds the frontend (`npm ci`, `npx ng build
  --configuration production`); stage 2 installs backend production deps; stage 3 copies `CSV/`, backend
  `src`, `fonts`, `assets`, `data`, `node_modules` and `frontend/dist`, runs as `node`, `TZ=Asia/Bangkok`,
  exposes 3000, healthcheck `GET /api/health`, `CMD node src/server.js` from `/app/backend`.
- `docker-compose.yml` (Part D.5): service `timetable`, image `timetable-ai:latest`, container
  `timetable-ai`, port `3000:3000`, volumes `timetable-data:/app/backend/data` and
  `timetable-output:/app/backend/output`, `restart: unless-stopped`.
- `backend/data` must exist in the build context (create it with a `.gitkeep` if empty); the server copies
  the CSV seed files into it on first start.
- Dev: `cd backend && npm run dev` and `cd frontend && npx ng serve` (proxy to 3000), open http://localhost:4200.
