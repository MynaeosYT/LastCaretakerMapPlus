import {
    refreshDisplay,
    applyVisitOverlayVisibility,
    toggleBackgroundLayer
} from './main.js';
import locationData from './data/locations.json';

// Default marker colors per type
const defaultMarkerColors = {
    Hanger: '#ffffff',
    NavBeacon: '#ffffff',
    Rocket: '#ffffff',
    RefuelOutpost: '#aa232f',
    HeliosReserve: '#AB5024',
    Habitat: '#1C86E6',
    RockySpire: '#A67E3D',
    Maze: '#A67E3D',
    Ruin: '#000000',
    NDNS: '#555555',
    Cave: '#8A1CE6',
    SeedVault: '#1CE2E6',
    Lazarus: '#ffffff',
    OilRig: '#ffffff',
    SharkBay: '#E61CE6',
    StarChild: '#E61CE6',
    RollerFactory: '#E61CE6',
    GyroPlatform: '#ff9900',
    Silo: '#ff9900',
    "StatueSpire": '#CCCCCC',
    "Eden": '#ffffff',
    "Lab": '#4eaad4'
};

const BACKUP_FORMAT = 'tlc-map-plus-backup';
const BACKUP_VERSION = 1;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const BOOLEAN_STORAGE_VALUES = new Set(['true', 'false']);
const VISIT_STORAGE_VALUES = new Set(['not-visited', 'visited', 'cleared']);
const SIDEBAR_GROUPS = ['legend', 'locations', 'collectibles', 'activities', 'secrets'];
const SIDEBAR_STORAGE_KEYS = SIDEBAR_GROUPS.map(group => `tlc-sidebar-group-v2-${group}`);
const LEGACY_SIDEBAR_KEY_MAP = Object.fromEntries(SIDEBAR_GROUPS.map(group => [
    `tlc-sidebar-group-v1-${group}`,
    `tlc-sidebar-group-v2-${group}`
]));
const STRUCTURED_STORAGE_KEYS = [
    'tlc-sample-status-v1',
    'tlc-sample-filters-v1',
    'tlc-paint-status-v1',
    'tlc-paint-filters-v1',
    'tlc-quest-status-v1',
    'tlc-quest-filters-v1',
    'tlc-secret-status-v1',
    'tlc-secret-reveal-v1',
    'tlc-secret-filters-v1'
];

const ALL_LOCATIONS = [
    ...locationData.locations,
    ...locationData.hiddenLocations,
    ...locationData.lastListenerLocations,
    ...locationData.caves
];
const LOCATION_STORAGE_KEYS = ALL_LOCATIONS.flatMap(location => [
    `marker-visible-${location.id}`,
    `location-visit-${location.id}`,
    `location-notes-${location.id}`
]);
const CATEGORY_STORAGE_KEYS = [
    'category-visible-main-locations',
    'category-visible-hidden-locations',
    'category-visible-last-listener-locations',
    'category-visible-caves-locations'
];
const BOOLEAN_SETTING_KEYS = [
    'show-hidden-locations',
    'show-last-listener',
    'show-caves',
    'show-primary-numbers',
    'show-visit-overlays',
    'use-solid-background',
    ...CATEGORY_STORAGE_KEYS,
    'tlc-sample-category-v1-holo_memory',
    'tlc-sample-category-v1-cave_painting',
    'tlc-sample-category-v1-rock_painting',
    ...SIDEBAR_STORAGE_KEYS
];
const MARKER_COLOR_KEYS = Object.keys(defaultMarkerColors).map(type => `marker-color-${type}`);
const SUPPORTED_STORAGE_KEYS = new Set([
    ...LOCATION_STORAGE_KEYS,
    ...BOOLEAN_SETTING_KEYS,
    ...STRUCTURED_STORAGE_KEYS,
    ...MARKER_COLOR_KEYS,
    'background-color'
]);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(object, allowedKeys) {
    const allowed = new Set(allowedKeys);
    return Object.keys(object).every(key => allowed.has(key));
}

