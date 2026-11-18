# Miroo

A collaborative online whiteboard with workspaces and teams. "Miroo" is a working codename; the product
name lives in `src/lib/brand.ts`.

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

**Collaboration**
- Real-time multi-user editing (Yjs CRDT over WebSockets), saved to Postgres
- Live cursors with names, presence avatars, and highlights of what others have selected
- Comments pinned to the canvas, with replies and resolve
- Board templates: Kanban, Retrospective, Brainstorm, Flowchart

**Workspaces & teams**
- Accounts (email + password)
- Multiple workspaces per user, with a workspace switcher
- Workspace roles: Owner, Admin, Member, Viewer
- Invite links with a role, pending invite list, revoke
- Teams inside a workspace, with leads and members
- Board visibility: whole workspace, a team only, or private; plus "anyone with the link can view / edit" share links
- Starred boards, filter by team, search

## Stack

| Part | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4 |
| Canvas | Konva / react-konva |
| Real-time | Yjs + y-protocols; small Node WebSocket server in `server/realtime.ts` |
| Database | Postgres via Prisma |
| Auth | Own session cookie (JWT signed with `AUTH_SECRET`, bcrypt passwords) |

## Run it locally

Requires Node 20+ and Postgres 16 (or Docker).

```bash
docker compose up -d          # or point DATABASE_URL at your own Postgres
cp .env.example .env          # then set AUTH_SECRET: openssl rand -hex 32
npm install
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

## Deploying

- **Web app**: any Node host (Vercel, Railway, Fly.io, Render). Set `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `NEXT_PUBLIC_REALTIME_URL`.
- **Realtime server**: a long-running Node process (`npm run start:realtime`) on Railway, Fly.io or Render, with the same `DATABASE_URL` and `AUTH_SECRET`. Use `wss://` in `NEXT_PUBLIC_REALTIME_URL`.
- **Database**: managed Postgres (Neon, Supabase, Railway, RDS).

## Not yet built

- Google / SSO sign-in and password reset
- Sending invite emails (invites are links you copy for now)
- Touch pinch-zoom on phones and tablets
- Board version history, board thumbnails, more templates
- Automated tests and CI
- Image storage in object storage (S3/R2) instead of Postgres
