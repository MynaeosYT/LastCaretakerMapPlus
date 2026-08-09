#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2] ?? path.join('src', 'data', 'paint_schemes.json');
const data = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
const errors = [];
const allowedPrecision = new Set(['exact', 'poi', 'approximate']);

if (data.schemeCount !== 37) errors.push(`schemeCount is ${data.schemeCount}; expected 37.`);
if (!Array.isArray(data.schemes) || data.schemes.length !== 37) {
    errors.push(`schemes length is ${data.schemes?.length}; expected 37.`);
}
if (data.unlockRule?.cansRequired !== 4) errors.push('unlockRule.cansRequired must be 4.');

const ids = new Set();
for (const [index, scheme] of (data.schemes ?? []).entries()) {
    const at = `schemes[${index}]`;
    if (!/^paint-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scheme.id ?? '')) errors.push(`${at}.id is invalid.`);
    if (ids.has(scheme.id)) errors.push(`Duplicate scheme id: ${scheme.id}`);
    ids.add(scheme.id);
    if (!scheme.name) errors.push(`${at}.name is missing.`);
    if (scheme.unlockRequired !== 4) errors.push(`${at}.unlockRequired must be 4.`);
    if (scheme.lootable !== true) errors.push(`${at} must be lootable.`);
    if (!Number.isInteger(scheme.wikiAmountFound) || scheme.wikiAmountFound < 1) errors.push(`${at}.wikiAmountFound is invalid.`);
    if (!Array.isArray(scheme.locations) || !scheme.locations.length) errors.push(`${at}.locations is empty.`);
    if (!Array.isArray(scheme.cans)) errors.push(`${at}.cans is not an array.`);
    if (!Array.isArray(scheme.sourceUrls) || !scheme.sourceUrls.length) errors.push(`${at}.sourceUrls is empty.`);

    for (const location of scheme.locations ?? []) {
        if (!Number.isFinite(location.longitude) || !Number.isFinite(location.latitude)) errors.push(`${at} has non-numeric location coordinates.`);
        if (!allowedPrecision.has(location.coordinatePrecision)) errors.push(`${at} has invalid location precision.`);
    }
    const canIds = new Set();
    for (const can of scheme.cans ?? []) {
        if (!/^can-\d+$/.test(can.canId ?? '')) errors.push(`${at} has invalid canId ${can.canId}.`);
        if (canIds.has(can.canId)) errors.push(`${at} has duplicate canId ${can.canId}.`);
        canIds.add(can.canId);
        if (!Number.isFinite(can.longitude) || !Number.isFinite(can.latitude)) errors.push(`${at}.${can.canId} has non-numeric coordinates.`);
        if (!allowedPrecision.has(can.coordinatePrecision)) errors.push(`${at}.${can.canId} has invalid precision.`);
        if (!can.positionNote) errors.push(`${at}.${can.canId} is missing positionNote.`);
    }
}

const wikiTotal = (data.schemes ?? []).reduce((sum, scheme) => sum + scheme.wikiAmountFound, 0);
const placementTotal = (data.schemes ?? []).reduce((sum, scheme) => sum + scheme.cans.length, 0);
if (wikiTotal !== 190 || data.wikiAmountFoundTotal !== 190) errors.push(`Wiki can total is ${wikiTotal}; expected 190.`);
if (placementTotal !== 185 || data.documentedPlacementRecords !== 185) errors.push(`Documented placements are ${placementTotal}; expected 185.`);

const ammonite = data.schemes?.find((scheme) => scheme.name === 'Ammonite');
if (!ammonite || ammonite.cans.length !== 7 || ammonite.cans.some((can) => can.coordinatePrecision !== 'exact')) {
    errors.push('Ammonite must contain seven exact can coordinates.');
}
const goofyFins = data.schemes?.find((scheme) => scheme.name === 'Goofy Fins');
if (!goofyFins || goofyFins.individualPositionsStatus !== 'scheme-only' || goofyFins.cans.length !== 0) {
    errors.push('Goofy Fins must remain scheme-only with no invented can positions.');
}
if (data.schemes?.some((scheme) => ['Jesus paint 1', 'Pink Paint'].includes(scheme.name))) {
    errors.push('Non-lootable test paints must not be included.');
}

if (errors.length) {
    console.error(`Paint validation failed:\n- ${errors.join('\n- ')}`);
    process.exit(1);
}

console.log('OK: 37 paint schemes, 190 wiki cans, 185 documented placements, 7 exact Ammonite positions.');