function hasNoDangerousKeys(value) {
    if (Array.isArray(value)) return value.every(hasNoDangerousKeys);
    if (!isPlainObject(value)) return true;
    return Object.entries(value).every(([key, child]) => (
        !['__proto__', 'prototype', 'constructor'].includes(key) && hasNoDangerousKeys(child)
    ));
}

function isBooleanObject(object, allowedKeys) {
    return isPlainObject(object)
        && hasOnlyKeys(object, allowedKeys)
        && Object.values(object).every(value => typeof value === 'boolean');
}

function validateStructuredStorage(key, value) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error(`${key} does not contain valid JSON.`);
    }
    if (!isPlainObject(parsed) || !hasNoDangerousKeys(parsed)) {
        throw new Error(`${key} must contain a safe JSON object.`);
    }

    const valid = (() => {
        switch (key) {
            case 'tlc-sample-status-v1':
                return Object.values(parsed).every(state => state === 'collected');
            case 'tlc-sample-filters-v1':
                return isBooleanObject(parsed, ['uncollectedOnly', 'exactOnly', 'showPoi', 'showApproximate']);
            case 'tlc-paint-status-v1': {
                if (!hasOnlyKeys(parsed, ['found', 'unlocked']) || !isPlainObject(parsed.found) || !isPlainObject(parsed.unlocked)) return false;
                return Object.values(parsed.found).every(ids => Array.isArray(ids) && ids.every(id => typeof id === 'string'))
                    && Object.values(parsed.unlocked).every(state => typeof state === 'boolean');
            }
            case 'tlc-paint-filters-v1':
                return isBooleanObject(parsed, ['showPaints', 'incompleteOnly', 'notUnlockedOnly', 'exactPositions']);
            case 'tlc-quest-status-v1':
                return Object.values(parsed).every(state => ['unknown', 'active', 'completed'].includes(state));
            case 'tlc-quest-filters-v1':
                return isBooleanObject(parsed, ['showStarts', 'showObjectives', 'showRewards', 'showEvents', 'showLockedEvents']);
            case 'tlc-secret-status-v1':
                return Object.values(parsed).every(state => ['unknown', 'found', 'solved'].includes(state));
            case 'tlc-secret-reveal-v1':
                return Object.values(parsed).every(state => isBooleanObject(state, ['hintRevealed', 'solutionRevealed', 'contentsRevealed']));
            case 'tlc-secret-filters-v1':
                return isBooleanObject(parsed, ['showSecrets', 'unsolvedOnly', 'showResearch']);
            default:
                return false;
        }
    })();

    if (!valid) throw new Error(`${key} has an unsupported data structure.`);
}

function validateStorageValue(key, value) {
    if (value === null) return;
    if (typeof value !== 'string') throw new Error(`${key} must be a string or null.`);

    if (BOOLEAN_SETTING_KEYS.includes(key) || key.startsWith('marker-visible-')) {
        if (!BOOLEAN_STORAGE_VALUES.has(value)) throw new Error(`${key} must be "true" or "false".`);
        return;
    }
    if (key.startsWith('location-visit-')) {
        if (!VISIT_STORAGE_VALUES.has(value)) throw new Error(`${key} contains an invalid visit state.`);
        return;
    }
    if (key.startsWith('location-notes-')) {
        if (value.length > 100000) throw new Error(`${key} exceeds the supported note length.`);
        return;
    }
    if (key === 'background-color' || key.startsWith('marker-color-')) {
        if (!HEX_COLOR_PATTERN.test(value)) throw new Error(`${key} must be a six-digit hex color.`);
        return;
    }
    if (STRUCTURED_STORAGE_KEYS.includes(key)) {
        validateStructuredStorage(key, value);
        return;
    }
    throw new Error(`Unsupported backup key: ${key}`);
}

