import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locationsPath = path.join(projectRoot, 'src', 'data', 'locations.json');
const typesPath = path.join(projectRoot, 'src', 'data', 'types.json');
const imagesPath = path.join(projectRoot, 'public', 'images');
const locationGroups = ['locations', 'hiddenLocations', 'lastListenerLocations', 'caves'];
const requiredInterfaceIcons = ['TheLastCaretaker_Indicator_Whale.PNG'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

const errors = [];
let locations;
let types;

try {
  locations = readJson(locationsPath);
  types = readJson(typesPath);
} catch (error) {
  console.error(`ERROR: Could not read mapping data: ${error.message}`);
  process.exit(1);
}

if (!types || typeof types !== 'object' || Array.isArray(types)) {
  errors.push('src/data/types.json must contain an object of type-to-filename mappings.');
}

const usedTypes = new Set();
for (const group of locationGroups) {
  if (!Array.isArray(locations[group])) {
    errors.push(`src/data/locations.json is missing the array "${group}".`);
    continue;
  }

  for (const [index, location] of locations[group].entries()) {
    if (!location || typeof location.type !== 'string' || location.type.length === 0) {
      errors.push(`${group}[${index}] has no valid location type.`);
      continue;
    }
    usedTypes.add(location.type);
  }
}

let imageNames = new Set();
try {
  imageNames = new Set(fs.readdirSync(imagesPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name));
} catch (error) {
  errors.push(`Could not read public/images: ${error.message}`);
}

const filenamesToTypes = new Map();
for (const [type, filename] of Object.entries(types ?? {})) {
  if (typeof filename !== 'string' || filename.length === 0) {
    errors.push(`Type "${type}" has no valid icon filename.`);
    continue;
  }
  if (path.basename(filename) !== filename) {
    errors.push(`Type "${type}" must map to a filename in public/images, not a path.`);
    continue;
  }
  if (!imageNames.has(filename)) {
    errors.push(`Type "${type}" maps to missing file public/images/${filename}.`);
  }
  const mappedTypes = filenamesToTypes.get(filename) ?? [];
  mappedTypes.push(type);
  filenamesToTypes.set(filename, mappedTypes);
}

for (const type of [...usedTypes].sort()) {
  if (!Object.hasOwn(types ?? {}, type)) {
    errors.push(`Used location type "${type}" has no mapping in src/data/types.json.`);
  }
}

for (const [filename, mappedTypes] of filenamesToTypes) {
  if (mappedTypes.length > 1) {
    errors.push(`Icon file "${filename}" is mapped to multiple types: ${mappedTypes.join(', ')}.`);
  }
}

for (const filename of requiredInterfaceIcons) {
  if (!imageNames.has(filename)) {
    errors.push(`Required interface icon public/images/${filename} is missing.`);
  }
}

if (errors.length > 0) {
  console.error(`POI icon validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`POI icon validation passed: ${usedTypes.size} used types, ${filenamesToTypes.size} POI files, and ${requiredInterfaceIcons.length} interface icon verified.`);
