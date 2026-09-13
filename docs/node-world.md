# Node world overlays

Phase-0 home (`/`) is the twelve-node Factorio-style map. Overlays are visibility layers on that locked universe. They do not move capital, attest, place trades, or spend.

## Barney path

1. Merge this PR.
2. Vercel preview **Ready**.
3. Unlock (site password if `RESONANCE_APP_PASSWORD` is set).
4. Open `/`.
5. Use the **bottom hotbar** (not a top rack): toggle **Capital flow**, **Sleeves**, and **Red locks**; click **World / Node / Guts** or +/−. Wheel zoom still works.
6. Confirm: belts ride a main-bus gutter between the two rows (linked nodes + Xaman→XRP + queued Agentic dock). No extra nodes. No dollar amounts.
7. Click one physical box (PWR / ETN / VRT / GEV / CEG / HUBB) and one crypto box (XRP / FLR / BTC / ETH / SOL / SUI). Physical interiors use the electrification skin; crypto interiors use the liquidity (tank/valve) skin. Existing Web2 / Hedera / XRPL stubs stay. Red locks stay **OFF LIMITS** / welded — visible only.
8. Left rail still opens Decisions, Treasury, System health, Todos.

Sensors and Carla remain stubbed. Do not spend from this board.

## Bottom hotbar

Layer toggles, altitude (world / node / guts), +/−, and the selected-node chip live on a floor strip. The left rail stays the OS toolbox. Overlay state is the same as before — the rack moved, it was not duplicated.

## Capital flow / main bus

Pipes are built from existing data only:

- `node.links` (today: XRP↔FLR)
- Xaman treasury well → XRP node
- queued `agenticIntents` from the Agentic dock under the well

Belts drop to a kind-lane in the horizontal gutter, travel, then rise. No private dollar amounts or ticket sizes. Light CSS dash motion; `prefers-reduced-motion` turns it off.

## Plant interiors

Click a locked node (or zoom to Node / Guts). Same twelve tickers.

- Physical AI (`PWR` `ETN` `VRT` `GEV` `CEG` `HUBB`) → electrification skin
- Digital (`XRP` `FLR` `BTC` `ETH` `SOL` `SUI`) → liquidity skin (tanks / valves)

Web2 record, Hedera stamp, XRPL R1, sleeve overlay, and red-lock stubs stay. Xaman principal and RH Main remain welded shut.

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

Live sensors, Carla / human-bridge, Mainnet, new secrets, node-list edits without founder auth.
