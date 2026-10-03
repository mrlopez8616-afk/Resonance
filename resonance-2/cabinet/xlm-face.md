# Cabinet note — XLM removed from the floor

XLM is not a floor node. There is no homepage square, sleeve seed, spot ticker, or nodes-strip entry.

The three confirmed Robinhood Agentic fills stay on the operator log:

| Side | Order | Qty | Avg price | Notional | Filled |
| --- | --- | --- | --- | --- | --- |
| buy | `6abbe0e4-575c-4abe-a90e-90368b43a1b6` | `1891.36` | `0.22928558` | $433.67 | `2026-09-29T12:01:40-04:00` |
| buy | `6abbe113-41cb-4aa8-9e7c-0a986335b95a` | `18.95` | `0.2289895` | $4.34 | `2026-09-29T12:02:27-04:00` |
| sell | `6abed758-0215-4703-8d11-c412686df9be` | `1910.31` | `0.216176882` | $412.96 | `2026-10-01T17:57:44-04:00` |

They appear under All on `/log`. `/log?ticker=XLM` lists those rows. Replaying those order ids appends the log row and does not write `sleevePrints`. A different XLM order is not a locked node (400). A stored fill whose ticker is not a floor node stays in the log and does not crash the desk.

Do not put the square, the sleeve file, or the spot feed back.
