# Schema

A collaborative online whiteboard for architecture teams, with workspaces and teams. The product name lives in
`src/lib/brand.ts`.

## Features (MVP)

**Canvas**
- Infinite canvas with pan (wheel, space+drag, hand tool, middle mouse) and zoom (Ctrl/⌘+wheel, pinch on trackpads, zoom controls, fit to content)
- Sticky notes, rectangles, ellipses, diamonds, free text, freehand pen, images (upload, paste or drag and drop), frames
- Connectors/arrows that attach to shapes and follow them when moved
- Select, multi-select (shift-click, marquee), move, resize, rotate, lock, bring to front / send to back
- Colors, font sizes, inline text editing (double-click)
- Undo/redo, copy/paste, duplicate, delete, arrow-key nudge, keyboard shortcuts for every tool
- Moving a frame moves everything inside it
- Export the board as PNG

**Content blocks**
- Task cards with status, assignee (any workspace member) and due date, with an overdue warning
- Tables: double-click a cell to edit, Tab moves to the next cell, add or remove rows and columns, optional header row
- Mind maps (G): Tab adds a branch, Enter adds a sibling; branches are colored and connected automatically
- Diagram shapes: triangle, hexagon, pentagon, parallelogram, trapezoid, database, star, block arrow, chevron, speech bubble, document, cross
- Embeds: paste or add any link to get a preview card; YouTube, Vimeo, Loom and Figma open inline

**Export, import & history**
- Export the board or the selection as PNG (standard or high resolution) or PDF
- Export frames as PDF pages, one per frame, sized 1 board unit = 1 pt, so plans imported from a PDF print at their original paper size and scale
- Import a CSV (or TSV) as sticky notes, task cards (reads title, status, assignee and due date columns) or a table
- Version history: an automatic snapshot every 10 minutes of editing, named versions, preview any version, restore it (the current board is saved first, and the restore can be undone)

**Collaboration**
- Real-time multi-user editing (Yjs CRDT over WebSockets), saved to Postgres
- Live cursors with names, presence avatars, and highlights of what others have selected
- Comments pinned to the canvas, with replies and resolve
- Board templates: Kanban, Retrospective, Brainstorm, Flowchart

**Architecture tools** (bottom toolbar)
- Import plans: PDFs (every page becomes a locked sheet, rendered in the browser with pdf.js) or images
- Set the scale per plan, either by drawing over a known dimension or, for PDFs, by entering the drawing scale (1:100…); or set one scale for the whole board
- Measure lengths (dimension lines) and areas with perimeter, in m, cm, mm or ft-in; Shift snaps angles to 15°
- Walls drawn at 20 cm thickness at plan scale
- Redlining: revision clouds, highlighter, red line and text colors
- Plan symbol library sized to real dimensions: doors, windows, stairs, columns, bathroom and kitchen fixtures, furniture, trees, cars, north arrow, section and level markers

**Facilitation & presenting**
- Shared timer with pause, +1 minute and an alarm
- Voting sessions: set votes per person, optionally hide results until the end, ranked results
- Private mode: new notes stay face-down for everyone else until the facilitator reveals them
- Follow a collaborator's view (click their avatar), or bring everyone to your view
- Emoji reactions that float up on everyone's screen
- Presentation mode: frames become slides in reading order; "present to everyone" makes others follow along

