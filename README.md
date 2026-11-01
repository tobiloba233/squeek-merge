# Squeek Merge

An original, free browser game for [Squeekchain](https://squeekchain.com), the hamster-powered proof-of-work toychain on Ethereum Sepolia. Merge pixel hamsters on a 5×5 board while the real hamster, Squeektoshi, runs on the WHEELY9000. The live wheel changes how the game plays.

> Unofficial fan game. Testnet only, no monetary value.

It is a static site: no backend, no wallet, no payments, no analytics, no build step. All art is drawn in code.

## Run it

Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

## Put it online (free)

Any static host works. Keep `index.html` and `logic.js` in the same folder.

- **Netlify Drop:** go to https://app.netlify.com/drop and drag the folder in. You get a public URL straight away.
- **GitHub Pages:** create a repository, upload these files, then Settings → Pages → Deploy from branch → `main` / root.
- **Vercel:** import the repository, framework preset "Other", no build command.

The live wheel data needs a normal web host. It will not load inside sandboxed preview frames that block outside network calls. In that case the game still works and shows "Can't reach the wheel right now".

## How to play

- Tap a Squeek, then tap a neighbour (up, down, left, right) with the **same level** to merge them. The survivor goes up one level and the other is burned.
- A freshly merged Squeek **rests for 2 turns** (zz) and cannot merge again, like a Squeek on the real chain.
- **One new Pup (level 1) appears every turn**, in a random empty cell.
- No merge available? Press **Nap** to pass the turn. Resting Squeeks get a turn closer to waking, and a Pup curls up.
- Levels: Pup, Scout, Runner, Sprinter, Wheelsmith, Miner, Legend, **Genesis** (level 8).
- Reach Genesis to win. Genesis is the top level and does not merge, so keep playing for score.
- Merge points grow with the level (`10 × 2^(level-1)`), plus a combo bonus for merging on back-to-back turns.
- 3 undos per run. The run ends when the board is full and no merge is possible. Best score is saved in `localStorage`.
- Genesis is a long-run goal. It needs a lot of planning, so expect a few hundred turns.

Controls: tap or click, or keyboard (arrow keys move, Enter or Space selects, **U** undo, **N** nap).

Sound is off by default. Tap **Sound** to turn it on (you hear a short confirmation chime). If you hear nothing, check your device volume and silent mode.

## Live Squeekchain link

The game reads one public, read-only endpoint, `GET https://api.squeekchain.com/v1/status`, every **15 seconds** while the tab is visible (never faster, and paused while the tab is hidden).

| Field | Used for |
| --- | --- |
| `measurement.coreStatus` | `ACTIVE` = running, `IDLE` = resting, `COUNTER_FAULT` = sensor paused |
| `measurement.freshness` | only `online` data is used; anything else counts as stale |
| `measurement.rpmMilli` | live rpm (divided by 1000) |
| `measurement.distanceMm` | km today (divided by 1,000,000) |
| `builder.anchor.blockHeight` | a higher value than before while the page is open triggers Block Bonus |
| `builder.anchor.blockProgress` | progress bar to the next block (0 to 1e9) |

| Wheel state | Game effect |
| --- | --- |
| Running (fresh `ACTIVE`) | **Power Surge**: merge points ×2, glowing board, live rpm shown |
| Resting (fresh `IDLE`) | **Nap Mode**: normal points, calm theme |
| New Squeek block lands while you play | **Block Bonus**: two Pups are cleared, with a banner. Undo history is cleared at that moment |
| API error, timeout, offline, `status: "unavailable"`, stale data | "Can't reach the wheel right now". Play continues normally with no bonuses |
| HTTP 429 | waits for `Retry-After` (kept between 5 s and 5 min, 30 s if the header is unreadable) |
| `COUNTER_FAULT` | "Wheel sensor paused", no bonuses |
| Live data not loading | The Squeektoshi live panel explains why and offers a **simulated demo** (wheel running, wheel resting, new block). Demo values are labelled "demo", real data replaces them as soon as it arrives, and a run that used the demo never sets your Best score |

Unknown values are shown as "—" and are never treated as zero. Big numbers arrive as decimal strings and are parsed safely. The game never asks or encourages the real hamster to run, and the copy says naps are good too.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The game: layout, styles, pixel art, UI, live polling |
| `logic.js` | Pure game logic and API parsing. No DOM, no network |
| `test.js` | Unit tests for the logic. Run `node test.js` |

## Tests

```
node test.js
```

18 tests cover adjacency, merge rules, the 2-turn rest, combos, Power Surge doubling, the Genesis win, game over, Nap, Block Bonus, API parsing (running, resting, stale, fault, unavailable, bad data), block detection and `Retry-After` handling.

## Credits

Built for the Squeekchain Genesis Build lane. Not affiliated with Squeekchain. Links: https://squeekchain.com and https://sepolia.squeekchain.com.
