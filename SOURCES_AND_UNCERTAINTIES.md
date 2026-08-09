# Sources, data quality, and uncertainties

This document explains where the additional Map Plus data comes from, what the
precision labels mean, and where the available sources provide only area-level
information. It does not claim that community coordinates are official game data.

## Coordinate precision

- `exact`: a published coordinate for the specific find. This does not
  necessarily mean that the coordinate comes from official game data.
- `poi`: the coordinate points to a POI, cave entrance, or map anchor. The item
  still has to be located within that area.
- `approximate`: only a relative description, broad search anchor, or approximate
  community coordinate is available.

Stable record IDs must not be changed after publication because saved browser
progress is associated with them.

## Samples, Holo Memories, and paintings

Last reviewed: **August 6, 2026**

The community dataset contains **104 sample IDs**:

- 60 Holo Memories / Event Samples
- 15 Cave Paintings
- 29 Rock / Wall Paintings

### Primary sources

- [Steam Community – main sample collection](https://steamcommunity.com/app/1783560/discussions/0/571543307930450380/): names and location descriptions for most samples, including later additions in the comments. Source ID: `steam_master_list`.
- [Steam Community – new underwater holograms](https://steamcommunity.com/app/1783560/discussions/0/571543581338190002/): published coordinates for samples 056 (`26.4:4.9`), 057 (`37.1:6`), 059 (`64.9:-3.9`), 060 (`55.3:1.1`), 062 (`106.7:50.1`), and 063 (`14.4:8.4`). Source ID: `steam_new_holograms`.
- [Steam Community – individual sample finds](https://steamcommunity.com/app/1783560/discussions/0/572668060972069688/): follow-up information including sample 046. Source ID: `steam_followup_comments`.
- [The1Killer's original map](https://github.com/the1killer/LastCaretakerMap): existing POI, cave, and spire coordinates used as map anchors. A POI anchor is not automatically the exact position of a sample. Source ID: `the1killer_map_repo`.
- [The Last Caretaker community wiki](https://thelastcaretaker.wiki.gg/): cross-checks for several hologram finds and location names. Source ID: `community_wiki`.

### Important sample notes

#### Samples 051 and 059

The English in-game names could not be verified reliably from the available text
sources. They intentionally remain `UNKNOWN – Sample 051` and
`UNKNOWN – Sample 059` instead of using guessed names.

- 051 uses the Habitat Node 09-4 POI anchor at `83:16`.
- 059 has a published coordinate at `64.9:-3.9` and therefore remains `exact`.

#### Sample 575

An early community list gave the wrong direction. A later find corrected the
position to the very top of Quarantine Stack Amen.

#### Samples 584 and 591

Only relative descriptions are known: 584 is southeast of Stack Amen and 591 is
at its western edge. Both use `147:-38` only as the stack search anchor.

#### Sample 596

The community coordinate is `147.3:-33.9`. The reported position is at the
second-highest rock, about 10 meters underwater.

#### Samples 605 and 606

The published coordinates are `151:-38` and `150:-42`. Both finds are reported
just below the water surface.

#### Courier Sieve samples 676, 683, 687, and 694

All four records use the Courier Sieve Node Facility anchor at `169:-2`:

- 676: small island southeast of the main facility
- 683: small island east of the main facility
- 687: underwater west of the facility
- 694: confirmed at the Courier Sieve Node Facility anchor

These markers are search anchors, not claimed exact wall positions. Sample 694
previously used the community approximation `196.4:-3.1`; that value was removed
after the location was corrected to the facility anchor by the Map Plus
maintainer. Source ID: `map_maintainer_correction_2026_08_09`.

#### Cave Paintings

Cave Painting coordinates normally point to a cave entrance or known cave
anchor, not to the exact wall inside. These records therefore use `poi` unless a
specific coordinate is documented.

### Maintaining sample data

When new evidence improves a marker:

1. record the exact coordinate if available;
2. copy the English name directly from the PECO sample menu;
3. improve `positionNote` without removing useful uncertainty information;
4. change `coordinatePrecision` only when the evidence supports it;
5. add the supporting source;
6. run `npm run validate:samples`.

## Paint Schemes

Last reviewed: **August 7, 2026**

The dataset contains 37 lootable Paint Schemes with a wiki total of 190 cans.
There are documented individual placements for 185 cans. Four cans of the same
scheme used in game allow its unlock; the map deliberately stores found cans and
manual in-game unlock confirmation separately.

### Paint sources

- [The Last Caretaker Wiki – Paint Cans](https://thelastcaretaker.wiki.gg/wiki/Paint_Cans): scheme list, areas, quantities, and unlock rule.
- Individual wiki pages: paraphrased position descriptions for 36 of 37 schemes.
- [Steam Community – Paints and where to find them](https://steamcommunity.com/app/1783560/discussions/0/765184781366349955/): cross-check of schemes and POIs.
- [The1Killer map locations](https://github.com/the1killer/LastCaretakerMap/blob/main/src/data/locations.json): POI anchors, not claimed exact can coordinates.
- [Reddit datamining note](https://www.reddit.com/r/TheLastCaretaker/comments/1r40b9o/have_i_missed_any_paints/): `Jesus paint 1` and `Pink Paint` are non-lootable test content and are excluded.

### Important paint uncertainties

- **Goofy Fins:** Navigation Beacon 32 and five cans are confirmed, but reliable individual positions are unavailable. The checklist therefore contains no invented exact coordinates.
- **Checker Run:** The wiki amount and completion threshold remain five. Some reports describe two physical cans at placement #3, so `reportedPhysicalCount` remains `5-6` and the possible extra spawn is only a note.
- **Drowned City:** The collection page marks its amount with an asterisk; the individual page now documents five placements. The dataset uses five.
- **Captain Giggle:** The five descriptions closely resemble those for Catalan Modernisme. Navigation Beacon 15 is confirmed; individual placements are presented as POI-level community data.
- **Ammonite:** Currently the only scheme with seven published exact individual coordinates. Only those cans receive small individual markers.
- **Leaf Wall:** Intentionally shares one progress record across Quarantine Stack Chorus, Quarantine Stack Aurora, and Quarantine Stack Dawn.

Maintain stable scheme and can IDs, update sources and notes with corrections,
and run `npm run validate:paints`. Upgrade `poi` or `approximate` records to
`exact` only with a reliable published coordinate.

## Quests and Project Jonah world events

Last reviewed: **August 7, 2026**

Detailed quest records and review notes are also summarized in
`src/data/QUEST_CATALOG.md`. Structured data remains in `quests.json` and
`world_events.json`.

Relight the Way, A Machine That Still Flies, and Accepting the Rules have no
reliable start trigger and receive no invented start marker. First Roots/Pishon
has no coordinate until a reliable source becomes available. Round This/Round
Things remains searchable. One Before Me is additionally player-verified as a
proximity start at Sanctuary Dock 12.

The three Project Jonah whale locations are Early Access world events with
different precision levels. Omega uses only the Platform Omega POI anchor.
`50:1` and `118:38` are community coordinates, and spawn behavior can vary with
game state. `118:38` must not be transposed to `38:118`.

Keep IDs stable and run `npm run validate:quests` after changes.

## Secrets, hidden rooms, and gated areas

Last reviewed: **August 7, 2026**

The dataset contains 26 separate secret/gate records: 22 with documented access
and four deliberately incomplete research leads. A detailed overview is stored
in `src/data/SECRET_CATALOG.md`; structured data exists only in
`src/data/secrets.json`.

POI coordinates are search-area anchors, not claimed exact doors or walls.
Solutions are hidden behind deliberate reveal actions in the interface. The
Transposium doors requiring a Teddy and no Teddy remain separate records. The
no-Teddy case retains `player-verified` confidence.

Research leads at Nomads Tower, Helios Reserve Gemini, Habitat Node 05-14.5, and
Habitat Node 04-7 contain no invented solution and do not count toward the
22-secret completion total. Mod- or noclip-only areas are excluded.

Keep secret IDs stable, do not promote incomplete records without reliable
evidence, and run `npm run validate:secrets` after changes.
