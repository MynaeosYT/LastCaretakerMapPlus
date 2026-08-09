# Quest and World Event Catalog

Last reviewed: **2026-08-07**

- Quest records: **48**
- Records with useful map context: **33**
- Project Jonah world-event areas: **3**

The structured source of truth is `quests.json` and `world_events.json`. This
catalog summarizes map-relevant starts and important data decisions without
duplicating every structured record.

## Map-relevant quest starts

| Quest | Trigger | Map focus |
|---|---|---|
| A Place to Land | interaction | Sanctuary Dock 12 (`88:27`) |
| Beyond the Horizon | proximity | Navigation Beacon 32 (`109:35`) |
| Eden Cradle | arrival | Eden Cradle (`167:34`) |
| Friendly by Design | scan | Talon Offshore Proving Deck (`97:58`) |
| Mother | proximity | Habitat Node 02-23 (`48:-48`) |
| Omega Nursery | arrival | Platform Omega (`90:6`) |
| One Before Me | proximity | Sanctuary Dock 12 (`88:27`) |
| Project Jonah | interaction | Platform Omega (`90:6`) |
| Round This, Quiet Secrets | arrival | Talon Offshore Proving Deck (`97:58`) |
| Salvage Gyro - Lost Blueprints | proximity | SGS-SW-115-3255 (`42:15`), SGS-NW-115-5100 (`62:-52`), SGS-SE-145-6950 (`131:30`) |
| Still Listening | arrival | Research Outpost Theta-9 (`53:-34`) |
| The Isolation | proximity | Unlisted Tower (`113:-21`) |
| The Warehouse | proximity | Central Warehouse Alpha (`66:22`) |
| Ugly Work | proximity | MCV-17 Dead Breath (`74:-74`), MCV-12 Eternal Flame (`89:47`) |

## Important data decisions

- Relight the Way, A Machine That Still Flies, and Accepting the Rules have no
  documented start trigger and therefore receive no quest-start marker.
- First Roots/Pishon remains searchable but has no invented coordinate.
- Round This/Round Things remains searchable under the documented name variant.
- One Before Me is player-observed as a proximity start at Sanctuary Dock 12.
- Quest objectives are optional map context and can be hidden independently.
- Reward details are not included because the dataset does not document them.

## Project Jonah Oil Whale world events

| Event | Coordinate | Precision | Availability | Spawn reliability |
|---|---:|---|---|---|
| Omega Nursery | `90:6` | poi | Project Jonah completed | strong-first-whale |
| 50:1 | `50:1` | exact-community | Project Jonah completed | community-variable |
| 118:38 | `118:38` | exact-community | Project Jonah completed | community-variable |

The coordinate `118:38` must not be transposed to `38:118`. Spawn behavior can
vary with game state.

## Maintenance

Keep stable quest and event IDs unchanged. Update sources and uncertainty notes
with corrections, then run:

```powershell
npm run validate:quests
```

