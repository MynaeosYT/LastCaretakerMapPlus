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
  if (!Array.isArray(s.sourceUrls) || s.sourceUrls.length === 0) errors.push(`${s.name}: sources are missing`);
}

const noTeddy = (data.secrets ?? []).find(s => s.id === "secret-transposium-no-teddy-inventory-door");
if (!noTeddy || noTeddy.confidence !== "player-verified" || noTeddy.playerVerified !== true) {
  errors.push("Transposium no-Teddy door must remain player-verified.");
}
if (!noTeddy?.accessConditions?.some(c => c.conditionType === "inventory_excludes")) {
  errors.push("Transposium no-Teddy door requires inventory_excludes.");
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
