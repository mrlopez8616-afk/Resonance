# Node world overlays

Phase-0 home (`/`) is the twelve-node Factorio-style map. Overlays are visibility layers on that locked universe. They do not move capital, attest, place trades, or spend.

## Barney path

1. Merge this PR.
2. Vercel preview **Ready**.
3. Unlock (site password if `RESONANCE_APP_PASSWORD` is set).
4. Open `/`.
5. Toggle **Capital flow**, **Sleeves**, and **Red locks**.
6. Confirm: belts/pipes between linked nodes + Xaman→XRP + queued Agentic dock; Agentic vs founder/Main/thesis chips on the same twelve boxes; Xaman well and RH Main stamped **OFF LIMITS**.

Wheel zoom, Stamps, left rail, gate, Decisions attest/mirror, Blob sync, and treasury red-lock rules stay as they were. Sensors and Carla remain stubbed.

## Capital flow

Pipes are built from existing data only:

- `node.links` (today: XRP↔FLR)
- Xaman treasury well → XRP node
- queued `agenticIntents` from the Agentic dock under the well

No private dollar amounts or ticket sizes on the overlay. Light CSS dash motion; `prefers-reduced-motion` turns it off.

## Sleeves

Same twelve tickers. Live model wins:

- `node.sleeve === "main"` → founder Main
- `node.sleeve === "agentic"` or a queued Agentic intent → Agentic
- a node can sit on both (PWR / VRT / ETN / GEV in seed)

If neither assignment exists, the node uses [`FOUNDER_THESIS_SLEEVE_STUB`](../src/lib/node-world.ts). Edit notes there. Do **not** add or remove tickers. Do not invent a thirteenth node.

## Red locks

Visibility only. No spend actions.

- Xaman / Flare-vault principal well → **OFF LIMITS**
- every RH Main learning lot (`node.sleeve === "main"`) → **OFF LIMITS**

Resonance still never spends RH Main or Xaman principal.

## Out of scope (still)

Live sensors, Carla / human-bridge, full animated belt-network perfection, Mainnet, new secrets, node-list edits without founder auth.