function validateAndNormalizeBackup(imported) {
    if (!isPlainObject(imported)) throw new Error('The backup root must be a JSON object.');

    const isVersioned = Object.hasOwn(imported, 'format') || Object.hasOwn(imported, 'version') || Object.hasOwn(imported, 'data');
    let source;
    if (isVersioned) {
        if (!hasOnlyKeys(imported, ['format', 'version', 'exportedAt', 'data'])) throw new Error('The backup contains unsupported top-level fields.');
        if (imported.format !== BACKUP_FORMAT || imported.version !== BACKUP_VERSION) throw new Error('Unsupported backup format or version.');
        if (typeof imported.exportedAt !== 'string' || Number.isNaN(Date.parse(imported.exportedAt))) throw new Error('The backup export date is invalid.');
        if (!isPlainObject(imported.data)) throw new Error('The backup data field must be a JSON object.');
        source = imported.data;
    } else {
        source = imported;
    }

    const normalized = {};
    Object.entries(source).forEach(([key, value]) => {
        if (!SUPPORTED_STORAGE_KEYS.has(key)) {
            if (Object.hasOwn(LEGACY_SIDEBAR_KEY_MAP, key)) return;
            if (isVersioned) throw new Error(`Unsupported backup key: ${key}`);
            return;
        }
        validateStorageValue(key, value);
        normalized[key] = value;
    });
    Object.entries(LEGACY_SIDEBAR_KEY_MAP).forEach(([legacyKey, currentKey]) => {
        if (!Object.hasOwn(normalized, currentKey) && Object.hasOwn(source, legacyKey)) {
            validateStorageValue(currentKey, source[legacyKey]);
            normalized[currentKey] = source[legacyKey];
        }
    });
    if (Object.keys(normalized).length === 0) throw new Error('The backup does not contain any supported data.');
    return { data: normalized, legacy: !isVersioned };
}

function clearSupportedStorage() {
    SUPPORTED_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    Object.keys(LEGACY_SIDEBAR_KEY_MAP).forEach(key => localStorage.removeItem(key));
}

function storedColor(key, fallback) {
    const value = localStorage.getItem(key);
    return value && HEX_COLOR_PATTERN.test(value) ? value : fallback;
}

function restoreBackupData(data) {
    const keysToSnapshot = [...SUPPORTED_STORAGE_KEYS, ...Object.keys(LEGACY_SIDEBAR_KEY_MAP)];
    const snapshot = Object.fromEntries(keysToSnapshot.map(key => [key, localStorage.getItem(key)]));
    try {
        clearSupportedStorage();
        Object.entries(data).forEach(([key, value]) => {
            if (value !== null) localStorage.setItem(key, value);
        });
    } catch (error) {
        clearSupportedStorage();
        Object.entries(snapshot).forEach(([key, value]) => {
            if (value !== null) localStorage.setItem(key, value);
        });
        throw error;
    }
}

// Friendly display names for types
const typeDisplayNames = {
    Hanger: 'Hangars',
    NavBeacon: 'Nav Beacons',
    Rocket: 'Rocket',
    RefuelOutpost: 'Fuel',
    HeliosReserve: 'Solar',
    Habitat: 'Habitat',
    RockySpire: 'Rockyspire',
    Maze: 'Maze',
    Ruin: 'Ruin',
    NDNS: 'NDNS',
    Cave: 'Cave',
    SeedVault: 'Seed Vault',
    Lazarus: 'Lazarus',
    OilRig: 'Oil Rig',
    SharkBay: 'Shark Bay',
    StarChild: 'Star Child',
    RollerFactory: 'Roller Factory',
    GyroPlatform: 'Gyro Platform',
    Silo: 'Silo'
};

// Get the marker color for a given type, checking user overrides first
export function getMarkerColor(type) {
    return storedColor(`marker-color-${type}`, defaultMarkerColors[type] || '#ffffff');
}

