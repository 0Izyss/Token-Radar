# Token Launch Radar

Rank pre-token protocols by what their token launch would be worth, and show how to farm each one. Built for the make.fun bounty **token-radar-01** ("Build the best token launch radar").

## How it works

`main.ts` (Node 22) reads the sealed DefiLlama snapshot (`input/snapshot.json` in the kit), scores every pre-token protocol with the model in `lib/model.ts`, and writes the ranked board to `board.json` plus the static dashboard and `dossier.json`.

The model is calibrated at runtime from the snapshot's own 144 tokenized protocols: per-category median market-cap/TVL, adjusted for 7-day TVL growth, chain breadth, and age. Implied value is the entry's own model claim, never a price.

## Run it

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

## Contents

- `main.ts` — entrypoint
- `lib/model.ts` — ranking model, board, farm plans
- `vendor/makefun-board.ts` — dossier builder (vendored from the make.fun kit)
- `dashboard/` — static board, detail view, filters (no network)
- `screenshots/` — board, detail, filtered views
