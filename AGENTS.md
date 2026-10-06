<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Floor drill-down

KEEP IT CLEAN, DRILL DOWN ALWAYS. This is the Resonance 2 operator floor (`resonance-2`).

- The home page shows only the parent cards: Crypto, AI, Stocks, Fitness, Money, Fights. No child squares, lists, or detail on home. A card may carry at most one line of real summary.
- A parent page shows only its child nodes as cards. Details live one level down, on that node's page. Fights links to `/fights`.
- A back control or breadcrumb goes up exactly one level.
