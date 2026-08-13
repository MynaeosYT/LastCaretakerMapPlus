import L from 'leaflet';
import paintData from './data/paint_schemes.json';
import { isRelatedLocationVisible, LOCATION_VISIBILITY_EVENT } from './location-visibility.js';
import { getPoiDisplayPosition } from './poi-layout.js';

const STATUS_KEY = 'tlc-paint-status-v1';
const FILTER_KEY = 'tlc-paint-filters-v1';
const PRECISION_LABELS = {
    exact: 'Exact community coordinate',
    poi: 'POI anchor',
    approximate: 'Approximate area anchor'
};

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function loadObject(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function cansForScheme(scheme) {
    if (scheme.cans.length) return scheme.cans;
    return Array.from({ length: scheme.wikiAmountFound }, (_, index) => ({
        canId: `can-${index + 1}`,
        canNumber: index + 1,
        quantityAtSpot: 1,
        locationName: scheme.locations[0].name,
        longitude: scheme.locations[0].longitude,
        latitude: scheme.locations[0].latitude,
        coordinatePrecision: scheme.locations[0].coordinatePrecision,
        positionNote: 'Individual can position not yet verified.',
        virtual: true
    }));
}

function offsetAnchorPositions(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
        const key = `${entry.location.longitude}:${entry.location.latitude}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    });
    const positions = new Map();
    groups.forEach((group) => group.forEach((entry, index) => {
        if (group.length === 1) {
            positions.set(entry.markerId, [-entry.location.latitude, entry.location.longitude]);
            return;
        }
        const ring = Math.floor(index / 8);
        const onRing = index % 8;
        const count = Math.min(8, group.length - ring * 8);
        const angle = (Math.PI * 2 * onRing) / count;
        const radius = 1.5 + ring;
        positions.set(entry.markerId, [
            -entry.location.latitude + Math.sin(angle) * radius,
            entry.location.longitude + Math.cos(angle) * radius
        ]);
    }));
    return positions;
}

function schemeMatches(scheme, query) {
    if (!query) return true;
    const fields = [
        scheme.name,
        'paint',
        'paint scheme',
        ...scheme.locations.flatMap((location) => [location.name, location.note]),
        ...scheme.cans.flatMap((can) => [can.locationName, can.positionNote]),
        ...scheme.notes
    ];
    return fields.some((field) => String(field ?? '').toLocaleLowerCase().includes(query));
}

export function initPaints(map) {
    const schemes = paintData.schemes;
    const status = loadObject(STATUS_KEY, { found: {}, unlocked: {} });
    if (!status.found || typeof status.found !== 'object') status.found = {};
    if (!status.unlocked || typeof status.unlocked !== 'object') status.unlocked = {};
    const savedFilters = loadObject(FILTER_KEY, {});
    const filters = {
        showPaints: savedFilters.showPaints !== false,
        incompleteOnly: Boolean(savedFilters.incompleteOnly),
        notUnlockedOnly: Boolean(savedFilters.notUnlockedOnly),
        exactPositions: Boolean(savedFilters.exactPositions)
    };
    let expanded = false;
    let activeMarker = null;

    const controls = document.getElementById('paint-controls');
    const list = document.getElementById('paint-list');
    const searchInput = document.getElementById('location-search');
    const clearSearch = document.getElementById('clear-search');
    const schemeMarkers = new Map();
    const exactMarkers = new Map();

    const anchorEntries = schemes.flatMap((scheme) => scheme.locations.map((location, index) => ({
        scheme,
        location,
        markerId: `${scheme.id}::${index}`
    })));
    const anchorPositions = offsetAnchorPositions(anchorEntries);

    function validFoundIds(scheme) {
        const validIds = new Set(cansForScheme(scheme).map((can) => can.canId));
        return new Set((Array.isArray(status.found[scheme.id]) ? status.found[scheme.id] : []).filter((id) => validIds.has(id)));
    }

    function foundCount(scheme) {
        return Math.min(validFoundIds(scheme).size, scheme.wikiAmountFound);
    }

    function isUnlocked(scheme) {
        return status.unlocked[scheme.id] === true;
    }

    function isComplete(scheme) {
        return foundCount(scheme) >= scheme.wikiAmountFound;
    }

    function saveStatus() {
        localStorage.setItem(STATUS_KEY, JSON.stringify(status));
    }

    function saveFilters() {
        localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    }

    function schemeIcon(scheme) {
        const found = foundCount(scheme);
        const complete = isComplete(scheme);
        const unlocked = isUnlocked(scheme);
        return L.divIcon({
            className: 'paint-marker-wrapper',
            html: `<div class="paint-marker${complete ? ' is-complete' : ''}${unlocked ? ' is-unlocked' : ''}"><span class="paint-can-glyph"></span><span class="paint-marker-count">${found}/${scheme.wikiAmountFound}</span>${unlocked ? '<span class="paint-unlock-badge" title="Unlock confirmed">✓</span>' : ''}</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 34],
            popupAnchor: [0, -36]
        });
    }

    function exactIcon(can, found) {
        return L.divIcon({
            className: 'paint-exact-marker-wrapper',
            html: `<div class="paint-exact-marker${found ? ' is-found' : ''}"><span class="paint-can-glyph"></span><small>${can.canNumber}</small></div>`,
            iconSize: [25, 25],
            iconAnchor: [12, 20],
            popupAnchor: [0, -22]
        });
    }

    function schemePopup(scheme, currentLocation) {
        const found = validFoundIds(scheme);
        const foundTotal = foundCount(scheme);
        const allCans = cansForScheme(scheme);
        const locationNames = scheme.locations.map((location) => location.name).join(', ');
        const uncertainty = [...scheme.notes];
        if (scheme.individualPositionsStatus === 'scheme-only') uncertainty.unshift('Individual can positions not yet verified.');
        if (scheme.reportedPhysicalCount && String(scheme.reportedPhysicalCount) !== String(scheme.wikiAmountFound)) {
            uncertainty.unshift(`Reported physical count: ${scheme.reportedPhysicalCount}; completion still uses ${scheme.wikiAmountFound}.`);
        }
        return `<div class="popup-content paint-popup">
            <h3>${escapeHtml(scheme.name)}</h3>
            <p><strong>Current area:</strong> ${escapeHtml(currentLocation.name)}</p>
            <p><strong>All areas:</strong> ${escapeHtml(locationNames)}</p>
            <div class="paint-progress-grid">
                <span>Found: <strong>${foundTotal}/${scheme.wikiAmountFound}</strong></span>
                <span>Unlock progress: <strong>${Math.min(foundTotal, scheme.unlockRequired)}/${scheme.unlockRequired}</strong></span>
                <span>Unlocked: <strong>${isUnlocked(scheme) ? 'Yes' : 'No'}</strong></span>
                <span>Complete: <strong>${isComplete(scheme) ? 'Yes' : 'No'}</strong></span>
            </div>
            ${foundTotal >= scheme.unlockRequired && !isUnlocked(scheme) ? '<p class="paint-unlock-hint">4 cans found – unlock should be possible, but is not confirmed.</p>' : ''}
            <button class="paint-unlock-toggle" data-scheme-id="${escapeHtml(scheme.id)}">${isUnlocked(scheme) ? 'Remove unlock confirmation' : 'Confirm unlocked in game'}</button>
            <h4>Cans</h4>
            <div class="paint-can-list">
                ${allCans.map((can) => `<button class="paint-can-row${found.has(can.canId) ? ' is-found' : ''}" data-can-id="${escapeHtml(can.canId)}">
                    <span class="paint-can-check">${found.has(can.canId) ? '✓' : '○'}</span>
                    <span><strong>#${can.canNumber}${can.quantityAtSpot > 1 ? ` ×${can.quantityAtSpot}` : ''}</strong> · ${escapeHtml(can.locationName)}<small>${escapeHtml(can.positionNote)} · ${escapeHtml(PRECISION_LABELS[can.coordinatePrecision])}</small></span>
                </button>`).join('')}
            </div>
            ${uncertainty.length ? `<div class="paint-notes"><strong>Notes / uncertainty</strong>${uncertainty.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</div>` : ''}
        </div>`;
    }

    function exactPopup(scheme, can) {
        const found = validFoundIds(scheme).has(can.canId);
        return `<div class="popup-content paint-popup paint-exact-popup">
            <h3>${escapeHtml(scheme.name)} · Can #${can.canNumber}</h3>
            <p><strong>Coordinates:</strong> ${escapeHtml(can.longitude)}:${escapeHtml(can.latitude)}</p>
            <p><strong>Location:</strong> ${escapeHtml(can.locationName)}</p>
            <p><strong>Precision:</strong> ${escapeHtml(PRECISION_LABELS[can.coordinatePrecision])}</p>
            <p>${escapeHtml(can.positionNote)}</p>
            <button class="paint-exact-toggle" data-can-id="${escapeHtml(can.canId)}">Mark ${found ? 'not found' : 'found'}</button>
        </div>`;
    }

    function toggleCan(scheme, canId) {
        const found = validFoundIds(scheme);
        if (found.has(canId)) found.delete(canId);
        else found.add(canId);
        status.found[scheme.id] = [...found];
        saveStatus();
    }

    function updateAllIcons(skipMarker = null) {
        anchorEntries.forEach((entry) => {
            const marker = schemeMarkers.get(entry.markerId);
            if (marker && marker !== skipMarker) marker.setIcon(schemeIcon(entry.scheme));
        });
        schemes.forEach((scheme) => scheme.cans.filter((can) => can.coordinatePrecision === 'exact').forEach((can) => {
            const marker = exactMarkers.get(`${scheme.id}::${can.canId}`);
            if (marker && marker !== skipMarker) marker.setIcon(exactIcon(can, validFoundIds(scheme).has(can.canId)));
        }));
    }

    function bindSchemePopup(marker, scheme, location) {
        const wirePopup = (popup) => {
            if (!popup) return;
            L.DomEvent.disableClickPropagation(popup);
            popup.onclick = (event) => {
                const canButton = event.target.closest('.paint-can-row');
                const unlockButton = event.target.closest('.paint-unlock-toggle');
                if ((!canButton && !unlockButton) || (!popup.contains(canButton) && !popup.contains(unlockButton))) return;
                L.DomEvent.stop(event);
                if (canButton) toggleCan(scheme, canButton.dataset.canId);
                if (unlockButton) {
                    status.unlocked[scheme.id] = !isUnlocked(scheme);
                    saveStatus();
                }
                updateAllIcons(marker);
                refresh();
                refreshOpenPaintPopup(marker, schemePopup(scheme, location), wirePopup);
            };
        };
        marker.bindPopup(() => schemePopup(scheme, location), { maxWidth: 430, maxHeight: 520 });
        marker.on('popupopen', (event) => {
            activeMarker = marker;
            wirePopup(event.popup.getElement());
        });
        marker.on('popupclose', () => marker.setIcon(schemeIcon(scheme)));
    }

    anchorEntries.forEach((entry) => {
        const markerIndex = entry.markerId.split('::')[1];
        const marker = L.marker(getPoiDisplayPosition(`paint:${entry.scheme.id}:${markerIndex}`, anchorPositions.get(entry.markerId)), {
            icon: schemeIcon(entry.scheme),
            title: `${entry.scheme.name} paint scheme · ${entry.location.name}`
        });
        bindSchemePopup(marker, entry.scheme, entry.location);
        schemeMarkers.set(entry.markerId, marker);
    });

    schemes.forEach((scheme) => scheme.cans.filter((can) => can.coordinatePrecision === 'exact').forEach((can) => {
        const key = `${scheme.id}::${can.canId}`;
        const marker = L.marker([-can.latitude, can.longitude], {
            icon: exactIcon(can, validFoundIds(scheme).has(can.canId)),
            title: `${scheme.name} can #${can.canNumber}`
        });
        const wireExactPopup = (popup) => {
            if (!popup) return;
            L.DomEvent.disableClickPropagation(popup);
            popup.onclick = (event) => {
                const button = event.target.closest('.paint-exact-toggle');
                if (!button || !popup.contains(button)) return;
                L.DomEvent.stop(event);
            toggleCan(scheme, can.canId);
            updateAllIcons(marker);
            refresh();
                refreshOpenPaintPopup(marker, exactPopup(scheme, can), wireExactPopup);
            };
        };
        marker.bindPopup(() => exactPopup(scheme, can));
        marker.on('popupopen', (event) => {
            activeMarker = marker;
            wireExactPopup(event.popup.getElement());
        });
        marker.on('popupclose', () => marker.setIcon(exactIcon(can, validFoundIds(scheme).has(can.canId))));
        exactMarkers.set(key, marker);
    }));

    function refreshOpenPaintPopup(marker, html, wire) {
        setTimeout(() => {
            if (!marker.isPopupOpen() && map.hasLayer(marker)) marker.openPopup();
            const popup = marker.getPopup()?.getElement();
            const content = popup?.querySelector('.leaflet-popup-content');
            if (!content) return;
            content.innerHTML = html;
            wire(popup);
            marker.getPopup().update();
        }, 0);
    }

    function renderControls() {
        const unlocked = schemes.filter(isUnlocked).length;
        const completed = schemes.filter(isComplete).length;
        const cans = schemes.reduce((sum, scheme) => sum + foundCount(scheme), 0);
        controls.innerHTML = `<div class="paint-overall-progress"><strong>Paint Schemes</strong><span>Unlocked ${unlocked}/37 · Completed ${completed}/37 · Cans ${cans}/190</span></div>
            <div class="paint-filters">
                <label><input type="checkbox" data-paint-filter="showPaints" ${filters.showPaints ? 'checked' : ''}>Show paint schemes</label>
                <label><input type="checkbox" data-paint-filter="incompleteOnly" ${filters.incompleteOnly ? 'checked' : ''}>Only incomplete</label>
                <label><input type="checkbox" data-paint-filter="notUnlockedOnly" ${filters.notUnlockedOnly ? 'checked' : ''}>Only not unlocked</label>
                <label><input type="checkbox" data-paint-filter="exactPositions" ${filters.exactPositions ? 'checked' : ''}>Show exact paint can positions</label>
            </div>`;
        controls.querySelectorAll('[data-paint-filter]').forEach((checkbox) => checkbox.addEventListener('change', () => {
            filters[checkbox.dataset.paintFilter] = checkbox.checked;
            saveFilters();
            refresh();
        }));
    }

    function passesFilters(scheme, queryMatch) {
        if (queryMatch && searchInput.value.trim()) return true;
        if (filters.incompleteOnly && isComplete(scheme)) return false;
        if (filters.notUnlockedOnly && isUnlocked(scheme)) return false;
        return true;
    }

    function revealScheme(scheme) {
        filters.showPaints = true;
        filters.incompleteOnly = false;
        filters.notUnlockedOnly = false;
        expanded = true;
        saveFilters();
        refresh();
        const entry = anchorEntries.find((candidate) => candidate.scheme.id === scheme.id && isRelatedLocationVisible(candidate.location));
        if (!entry) return;
        const marker = schemeMarkers.get(entry.markerId);
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 5));
        marker.openPopup();
    }

    function renderList(visibleSchemes) {
        const query = searchInput.value.trim();
        if (query && visibleSchemes.length) expanded = true;
        list.innerHTML = '';
        if (!visibleSchemes.length) return;
        const section = document.createElement('section');
        section.className = 'paint-section';
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'sample-section-header paint-section-header';
        header.setAttribute('aria-expanded', String(expanded));
        header.innerHTML = `<span>Paint Schemes (${visibleSchemes.length}/${schemes.length} shown)</span><span class="sample-section-toggle">${expanded ? '▼' : '▶'}</span>`;
        const content = document.createElement('div');
        content.className = 'paint-section-content';
        content.hidden = !expanded;
        visibleSchemes.forEach((scheme) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `paint-list-item${isComplete(scheme) ? ' is-complete' : ''}`;
            item.innerHTML = `<span class="paint-list-icon"><span class="paint-can-glyph"></span></span><span>${escapeHtml(scheme.name)}<small>${foundCount(scheme)}/${scheme.wikiAmountFound} found · ${isUnlocked(scheme) ? 'unlocked' : 'not unlocked'} · ${escapeHtml(scheme.locations.map((location) => location.name).join(', '))}</small></span>`;
            item.addEventListener('click', () => revealScheme(scheme));
            content.appendChild(item);
        });
        header.addEventListener('click', () => {
            expanded = !expanded;
            renderList(visibleSchemes);
        });
        section.append(header, content);
        list.appendChild(section);
    }

    function refresh() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const matching = new Set(schemes.filter((scheme) => schemeMatches(scheme, query)).map((scheme) => scheme.id));
        if (query && matching.size) filters.showPaints = true;
        const visibleSchemes = schemes.filter((scheme) => matching.has(scheme.id)
            && passesFilters(scheme, matching.has(scheme.id))
            && scheme.locations.some(isRelatedLocationVisible));
        const visibleIds = new Set(visibleSchemes.map((scheme) => scheme.id));

        anchorEntries.forEach((entry) => {
            const marker = schemeMarkers.get(entry.markerId);
            const show = filters.showPaints && visibleIds.has(entry.scheme.id) && isRelatedLocationVisible(entry.location);
            if (show && !map.hasLayer(marker)) marker.addTo(map);
            if (!show && map.hasLayer(marker)) map.removeLayer(marker);
        });
        schemes.forEach((scheme) => scheme.cans.filter((can) => can.coordinatePrecision === 'exact').forEach((can) => {
            const marker = exactMarkers.get(`${scheme.id}::${can.canId}`);
            const show = filters.showPaints && filters.exactPositions && visibleIds.has(scheme.id) && isRelatedLocationVisible(can);
            if (show && !map.hasLayer(marker)) marker.addTo(map);
            if (!show && map.hasLayer(marker)) map.removeLayer(marker);
        }));
        renderControls();
        renderList(visibleSchemes);
    }

    searchInput.addEventListener('input', refresh);
    clearSearch.addEventListener('click', () => setTimeout(refresh));
    window.addEventListener(LOCATION_VISIBILITY_EVENT, refresh);
    refresh();
    return { refresh, schemes, schemeMarkers, exactMarkers, get activeMarker() { return activeMarker; } };
}
