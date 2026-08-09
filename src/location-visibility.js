import locationData from './data/locations.json';

export const LOCATION_VISIBILITY_EVENT = 'tlc-location-visibility-change';

const GROUPS = [
    { key: 'show-hidden-locations', locations: locationData.hiddenLocations },
    { key: 'show-last-listener', locations: locationData.lastListenerLocations },
    { key: 'show-caves', locations: locationData.caves }
];

const normalize = (value) => String(value ?? '')
    .toLocaleLowerCase()
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function groupIsVisible(key) {
    return localStorage.getItem(key) === 'true';
}

function referencesLocation(candidate, location) {
    const relatedNames = Array.isArray(candidate.relatedLocations) ? candidate.relatedLocations : [];
    const candidateNames = [candidate.locationName ?? candidate.name, ...relatedNames].map(normalize).filter(Boolean);
    const locationName = normalize(location.name);
    if (locationName && candidateNames.some((candidateName) => candidateName.includes(locationName))) return true;

    return Number.isFinite(candidate.latitude)
        && Number.isFinite(candidate.longitude)
        && Math.abs(candidate.latitude - location.latitude) < 0.0001
        && Math.abs(candidate.longitude - location.longitude) < 0.0001;
}

export function isRelatedLocationVisible(candidate) {
    const group = GROUPS.find(({ locations }) => locations.some((location) => referencesLocation(candidate, location)));
    return !group || groupIsVisible(group.key);
}
