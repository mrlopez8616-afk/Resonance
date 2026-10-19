# Cabinet note — fighter careers

`POST /api/fights/fighters` stores one fighter and that fighter's UFC fights. `GET /api/fights/fighters/[slug]` reads them. The page is `/fights/fighters/[slug]`. Fight and event pages link each fighter name there.

Migration `033_fighter_careers` adds `fighters` and `fighter_fights`. This file inserts no rows. A fight is one row per fighter, date, and opponent. Posting that key again updates the row and does not add a second one.

The numbers come from public UFC stats (ufcstats.com) that Fight Desk posts. This app does not fetch them. A missing stat stays null and the page prints `not recorded`. A posted `0` is kept. Averages use only fights that posted that stat, and the tile shows `n`.

A settled fight result can add a row on read when the bout date is already on the calendar, or on a breakdown slot that is `YYYY-MM-DD`. That row has the result, method, round, and time. Its stats stay empty until Fight Desk posts them. A bet settlement does not invent the fight.

| Piece | Value |
| --- | --- |
| Auth | POST uses `Authorization: Bearer $RESONANCE_SYNC_SECRET`. GET uses a session or that Bearer. |
| Body | `{ name, slug?, metadata?, fights: [...] }` |
| Upsert | `(fighter slug, date, opponent)` |

## Fight fields

| Field | Also accepted | Stored |
| --- | --- | --- |
| `date` | | `YYYY-MM-DD` |
| `event` | | text, optional |
| `opponent` | | text |
| `result` | `no_contest` | `win`, `loss`, `draw`, `nc` |
| `method` | | text, optional |
| `round` | | 1–5, optional |
| `time` | | `m:ss`, optional |
| `sigStrikesLanded` | `sig_strikes_landed` | integer, optional |
| `sigStrikesAttempted` | `sig_strikes_attempted` | integer, optional |
| `totalStrikesLanded` | `totalStrikes`, `total_strikes_landed` | integer, optional |
| `totalStrikesAttempted` | `total_strikes_attempted` | integer, optional |
| `takedownsLanded` | `tdLanded` | integer, optional |
| `takedownsAttempted` | `tdAttempted` | integer, optional |
| `subAttempts` | `sub_attempts` | integer, optional |
| `controlTimeSeconds` | `control` as seconds or `m:ss` | seconds, optional |
| `knockdowns` | `kd` | integer, optional |

`metadata` is an optional object on the fighter. Omit it to leave the stored object alone. `null` clears it.

The five tiles compare the last 3 fights with the career average: finish rate, times finished, takedowns per 15 minutes, significant strikes per 15 minutes (per fight only when no fight has a clock), and control time. An up arrow is better than the career line. A down arrow is worse.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/fights/fighters \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bravo","fights":[{"date":"2026-10-24","event":"UFC 333","opponent":"Alpha","result":"win","method":"KO/TKO (Punch)","round":1,"time":"1:00","sigStrikesLanded":10,"sigStrikesAttempted":20,"takedownsLanded":1,"takedownsAttempted":2,"control":"1:00","knockdowns":1}]}'
```
