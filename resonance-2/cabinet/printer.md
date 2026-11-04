# Printer uploader

A script on the PC reads the HP OfficeJet Pro 9120e supplies page and posts that JSON here a few times a day. The site keeps every reading. `/n/printer` shows the newest one.

Generate the token on [https://resonance3.vercel.app/settings/integrations](https://resonance3.vercel.app/settings/integrations). It is shown once. Only a sha256 digest is stored. Rotating it replaces the previous token.

## Request

```
POST https://resonance3.vercel.app/api/ingest/printer
X-Printer-Token: <token from /settings/integrations>
Content-Type: application/json
```

The body is the raw JSON from `https://<printer>/cdm/supply/v1/suppliesPublic`, plus optional `printerModel` and `readAt`. A missing or wrong token returns 401. The sync secret, the Health Auto Export token, the Factorio token, and the OBS token are not accepted.

## Body

| Field | Use |
| --- | --- |
| `suppliesList` | Required array from the printer. |
| `suppliesList[].supplyType` | `inkCartridge` or `printHead`. The gauges use ink cartridges. |
| `suppliesList[].supplyColorCode` | `C`, `M`, `Y`, `K`, or `CMYK`. |
| `percentLifeDisplay` | Percent of life remaining. |
| `levelState`, `supplyState` | Mapped to `ok`, `low`, or `depleted`. |
| `selectabilityNumber` | Cartridge to buy, such as `936`, shown as HP 936. `supportedParts[].selectabilityNumber` is used when it is present. |
| `approximatePagesRemainingDisplay` | Optional. Stored with the snapshot. |
| `version` | Optional printer payload version. |
| `printerModel` | Optional. The node is the HP OfficeJet Pro 9120e. |
| `readAt` | Optional ISO time of the printer read. |

A successful post returns `{ "ok": true }`.

## Cadence

The PC posts a few times a day. A reading older than 24 hours is marked stale on `/n/printer`.
