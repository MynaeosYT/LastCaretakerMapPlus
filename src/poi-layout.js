import locationData from './data/locations.json';
import sampleData from './data/samples.json';
import paintData from './data/paint_schemes.json';
import questData from './data/quests.json';
import eventData from './data/world_events.json';
import secretData from './data/secrets.json';

const normalize = (value) => String(value ?? '')
    .toLocaleLowerCase()
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const locations = Object.values(locationData).flat();
const locationsBySpecificName = [...locations].sort((a, b) => b.name.length - a.name.length);
const entries = [];

function relatedLocation(candidate) {
    const names = [candidate.locationName, candidate.name, ...(candidate.relatedLocations ?? [])]
        .map(normalize)
        .filter(Boolean);
    return locationsBySpecificName.find((location) => {
        const locationName = normalize(location.name);
        return names.some((name) => name === locationName || name.includes(locationName));
    });
}

function add(key, candidate, kind) {
    if (candidate.coordinatePrecision === 'exact') return;
    const location = relatedLocation(candidate);
    if (location) entries.push({ key, location, kind });
}

sampleData.samples.forEach((sample) => add(`sample:${sample.id}`, sample, 'sample'));
paintData.schemes.forEach((scheme) => scheme.locations.forEach((location, index) => add(`paint:${scheme.id}:${index}`, location, 'paint')));
questData.quests.forEach((quest) => {
    quest.startLocations.forEach((location, index) => add(`quest-start:${quest.id}:${index}`, location, 'quest-start'));
    quest.objectiveLocations.forEach((location, index) => add(`quest-objective:${quest.id}:${index}`, location, 'quest-objective'));
});
eventData.events.forEach((event) => add(`event:${event.id}`, event, 'event'));
secretData.secrets.forEach((secret) => add(`secret:${secret.id}`, secret, 'secret'));

const kindOrder = new Map([
    ['sample', 0],
    ['paint', 1],
    ['quest-start', 2],
    ['quest-objective', 3],
    ['event', 4],
    ['secret', 5]
]);
const groups = new Map();
entries.forEach((entry) => {
    const group = groups.get(entry.location.id) ?? [];
    group.push(entry);
    groups.set(entry.location.id, group);
});

const positions = new Map();
groups.forEach((group) => {
    group.sort((a, b) => (kindOrder.get(a.kind) - kindOrder.get(b.kind)) || a.key.localeCompare(b.key));
    group.forEach((entry, index) => {
        const ring = Math.floor(index / 8);
        const slot = index % 8;
        const count = Math.min(8, group.length - ring * 8);
        const angle = ((Math.PI * 2) / count) * slot - Math.PI / 2;
        const radius = 2 + ring * 1.5;
        positions.set(entry.key, [
            -entry.location.latitude + Math.sin(angle) * radius,
            entry.location.longitude + Math.cos(angle) * radius
        ]);
    });
});

export function getPoiDisplayPosition(key, fallback) {
    return positions.get(key) ?? fallback;
}
