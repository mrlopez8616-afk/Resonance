# OBS uploader

The PC posts one recording when OBS saves a file. The site keeps each file. `/n/youtube/gear` shows the latest recordings and the last time a post arrived.

Generate the token on [https://resonance3.vercel.app/settings/integrations](https://resonance3.vercel.app/settings/integrations). It is shown once. Only a sha256 digest is stored. Rotating it replaces the previous token.

## Request

```
POST https://resonance3.vercel.app/api/ingest/obs
X-Obs-Token: <token from /settings/integrations>
Content-Type: application/json
```

A missing or wrong token returns 401. The sync secret, the Health Auto Export token, the Factorio token, and the Printer token are not accepted.

## Body

| Field | Use |
| --- | --- |
| `fileName` | File name, such as `2026-11-04 15-02-11.mkv`. |
| `sizeBytes` | Whole number of bytes. Zero is allowed. |
| `durationSec` | Optional length in seconds. |
| `createdAt` | ISO time the file was created. |
| `folder` | Folder on the PC. |

Posting the same folder, file name, and `createdAt` again updates that row. A different file is kept.

A successful post returns `{ "ok": true }`.

## Page

`/n/youtube/gear` lists the latest recordings: name, length, size, and time. Last seen is the time of the newest post. OBS/PC is an automatic bridge on the system map.
