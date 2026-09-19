# Cabinet note — floor add / delete

Operator-floor chrome only. This is not a broker action and not a books wipe.

## Controls

| Control | Where | What it does |
| --- | --- | --- |
| Delete | `×` on every live and offline square (`aria-label="Delete node"`) | Confirm dialog, then hide that id from the grid |
| Add | `+` empty slot (`aria-label="Add node"`) | Restore a previously removed catalog ticker |

Catalog (seed order): `src/data/floor-nodes.ts`. Hidden ids: `localStorage` key `resonance-2.floor-hidden` via `src/lib/floor-registry.ts`.

## What delete does **not** touch

- `src/data/xrp-sleeves.ts` / Flare vault `28273`
- `src/data/sui-sleeves.ts`
- `src/data/fills.ts` / `/log` and the durable fill store (`POST /api/fills`)
- Broker keys, env, gas wallet addresses

Sleeve files stay on disk (soft-archive: hidden from the floor, not deleted). Restoring XRP or SUI re-stands the live face from those files. Restoring an offline ticker brings the dashed placeholder back.

## Confirm

`src/components/floor-dialog.tsx` — explicit Cancel / Remove. No one-click wipe.

## Next brick

If the floor needs to sync across devices, replace the localStorage list with a server cookie or store. Do not start deleting data files when a square is hidden.
