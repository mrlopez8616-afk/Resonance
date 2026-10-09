<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Floor drill-down

KEEP IT CLEAN, DRILL DOWN ALWAYS. This is the Resonance 2 operator floor (`resonance-2`).

- The home page shows only the parent cards: Crypto, AI Stocks, Fitness, Finance, Fight Desk. No child squares or detail lists on home. The headline stays the one value line. Under it, a card may show up to three short secondary lines built from data the page already loaded. A thin This Week strip may sit above the cards.
- A parent page shows only its child nodes as cards. Details live one level down, on that node's page. Fight Desk shows Bankroll and Fights. Fights links to `/fights`.
- A back control or breadcrumb goes up exactly one level.
- A stored fill with a null sleeve is corrected by a migration that names that order id. Do not retag every null sleeve.
- VALUE FIRST. On a value node card the top headline number is the position's current value in dollars (quantity held times the live price). The live price sits under it as a smaller line. Quantity comes only from sleeve quantities, sleeve prints, or live store rows, and the price is a live price. No position or quantity source: show the live price as the secondary line with "no position" or "not connected". Never invent a value. A parent number is the sum of its children's real values; if a child has no value, say so (for example "value of 4 of 6"). New value nodes use the shared value card.

## Login

The floor is one user, Andres. Password plus a 6-digit authenticator code creates a 30-day sliding session. Passkeys are optional on `/settings/security` and are not offered after sign-in. If `AUTH_PASSWORD_HASH`, `AUTH_TOTP_SECRET`, or `AUTH_SESSION_SECRET` is missing, the site stays locked.

Set these on the Vercel project before that change is merged. From `resonance-2`, `npm run auth:setup` prints them and does not write a file.

- `AUTH_SESSION_SECRET` — 64 hex characters (`openssl rand -hex 32`). HMAC key for session ids and passkey challenges.
- `AUTH_PASSWORD_HASH` — argon2id PHC string, `$argon2id$v=19$m=19456,t=2,p=1$...`
- `AUTH_TOTP_SECRET` — base32, no spaces. Example shape: `JBSWY3DPEHPK3PXP`
- `WEBAUTHN_RP_ID` — `resonance3.vercel.app`
- `WEBAUTHN_ORIGIN` — `https://resonance3.vercel.app`

Server components call `requireSession({ role? })` (redirects) or `getSession()` from `resonance-2/src/lib/auth-session.ts`. Both return `{ userId, username, role }`. `requireRole('owner')` is the same check for a later owner-only page and is unused. Only username `andres` can sign in. A second person is a row in `users`, not a screen:

```sql
INSERT INTO users (username, role, password_hash, totp_secret, created_at)
VALUES ('carla', 'operator', '<argon2id phc>', '<base32>', now());
```

This deploy still rejects that login. Read APIs call `authorizeReadRequest()`. Machine routes keep `Authorization: Bearer $RESONANCE_SYNC_SECRET`. Fitness ingest keeps `X-Fitness-Token`.

## Build/deploy notes

Vercel build budget: only resonance3 production builds (vercel.json ignoreCommand + previews disabled on resonance3). Verify PRs with local npm test + next build; push once per PR.
