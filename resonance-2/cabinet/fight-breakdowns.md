# Cabinet note — fight breakdown submission stats

`POST /api/fights/breakdown` already stores a per-fight row for any event slug. These grappling fields are optional. They ride in the existing `stats` jsonb (`a` and `b`). No new table. A missing field is not stored, and the fight and event pages print `not recorded`. They do not print `0` and they do not guess.

The numbers come from public UFC stats (ufcstats.com or UFC.com) that Fight Desk posts. This app does not fetch them.

| Piece | Value |
| --- | --- |
| Auth | `Authorization: Bearer $RESONANCE_SYNC_SECRET` |
| Body | `site_analysis.json` (`event` or `eventSlug`, plus `fights`), `{breakdowns:[...]}`, or a bare array |
| Events | Any event. `UFC 333` on Oct 24 is `event: "UFC 333"` (slug `ufc-333`) with the bout on `fights` |

## Per fighter

Put the fields on `data[].A` and `data[].B`, or on `stats.a` and `stats.b`.

| Field | Also accepted | Shown as |
| --- | --- | --- |
| `wins_sub` | `subWins`, `sub_wins` | Sub wins |
| `sub_win_pct` | `subWinPct`, `sub_pct` | Sub win % |
| `loss_sub` | `timesSubmitted`, `times_submitted` | Times submitted |
| `subavg` | `subAttempts`, `sub_avg` | Sub attempts/15 min |
| `tdavg` | `tdAvg`, `td_avg` | Takedowns/15 min |
| `tdacc` | `tdAcc`, `td_acc` | TD accuracy |
| `tddef` | `tdDef`, `td_def` | TD defense |
| `control` | `ctrl`, `controlTime`, `control_time` | Control time |

`sub_win_pct` may be omitted when `wins_ko`, `wins_sub`, and `wins_dec` are all posted. The percent is sub wins over those wins. If the win total is missing, the percent stays `not recorded`.

A posted `0` is kept. A blank, `n/a`, `not found`, or a dollar amount is dropped.

## Per opponent

`opponent` on the fight fills only the side that is not `lean` or `pick`. `opponent.name` picks the side when you send it. The same field names as the table above. Fighter fields win when both are posted. If the side cannot be named, the block is not written onto a fighter.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/fights/breakdown \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"UFC 333","fights":{"1":{"fightSlug":"alpha-vs-bravo","lean":"Alpha","boutOrder":1}},"data":[{"n":1,"slot":"2026-10-24","A":{"name":"Alpha"},"B":{"name":"Bravo","wins_sub":4,"wins_ko":5,"wins_dec":2,"loss_sub":1,"subavg":1.4,"tdavg":2.1,"tdacc":"45%","tddef":"70%","control":"2:11"}}]}'
```

The event page and the fight page show the opponent's eight lines as square tiles next to KO% and R1 finishes. A line that was not posted reads `not recorded`.
