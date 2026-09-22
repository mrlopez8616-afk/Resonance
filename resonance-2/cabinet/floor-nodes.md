# Cabinet note — floor add / delete

Operator-floor chrome only. This is not a broker action and not a books wipe.

## Controls

| Control | Where | What it does |
| --- | --- | --- |
| Delete | `×` on every painted live square (`aria-label="Delete node"`) | Confirm dialog, then hide that id from the grid. Hide only — sleeve files stay |
| Open log | Click a live square (not the `×`) | `/log?ticker=THAT` on the one fill store |
| Add | `+` empty slot (`aria-label="Add node"`) | Restore a previously removed catalog ticker |
| Paint | Homepage grid | Live faces plus the one `+` slot. Offline roster rows are not painted |

Catalog (seed order): `src/data/floor-nodes.ts`. Hidden ids: `localStorage` key `resonance-2.floor-hidden` via `src/lib/floor-registry.ts`.

## What delete does **not** touch

- `src/data/xrp-sleeves.ts` / Flare vault `28273`
- `src/data/sui-sleeves.ts` / RH Agentic `0` (sold) + Coinbase `33.7`
- `src/data/pwr-sleeves.ts` / RH Agentic `0.003917` shares
- `src/data/etn-sleeves.ts` / RH Agentic `0.005844` shares
- `src/data/vrt-sleeves.ts` / RH Agentic `0.009991` shares
- `src/data/gev-sleeves.ts` / RH Agentic `0.002640` shares
- `src/data/ceg-sleeves.ts` / RH Agentic `0.009617` shares
- `src/data/hubb-sleeves.ts` / RH Agentic `0.005566` shares
- `src/data/fills.ts` / `/log` and the durable fill store (`POST /api/fills`)
- Broker keys, env, gas wallet addresses

Sleeve files stay on disk (soft-archive: hidden from the floor, not deleted). Restoring XRP, SUI, PWR, ETN, VRT, GEV, CEG, or HUBB re-stands the live face from those files.

BTC, ETH, and SOL stay in `FLOOR_NODES` with status `offline`. They are not painted on the homepage while offline, including after a `+` restore. When a row flips to `live`, it paints again unless that id is still hidden. FLR stays in the locked-12 ingest roster and has no floor square. Do not invent a square for it.

## Confirm

`src/components/floor-dialog.tsx` — explicit Cancel / Remove. No one-click wipe.

## Next brick

If the floor needs to sync across devices, replace the localStorage list with a server cookie or store. Do not start deleting data files when a square is hidden.
