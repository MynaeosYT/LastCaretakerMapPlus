#!/usr/bin/env node
import fs from "node:fs";

const file = process.argv[2] ?? "data/secrets.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];

if (!Array.isArray(data.secrets)) errors.push("secrets is missing or is not an array.");
if (data.secretRecordCount !== data.secrets?.length) errors.push("secretRecordCount does not match.");

const ids = new Set();
const allowedConfidence = new Set(["confirmed","community-confirmed","player-verified","official-location-only"]);
const allowedStatus = new Set(["accessible","details_incomplete"]);
const allowedPrecision = new Set(["exact","poi","approximate"]);

for (const [i, s] of (data.secrets ?? []).entries()) {
  const at = `secrets[${i}]`;
  if (!s.id || ids.has(s.id)) errors.push(`${at}: missing or duplicate ID ${s.id}`);
  ids.add(s.id);
  if (!s.name || !s.locationName) errors.push(`${at}: name/locationName is missing`);
  if (!Number.isFinite(s.longitude) || !Number.isFinite(s.latitude)) errors.push(`${s.name}: invalid coordinates`);
  if (!allowedConfidence.has(s.confidence)) errors.push(`${s.name}: invalid confidence`);
  if (!allowedStatus.has(s.status)) errors.push(`${s.name}: invalid status`);
  if (!allowedPrecision.has(s.coordinatePrecision)) errors.push(`${s.name}: invalid precision`);
  if (!s.hint || !s.solution) errors.push(`${s.name}: hint/solution is missing`);
  if (!Array.isArray(s.accessConditions)) errors.push(`${s.name}: accessConditions is missing`);
  if (!Array.isArray(s.sourceUrls)) errors.push(`${s.name}: sourceUrls is missing`);
  if (s.sourceUrls?.length === 0 && !(s.confidence === "player-verified" && s.playerVerified === true
      && s.notes?.includes("Directly verified in-game by the map author on 2026-08-20."))) {
    errors.push(`${s.name}: empty sourceUrls requires dated direct in-game verification`);
  }
}

const countBy = (field) => Object.fromEntries((data.secrets ?? []).reduce((counts, secret) => {
  counts.set(secret[field], (counts.get(secret[field]) ?? 0) + 1);
  return counts;
}, new Map()));
const statusCounts = countBy("status");
const confidenceCounts = countBy("confidence");
const typeCounts = countBy("secretType");
const countsMatch = (declared, actual) => {
  const keys = new Set([...Object.keys(declared ?? {}), ...Object.keys(actual)]);
  return [...keys].every((key) => declared?.[key] === actual[key]);
};

if (data.solvedOrAccessibleCount !== statusCounts.accessible) errors.push("solvedOrAccessibleCount does not match accessible records.");
if (data.detailsIncompleteCount !== statusCounts.details_incomplete) errors.push("detailsIncompleteCount does not match incomplete records.");
if (!countsMatch(data.confidenceCounts, confidenceCounts)) errors.push("confidenceCounts does not match the records.");
if (!countsMatch(data.typeCounts, typeCounts)) errors.push("typeCounts does not match the records.");

const verified20260820 = [
  "secret-habitat-node-04-7-update-3-5-hidden-additions",
  "secret-habitat-node-05-14-5-update-3-5-hidden-additions",
  "secret-refuel-outpost-theta-outer-underwater-room",
  "secret-habitat-node-09-4-upper-support-room",
  "secret-habitat-node-09-4-deep-support-room",
  "secret-exodus-station-support-vent-hidden-chamber"
];
for (const id of verified20260820) {
  const secret = (data.secrets ?? []).find((entry) => entry.id === id);
  if (!secret || secret.status !== "accessible" || secret.confidence !== "player-verified" || secret.playerVerified !== true
      || !secret.notes?.some((note) => note.startsWith("Directly verified in-game by the map author on 2026-08-20."))) {
    errors.push(`${id} must remain accessible and directly player-verified on 2026-08-20.`);
  }
}

const expectedIncompleteIds = [
  "secret-helios-reserve-gemini-update-3-5-secret-area",
  "secret-nomads-tower-update-3-5-secret-area"
];
const incompleteIds = (data.secrets ?? []).filter((secret) => secret.status === "details_incomplete").map((secret) => secret.id).sort();
if (JSON.stringify(incompleteIds) !== JSON.stringify(expectedIncompleteIds.sort())) {
  errors.push("Only the Helios Reserve Gemini and Nomads Tower research leads may remain incomplete.");
}

const teddyPassage = (data.secrets ?? []).find(s => s.id === "secret-transposium-no-teddy-inventory-door");
if (!teddyPassage || teddyPassage.confidence !== "player-verified" || teddyPassage.playerVerified !== true) {
  errors.push("Transposium Teddy theater passage must remain player-verified.");
}
if (!teddyPassage?.accessConditions?.some(c => c.conditionType === "inventory_excludes")) {
  errors.push("Transposium Teddy theater passage requires inventory_excludes.");
}
if (!teddyPassage?.accessConditions?.some(c => c.conditionType === "object_state")) {
  errors.push("Transposium Teddy theater passage requires object_state.");
}
if ((data.secrets ?? []).some(s => s.id === "secret-transposium-teddy-theater-passage")) {
  errors.push("The duplicate Transposium Teddy theater passage record must not be restored.");
}

const gamma1 = (data.secrets ?? []).find(s => s.id === "secret-gamma-tommy-room");
const gamma2 = (data.secrets ?? []).find(s => s.id === "secret-gamma-second-underwater-secret-room");
if (!gamma1?.accessConditions?.some(c => c.conditionType === "inventory_contains")) {
  errors.push("Gamma Tommy Room requires inventory_contains.");
}
if (!gamma2?.accessConditions?.some(c => c.conditionType === "hidden_button")) {
  errors.push("Gamma second room requires hidden_button.");
}

const maze = (data.secrets ?? []).find(s => s.id === "secret-secret-of-the-maze");
if (!maze || maze.accessConditions.length < 3) errors.push("Secret of the Maze must contain three triggers.");

const inaccessibleNames = (data.secrets ?? []).filter(s =>
  /room 997/i.test(s.name) || /mod.?only/i.test(s.name)
);
if (inaccessibleNames.length) errors.push("Inaccessible or mod-only areas must not be included as normal secret records.");

if (errors.length) {
  console.error("Validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

const solved = data.secrets.filter(s => s.status === "accessible").length;
const incomplete = data.secrets.filter(s => s.status === "details_incomplete").length;
console.log(`OK: ${data.secrets.length} Secret/Gate records (${solved} documented-access, ${incomplete} details-incomplete).`);
