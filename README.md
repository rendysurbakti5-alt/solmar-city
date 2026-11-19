# Solmar City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rendysurbakti5-alt/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rendysurbakti5-alt/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar City** is an original open-world crime game that plays offline in a desktop browser — a sun-soaked coastal city of avenues, beaches, a marina and an airstrip, built from scratch in vanilla JavaScript. No engines, no assets, no network requests: every building, car, character, line of dialogue and sound is its own.

You are Santi Reyes, newly arrived and already in debt to the wrong people. Work a six-mission story chain for Paloma Duarte — fetch cars, run passengers, steal an Aurora GT, deliver against the clock and escape the law — or ignore the story and make your own trouble: steal cars, start fights, rack up wanted stars and see how long you survive Solmar PD.

What's in the city:

- A seeded island city (5120×3840) with six avenues, five districts, a coast road, beach and ocean, a marina pier and an airstrip, plus nine named places — Club Palma, Tito's Garage, Solmar PD, the Motel Palma and more
- On-foot and driving play: walk, run, steal any car (its driver objects), with traffic that keeps lanes, turns, brakes and honks, and pedestrians who stroll and flee
- A witness-based wanted system, 0–5 stars: Interceptors pursue, ram and call backup; get busted or wasted and you pay the fine or the hospital bill
- Combat: fists and a mouse-aimed pistol, knockdowns that drop cash, car damage, burning wrecks and chain explosions
- A HUD with health and armor, cash, wanted stars, an objective bar and a live minimap; a title screen with New Game / Continue; saving in localStorage
- WebAudio sound throughout: engines, sirens, gunshots, crashes and a small music sequencer — no audio files

Controls: WASD or arrows to move and drive, F to enter or steal a car, Shift to run, mouse to aim and click to shoot, E to talk and advance dialogue, Esc to pause.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. (Opening `game/index.html` directly from disk works too — the game is plain static files.)

The entry program is `main.ts` (Node 22, standard library only): it copies `game/` and `screenshots/` to the output directory and writes the entry dossier with `vendor/makefun-game.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4rdx0541&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
