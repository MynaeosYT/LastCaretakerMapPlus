#!/usr/bin/env node
import fs from "node:fs";

const questFile = process.argv[2] ?? "data/quests.json";
const eventFile = process.argv[3] ?? "data/world_events.json";
const qd = JSON.parse(fs.readFileSync(questFile, "utf8"));
const ed = JSON.parse(fs.readFileSync(eventFile, "utf8"));

const errors = [];

if (qd.wikiIndexQuestCount !== 43) errors.push(`wikiIndexQuestCount=${qd.wikiIndexQuestCount}; expected 43`);
if (!Array.isArray(qd.quests)) errors.push("quests is missing");
if (qd.recordCount !== qd.quests?.length) errors.push("recordCount does not match quests.length");
if ((qd.quests?.length ?? 0) < 48) errors.push(`Only ${qd.quests?.length} quest records; expected at least 48`);

const ids = new Set();
const names = new Set();
for (const q of qd.quests ?? []) {
  if (!q.id || ids.has(q.id)) errors.push(`Duplicate or missing quest ID: ${q.id}`);
  if (!q.name || names.has(q.name)) errors.push(`Duplicate or missing quest name: ${q.name}`);
  ids.add(q.id);
  names.add(q.name);
  if (!Array.isArray(q.startLocations) || !Array.isArray(q.objectiveLocations)) errors.push(`${q.name}: location arrays are missing`);
  if (!Array.isArray(q.sourceUrls) || q.sourceUrls.length === 0) errors.push(`${q.name}: sources are missing`);
  if (!["confirmed","community-confirmed","index-listed","incomplete"].includes(q.confidence)) {
    errors.push(`${q.name}: invalid confidence ${q.confidence}`);
  }
  for (const loc of [...q.startLocations, ...q.objectiveLocations]) {
    if (!Number.isFinite(loc.longitude) || !Number.isFinite(loc.latitude)) {
      errors.push(`${q.name}: invalid coordinate`);
    }
  }
}

const requiredExtras = ["A Place to Land","Ugly Work","First Roots","Still Listening","Project Jonah"];
for (const name of requiredExtras) {
  if (!names.has(name)) errors.push(`Missing additional quest record: ${name}`);
}

const oneBefore = (qd.quests ?? []).find(q => q.name === "One Before Me");
if (!oneBefore || oneBefore.triggerType !== "proximity" || oneBefore.playerVerified !== true) {
  errors.push("One Before Me must remain proximity + playerVerified");
}

if (ed.eventCount !== 3 || ed.events?.length !== 3) errors.push("Exactly 3 Jonah world events are required");

const coords = new Set((ed.events ?? []).map(e => `${e.longitude}:${e.latitude}`));
for (const coord of ["50:1","118:38"]) {
  if (!coords.has(coord)) errors.push(`Missing Jonah coordinate: ${coord}`);
}
if (coords.has("38:118")) errors.push("Invalid transposed Jonah coordinate 38:118 is present");

for (const e of ed.events ?? []) {
  if (e.relatedQuestId !== "quest-project-jonah") errors.push(`${e.id}: incorrect quest link`);
  if (e.unlockCondition?.type !== "quest_complete") errors.push(`${e.id}: unlockCondition is missing`);
  if (!Array.isArray(e.sourceUrls) || e.sourceUrls.length === 0) errors.push(`${e.id}: sources are missing`);
}

if (errors.length) {
  console.error("Validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

const mapUseful = qd.quests.filter(q => q.mapUseful).length;
console.log(`OK: ${qd.quests.length} quest records, ${mapUseful} map-useful, 3 Project Jonah world events.`);
