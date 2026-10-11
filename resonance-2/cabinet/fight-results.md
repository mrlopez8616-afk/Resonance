# Cabinet note — fight results

`POST /api/fights/result` records how a bout ended. It never settles a bet. Settlements go to `POST /api/bets/settle` on their own, and a draw or a no contest does not derive one.

| Piece | Value |
| --- | --- |
| Auth | `Authorization: Bearer $RESONANCE_SYNC_SECRET` (read fresh from the box file) |
| Body | One result object, or a bare array of them |
| Events | Any event slug. `ufc-332` comes from the catalog. Any other event must name a bout found on that event's bets or its stored breakdown rows (`POST /api/fights/breakdown`) |
| Outcome | `win` (default when omitted), `draw`, or `no_contest` (`no contest`, `no-contest`, and `NC` are read as `no_contest`) |
| Store | `fight_results` (one row per `fightSlug`). A draw or no contest stores `winner` as `""`, with `outcome` and both `fighters` in the payload. No migration |

Fields:

- `event`, `fightSlug`: required slugs.
- `winner`: required on a win, and must be one of the bout's fighters. Leave it out on a draw or a no contest (sending one is a `400`). `opponent` is also win-only.
- `method`: required on a win. On a draw or a no contest it defaults to `Draw` or `No contest`. Send the official wording when you have it, e.g. `Majority Draw`.
- `round` (1 to 5) and `time` (`m:ss`): always required. A draw that went the distance is the last round at `5:00`.
- `status`: `final` (default) or `pending`. `source`: optional text.

Posting the same result again is a no-op (`deduped: true`). Posting a draw over a stored win replaces it and drops the old winner and opponent.

## Win

```bash
curl -sS -X POST https://resonance3.vercel.app/api/fights/result \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"<event-slug>","fightSlug":"<fight-slug>","winner":"<fighter name>","method":"<official method>","round":<n>,"time":"<m:ss>"}'
```

## Draw (no winner)

```bash
curl -sS -X POST https://resonance3.vercel.app/api/fights/result \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"ufc-fight-night-allen-vs-duncan","fightSlug":"ernesta-kareckaite-vs-melissa-gatto","outcome":"draw","method":"Majority Draw","round":3,"time":"5:00"}'
```

## No contest

```bash
curl -sS -X POST https://resonance3.vercel.app/api/fights/result \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"<event-slug>","fightSlug":"<fight-slug>","outcome":"no_contest","method":"No contest (accidental eye poke)","round":1,"time":"2:14"}'
```

The fight page shows `Outcome: Draw` (or `No contest`) in place of `Winner`, and the bout line reads `Draw · Majority Draw · R3 5:00`.

Errors: `400` for an unknown bout on that event, a winner on a draw, or a bad field. `401` without the Bearer. `503` when the store or the bet book is unavailable.
