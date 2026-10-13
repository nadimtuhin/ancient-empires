# Ancient Empires (HTML5)

A TypeScript remake of the 2004 J2ME game Ancient Empires: the 7-mission campaign, skirmish maps, hot-seat play and a computer opponent.

It draws with plain Canvas2D and only renders when something changes, so an idle game uses no CPU.

## Run

```sh
bun install
bun run dev
```

The first run downloads the original jar from [ancient-empires/games-download](https://github.com/ancient-empires/games-download) and extracts its art, maps and text into `public/assets/` (not committed).

## Test

```sh
bun run check   # typecheck, oxlint, unit tests, Playwright e2e
```

The screenshot test records its baseline on the first e2e run on each machine, so that run reports one failure.

## License

The code is MIT. The original game's art, maps and text belong to Macrospace and are not part of this repository or its license.
