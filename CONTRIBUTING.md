# Contributing data corrections

Corrections to locations, samples, Paint Schemes, quests, world events, and
secrets are welcome when they include enough information to review the change.

## Good correction reports

Include as much of the following as possible:

- record name and stable ID;
- corrected coordinate in `longitude:latitude` order;
- location or POI name;
- whether the coordinate is exact, a POI anchor, or approximate;
- a short English position description;
- a public source, screenshot, or clearly identified in-game observation;
- game version or update when relevant.

Do not guess missing names, coordinates, access conditions, or rewards.

## Precision labels

- `exact`: a coordinate for the specific find;
- `poi`: a POI, cave entrance, or search-area anchor;
- `approximate`: a broader or approximate community position.

## Stable IDs and saved progress

Do not rename an existing record's stable `id`. Browser progress is stored using
these IDs. Correct display names and coordinates without replacing the ID.

## Validation

Run the validator for every changed dataset:

```powershell
npm run validate:samples
npm run validate:paints
npm run validate:quests
npm run validate:secrets
npm run build
```

Update `SOURCES_AND_UNCERTAINTIES.md` when a correction changes a documented
limitation, source, or precision decision.

