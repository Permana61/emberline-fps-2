# EMBERLINE — Foundry Yard

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/Permana61/emberline-fps-2/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/Permana61/emberline-fps-2/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

A round-based tactical FPS in three.js, Counter-Strike-style, never a copy:
two teams (Vanguard attacks, Cinder defends), short rounds won by eliminating
the enemy team or by planting/defusing the spike, money between rounds to buy
weapons, and gunfire where accuracy counts more than speed.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD move, mouse look, click fire, R reload, G frag grenade, E plant/defuse
the spike at site A or B, 1–6 buy weapons in the buy phase (incl. the
VK-7 Vandal rifle, key 6), Ctrl crouch, Space jump. First team to 5 rounds
wins the match. Each round ends with an MVP banner for the round's best
combatant (most eliminations, damage breaks ties).

## Structure

- `game/index.html` — page + HUD (health, ammo, money, timer, score, bomb)
- `game/src/main.js` — fixed-step loop, rounds, economy, plant/defuse, round MVP
- `game/src/world.js` — Foundry Yard map: Long A, Mid, Short B, Boiler Room, sites A/B
- `game/src/bots.js` — bot FSM: routes, holds, line of sight, hearing, Boiler Room flanks, faster rotates, low-HP holds
- `game/src/weapon.js` — 6 weapons (incl. VK-7 Vandal) + frag grenade, recoil/spread
- `game/src/bomb.js`, `game/src/grenades.js`, `game/src/audio.js` — objective, grenades, synth sound
- `game/src/player.js`, `game/src/input.js`, `game/src/hud.js`, `game/src/state.js`, `game/src/palette.js`

Static files only, no build step, no network request. three.js 0.187.0 is
vendored under `game/vendor/three/`.

Match point: a MATCH POINT tag appears in the top bar (plus a kill-feed
line) when either team is one round from taking the match.

## Entry

`main.ts` hands the game in: it copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json` with the kit's
`vendor/makefun-threejs.ts`.

## License

MIT — see LICENSE.