// Settings popup functionality
const settingsPopup = document.getElementById('settings-popup');
const settingsButton = document.getElementById('settings-button');
const closeSettingsButton = document.getElementById('close-settings');
const clearDataButton = document.getElementById('clear-data-button');
const showHiddenCheckbox = document.getElementById('show-hidden-locations');
const showLastListenerCheckbox = document.getElementById('show-last-listener');
const showCavesCheckbox = document.getElementById('show-caves');
const showPrimaryNumbersCheckbox = document.getElementById('show-primary-numbers');
const showVisitOverlaysCheckbox = document.getElementById('show-visit-overlays');
const useSolidBackgroundCheckbox = document.getElementById('use-solid-background');
const backgroundColorPicker = document.getElementById('background-color');

// Open settings popup
settingsButton.addEventListener('click', () => {
    settingsPopup.classList.add('active');
    // Load current settings state
    loadSettingsState();
});

// Close settings popup
closeSettingsButton.addEventListener('click', () => {
    settingsPopup.classList.remove('active');
});

// Close popup when clicking outside
settingsPopup.addEventListener('click', (e) => {
    if (e.target === settingsPopup) {
        settingsPopup.classList.remove('active');
    }
});

// Close popup with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsPopup.classList.contains('active')) {
        settingsPopup.classList.remove('active');
    }
});

// Clear local data
clearDataButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all local data? This will reset all visibility preferences.')) {
        clearSupportedStorage();
        window.location.reload();
    }
});

// Load settings state from localStorage
function loadSettingsState() {
    const showHidden = localStorage.getItem('show-hidden-locations') === 'true';
    const showLastListener = localStorage.getItem('show-last-listener') === 'true';
    const showCaves = localStorage.getItem('show-caves') === 'true';
    const showPrimaryNumbers = localStorage.getItem('show-primary-numbers') === 'true';
    const showVisitOverlays = localStorage.getItem('show-visit-overlays') !== 'false';
    const useSolidBackground = localStorage.getItem('use-solid-background') === 'true';
    const backgroundColor = storedColor('background-color', '#17531b');

    showHiddenCheckbox.checked = showHidden;
    showLastListenerCheckbox.checked = showLastListener;
    showCavesCheckbox.checked = showCaves;
    showPrimaryNumbersCheckbox.checked = showPrimaryNumbers;
    showVisitOverlaysCheckbox.checked = showVisitOverlays;
    useSolidBackgroundCheckbox.checked = useSolidBackground;
    backgroundColorPicker.value = backgroundColor;

    // Populate marker color pickers
    populateColorSettings();
}

// Save settings state to localStorage
function saveSettingsState() {
    localStorage.setItem('show-hidden-locations', showHiddenCheckbox.checked);
    localStorage.setItem('show-last-listener', showLastListenerCheckbox.checked);
    localStorage.setItem('show-caves', showCavesCheckbox.checked);
    localStorage.setItem('show-primary-numbers', showPrimaryNumbersCheckbox.checked);
    localStorage.setItem('show-visit-overlays', showVisitOverlaysCheckbox.checked);
    localStorage.setItem('use-solid-background', useSolidBackgroundCheckbox.checked);
    localStorage.setItem('background-color', backgroundColorPicker.value);
}

// Handle show hidden locations toggle
showHiddenCheckbox.addEventListener('change', () => {
    saveSettingsState();
    refreshDisplay();
});

// Handle show last listener locations toggle
showLastListenerCheckbox.addEventListener('change', () => {
    saveSettingsState();
    refreshDisplay();
});

// Handle show caves toggle
showCavesCheckbox.addEventListener('change', () => {
    saveSettingsState();
    refreshDisplay();
});

// Handle display primary numbers toggle
showPrimaryNumbersCheckbox.addEventListener('change', () => {
    saveSettingsState();
    refreshDisplay();
});