**Accounts & security**
- Email and password, with email confirmation and password reset (a reset signs you out everywhere else)
- Continue with Google
- Single sign-on per workspace with OpenID Connect (Okta, Microsoft Entra ID, Google Workspace, Auth0, OneLogin…), optionally required for everyone at the company's domains
- Company domains verified by DNS TXT record; people who sign up with a verified company email can join the workspace automatically
- Audit log for admins: invites, role changes, teams, boards, sharing, folders, templates, domains and SSO, with filters and CSV export
- Invite emails (through SMTP; printed to the server log when SMTP isn't configured)

**AI assist** (needs an Anthropic API key)
- Group the selected sticky notes by theme: each theme gets its own frame
- Summarize the selection into key points and next steps
- Add idea notes on a topic, without repeating what's already on the board
- Turn a description into a flowchart (start/end, steps, decisions with Yes/No, documents) or a mind map
- Results land on empty space next to your work, and Undo removes them
- Only the text of the items you use is sent to Anthropic. Requests use `claude-opus-5-5` (change with `AI_MODEL`) with server-side fallbacks on, so if a request is declined by a model's safety filters, the API retries it on a fallback model. Each person can make `AI_REQUESTS_PER_HOUR` requests an hour (default 60)

**Workspaces & teams**
- Multiple workspaces per user, with a workspace switcher
- Workspace roles: Owner, Admin, Member, Viewer
- Invite links with a role, pending invite list, revoke
- Teams inside a workspace, with leads and members
- Board visibility: whole workspace, a team only, or private; plus "anyone with the link can view / edit" share links
- Folders to group a workspace's boards by project
- Custom templates: save any board as a template for the whole workspace
- Starred boards, filter by team, search

## Stack

| Part | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4 |
| Canvas | Konva / react-konva |
| Real-time | Yjs + y-protocols; room logic in `server/room.ts`, served by a Durable Object on Cloudflare or a small Node WebSocket server (`server/realtime.ts`) |
| Database | Postgres via Prisma (`pg` driver; Hyperdrive on Cloudflare) |
| Auth | Own session cookie (JWT signed with `AUTH_SECRET`, bcrypt passwords) |

## Run it locally

Requires Node 20+ and Postgres 16 (or Docker).

```bash
docker compose up -d          # or point DATABASE_URL at your own Postgres
cp .env.example .env          # then set AUTH_SECRET: openssl rand -hex 32
npm install                   # also copies the pdf.js worker into public/
npx prisma db push            # create the tables
npm run dev                   # web on :3000, realtime server on :1234
```

Open http://localhost:3000, sign up, and you land in your own workspace.

## How it fits together

```
Browser ──HTTP──▶ Next.js (pages, server actions, /api/*) ──▶ Postgres
   │                         │ mints a short-lived realtime token
   └──WebSocket (y-websocket protocol)──▶ server/realtime.ts ──▶ Postgres (Board.content)
```

- Each board's canvas is one Yjs document (`Board.content`). Elements are JSON objects in the `elements` map; see `src/lib/board/types.ts`.
- The browser asks `/api/boards/:id/realtime-token` for a token that says who it is and whether it may edit. The realtime server verifies it and drops document changes from read-only clients.
- Workspaces, teams, invites, comments and image assets are ordinary Postgres tables (`prisma/schema.prisma`).
- Permission rules are in `src/lib/permissions.ts`.

## Deploying to Cloudflare

Schema runs on Cloudflare Workers: the Next.js app through [OpenNext](https://opennext.js.org/cloudflare), live collaboration in a Durable Object per board (`cloudflare/boardRoom.ts`), and Postgres through Hyperdrive. The GitHub Actions workflow `.github/workflows/deploy-cloudflare.yml` deploys every push to `main` and can also be run by hand from the Actions tab.

**One-time setup**

1. **Cloudflare account on the Workers Paid plan** ($5/month). The app is about 3.5 MB compressed, over the free plan's 3 MB limit.
2. **A Postgres database.** Cloudflare doesn't host Postgres; [Neon](https://neon.tech)'s free tier works. Copy its connection string.
3. **Hyperdrive** (Cloudflare dashboard → Storage & databases → Hyperdrive → Connect database), using that connection string with Neon's connection pooling switched off and caching off. Put its ID in `wrangler.jsonc` under `hyperdrive` (or set a `HYPERDRIVE_ID` secret).
4. **API token** (My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template).
5. **In GitHub** (repository Settings → Secrets and variables → Actions), add:

   | Name | Kind | Value |
   |---|---|---|
   | `CLOUDFLARE_API_TOKEN` | secret | the token from step 4 |
   | `DATABASE_URL` | secret | the Neon connection string (used to update the schema on each deploy) |
   | `ANTHROPIC_API_KEY` | secret, optional | turns on AI assist |
   | `AUTH_SECRET` | secret, optional | signs sessions; without it, the first deploy generates one on the Worker and keeps it |
   | `APP_URL` | variable, optional | the public URL, if not the one in `wrangler.jsonc` (e.g. your own domain) |
   | `CLOUDFLARE_ACCOUNT_ID` | secret, optional | only if the token can reach more than one account |
   | `RESEND_API_KEY` | secret, optional | not needed on Cloudflare: email goes through Cloudflare Email Sending (see below) |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secrets, optional | "Continue with Google" (redirect URI `<APP_URL>/api/auth/oidc/callback`) |

6. Run **Actions → Deploy to Cloudflare → Run workflow**. A custom domain can be added afterwards under the Worker's Settings → Domains & Routes; set `APP_URL` to match.

**Email** goes through Cloudflare Email Sending (included in Workers Paid: 3,000 emails a month, then $0.35 per 1,000). Onboard the sending domain under Email Service → Email Sending, then set `EMAIL_FROM` in `wrangler.jsonc` to an address on it. This deployment sends from `no-reply@schema.robertovargas.dev`.

**Try the Worker locally**: put `AUTH_SECRET` and `APP_URL="http://localhost:8787"` in `.dev.vars`, then `npm run cf:preview`. It uses the local Postgres from `wrangler.jsonc`.

## Deploying on Node hosts

- **Web app**: any Node host (Vercel, Railway, Fly.io, Render). Set `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `NEXT_PUBLIC_REALTIME_URL`.
- **Realtime server**: a long-running Node process (`npm run start:realtime`) on Railway, Fly.io or Render, with the same `DATABASE_URL` and `AUTH_SECRET`. Use `wss://` in `NEXT_PUBLIC_REALTIME_URL`.
- **Database**: managed Postgres (Neon, Supabase, Railway, RDS).
- **AI assist**: set `ANTHROPIC_API_KEY` on the web app. Without it, the AI panel says it isn't set up and everything else works.

## Not yet built

- Touch pinch-zoom on phones and tablets
- Board thumbnails
- SAML single sign-on and SCIM user provisioning (SSO uses OpenID Connect, which every major identity provider supports)
- Templates keep image links to the board they came from; deleting that board removes those images
- Automated tests and CI
- Image storage in object storage (S3/R2) instead of Postgres
