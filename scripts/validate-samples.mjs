#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] ?? path.join("src", "data", "samples.json");
const raw = fs.readFileSync(input, "utf8");
const data = JSON.parse(raw);

const allowedCategories = new Set(["holo_memory", "cave_painting", "rock_painting"]);
const allowedPrecision = new Set(["exact", "poi", "approximate"]);
const allowedStatus = new Set(["community-confirmed", "unverified"]);
const errors = [];

if (!Array.isArray(data.samples)) errors.push("samples is not an array.");
if (data.sampleCount !== 104) errors.push(`sampleCount is ${data.sampleCount}; expected 104.`);
if (data.samples?.length !== 104) errors.push(`samples.length is ${data.samples?.length}; expected 104.`);

const seenIds = new Set();
const seenSampleIds = new Set();
const counts = {};

for (const [index, sample] of (data.samples ?? []).entries()) {
  const where = `samples[${index}]`;
  if (!/^sample-\d{3}$/.test(sample.id ?? "")) errors.push(`${where}.id is invalid.`);
  if (!/^\d{3}$/.test(sample.sampleId ?? "")) errors.push(`${where}.sampleId is invalid.`);
  if (seenIds.has(sample.id)) errors.push(`Duplicate id: ${sample.id}`);
  if (seenSampleIds.has(sample.sampleId)) errors.push(`Duplicate sampleId: ${sample.sampleId}`);
  seenIds.add(sample.id);
  seenSampleIds.add(sample.sampleId);

  if (!sample.name) errors.push(`${where}.name is missing.`);
  if (!sample.locationName) errors.push(`${where}.locationName is missing.`);
  if (!Number.isFinite(sample.longitude) || !Number.isFinite(sample.latitude)) {
    errors.push(`${where}: coordinates are not numeric.`);
  }
  if (!allowedCategories.has(sample.category)) errors.push(`${where}.category is invalid.`);
  if (!allowedPrecision.has(sample.coordinatePrecision)) errors.push(`${where}.coordinatePrecision is invalid.`);
  if (!allowedStatus.has(sample.status)) errors.push(`${where}.status is invalid.`);
  if (!Array.isArray(sample.sourceRefs) || sample.sourceRefs.length === 0) {
    errors.push(`${where}.sourceRefs is missing or empty.`);
  }
  counts[sample.category] = (counts[sample.category] ?? 0) + 1;
}

const expectedCounts = { holo_memory: 60, cave_painting: 15, rock_painting: 29 };
for (const [category, expected] of Object.entries(expectedCounts)) {
  if (counts[category] !== expected) {
    errors.push(`${category}: ${counts[category] ?? 0}; expected ${expected}.`);
  }
}

if (errors.length) {
  console.error("Validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(
  `OK: ${data.samples.length} unique samples ` +
  `(60 Holo Memories, 15 Cave Paintings, 29 Rock/Wall Paintings).`
);