// Handle show visit overlays toggle (no full refresh needed, just apply CSS class)
showVisitOverlaysCheckbox.addEventListener('change', () => {
    saveSettingsState();
    applyVisitOverlayVisibility();
});

// Handle use solid background toggle
useSolidBackgroundCheckbox.addEventListener('change', () => {
    saveSettingsState();
    applyBackgroundStyle();
});

// Handle background color change
backgroundColorPicker.addEventListener('input', () => {
    saveSettingsState();
    applyBackgroundStyle();
});

// Apply background style based on settings
function applyBackgroundStyle() {
    const useSolid = localStorage.getItem('use-solid-background') === 'true';
    const bgColor = storedColor('background-color', '#17531b');
    const mapElement = document.getElementById('map');

    if (useSolid) {
        mapElement.style.background = bgColor;
        toggleBackgroundLayer(false); // Hide the background image layer
    } else {
        mapElement.style.background = '#000000';
        toggleBackgroundLayer(true); // Show the background image layer
    }
}

// Populate marker color settings grid
function populateColorSettings() {
    const container = document.getElementById('marker-color-settings');
    if (!container) return;
    container.innerHTML = '';

    Object.keys(defaultMarkerColors).forEach(type => {
        const currentColor = getMarkerColor(type);
        const row = document.createElement('div');
        row.className = 'color-setting-row';
        row.innerHTML = `
            <label for="color-${type}">${typeDisplayNames[type] || type}</label>
            <input type="color" id="color-${type}" value="${currentColor}" data-type="${type}">
        `;
        container.appendChild(row);

        const input = row.querySelector(`#color-${type}`);
        input.addEventListener('input', (e) => {
            localStorage.setItem(`marker-color-${type}`, e.target.value);
            refreshDisplay();
        });
    });
}

// Reset colors to defaults
const resetColorsButton = document.getElementById('reset-colors-button');
if (resetColorsButton) {
    resetColorsButton.addEventListener('click', () => {
        Object.keys(defaultMarkerColors).forEach(type => {
            localStorage.removeItem(`marker-color-${type}`);
        });
        populateColorSettings();
        refreshDisplay();
    });
}

// Set all colors to white
const allWhiteButton = document.getElementById('all-white-button');
if (allWhiteButton) {
    allWhiteButton.addEventListener('click', () => {
        Object.keys(defaultMarkerColors).forEach(type => {
            localStorage.setItem(`marker-color-${type}`, '#ffffff');
        });
        populateColorSettings();
        refreshDisplay();
    });
}

// Export data
const exportDataButton = document.getElementById('export-data-button');
if (exportDataButton) {
    exportDataButton.addEventListener('click', () => {
        try {
            const backup = {
                format: BACKUP_FORMAT,
                version: BACKUP_VERSION,
                exportedAt: new Date().toISOString(),
                data: Object.fromEntries([...SUPPORTED_STORAGE_KEYS].map(key => [key, localStorage.getItem(key)]))
            };
            const dataStr = JSON.stringify(backup, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `tlc-map-plus-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Export error:', err);
            alert('Error exporting data. Check console for details.');
        }
    });
}

// Import data
const importDataButton = document.getElementById('import-data-button');
const importFileInput = document.getElementById('import-file-input');
if (importDataButton && importFileInput) {
    importDataButton.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                const validated = validateAndNormalizeBackup(importedData);
                const compatibilityNote = validated.legacy ? ' This older backup will be migrated to the current format.' : '';
                if (confirm(`Import validated backup? This will overwrite your current preferences.${compatibilityNote}`)) {
                    restoreBackupData(validated.data);
                    window.location.reload();
                }
            } catch (err) {
                console.error('Import error:', err);
                alert(`Backup was not imported: ${err.message}`);
            }
        };
        reader.readAsText(file);

        // Reset the input so the same file can be imported again
        importFileInput.value = '';
    });
}

// Apply background style on page load (delayed to ensure proper initialization)
requestAnimationFrame(() => applyBackgroundStyle());
