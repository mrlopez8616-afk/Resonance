<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Floor drill-down

KEEP IT CLEAN, DRILL DOWN ALWAYS. This is the Resonance 2 operator floor (`resonance-2`).

- The home page shows only the parent cards: Crypto, AI Stocks, Fitness, Finance, Predictions. No child squares, lists, or detail on home. A card may carry at most one line of real summary.
- A parent page shows only its child nodes as cards. Details live one level down, on that node's page. Predictions shows Bankroll and Fights. Fights links to `/fights`.
- A back control or breadcrumb goes up exactly one level.
- VALUE FIRST. On a value node card the top headline number is the position's current value in dollars (quantity held times the live price). The live price sits under it as a smaller line. Quantity comes only from sleeve quantities, sleeve prints, or live store rows, and the price is a live price. No position or quantity source: show the live price as the secondary line with "no position" or "not connected". Never invent a value. A parent number is the sum of its children's real values; if a child has no value, say so (for example "value of 4 of 6"). New value nodes use the shared value card.
