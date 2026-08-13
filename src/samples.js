import L from 'leaflet';
import sampleData from './data/samples.json';
import { isRelatedLocationVisible, LOCATION_VISIBILITY_EVENT } from './location-visibility.js';
import { getPoiDisplayPosition } from './poi-layout.js';

const STATUS_KEY = 'tlc-sample-status-v1';
const FILTER_KEY = 'tlc-sample-filters-v1';
const CATEGORY_KEY_PREFIX = 'tlc-sample-category-v1-';

const CATEGORY_CONFIG = {
    holo_memory: { label: 'Holo Memories', short: 'H', color: '#58d6ff' },
    cave_painting: { label: 'Cave Paintings', short: 'C', color: '#ffb347' },
    rock_painting: { label: 'Rock / Wall Paintings', short: 'R', color: '#d991ff' }
};

const PRECISION_LABELS = {
    exact: 'Exact community coordinate',
    poi: 'POI / entrance anchor',
    approximate: 'Approximate search anchor'
};

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function loadJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value && typeof value === 'object' ? value : fallback;
    } catch {
        return fallback;
    }
}

function createDisplayPositions(samples) {
    const groups = new Map();
    samples.forEach((sample) => {
        const key = `${sample.longitude}:${sample.latitude}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(sample);
    });

    const positions = new Map();
    groups.forEach((group) => {
        group.forEach((sample, index) => {
            if (group.length === 1) {
                positions.set(sample.id, [-sample.latitude, sample.longitude]);
                return;
            }
            const ring = Math.floor(index / 8);
            const indexOnRing = index % 8;
            const itemsOnRing = Math.min(8, group.length - ring * 8);
            const angle = (Math.PI * 2 * indexOnRing) / itemsOnRing;
            const radius = 1.25 + ring * 0.85;
            positions.set(sample.id, [
                -sample.latitude + Math.sin(angle) * radius,
                sample.longitude + Math.cos(angle) * radius
            ]);
        });
    });
    return positions;
}

function sampleMatches(sample, query) {
    if (!query) return true;
    const fields = [
        sample.sampleId,
        `sample ${sample.sampleId}`,
        `#${sample.sampleId}`,
        sample.name,
        sample.locationName,
        sample.positionNote,
        ...(sample.aliases || [])
    ];
    return fields.some((field) => String(field).toLocaleLowerCase().includes(query));
}

export function initSamples(map) {
    const samples = sampleData.samples;
    const displayPositions = createDisplayPositions(samples);
    const status = loadJson(STATUS_KEY, {});
    const savedFilters = loadJson(FILTER_KEY, {});
    const filters = {
        uncollectedOnly: Boolean(savedFilters.uncollectedOnly),
        exactOnly: Boolean(savedFilters.exactOnly),
        showPoi: savedFilters.showPoi !== false,
        showApproximate: savedFilters.showApproximate !== false
    };
    const categoryVisible = Object.fromEntries(Object.keys(CATEGORY_CONFIG).map((category) => [
        category,
        localStorage.getItem(`${CATEGORY_KEY_PREFIX}${category}`) !== 'false'
    ]));
    const markers = new Map();
    const expandedCategories = new Set();
    let selectedSampleId = null;

    const controls = document.getElementById('sample-controls');
    const list = document.getElementById('sample-list');
    const searchInput = document.getElementById('location-search');
    const clearSearch = document.getElementById('clear-search');

    function isCollected(sample) {
        return status[sample.id] === 'collected';
    }

    function saveStatus() {
        localStorage.setItem(STATUS_KEY, JSON.stringify(status));
    }

    function saveFilters() {
        localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    }

    function createIcon(sample) {
        const config = CATEGORY_CONFIG[sample.category];
        const collectedClass = isCollected(sample) ? ' is-collected' : '';
        return L.divIcon({
            className: 'sample-marker-wrapper',
            html: `<div class="sample-marker sample-category-${sample.category} sample-precision-${sample.coordinatePrecision}${collectedClass}" title="${escapeHtml(PRECISION_LABELS[sample.coordinatePrecision])}"><span>${config.short}</span><small>${sample.coordinatePrecision === 'exact' ? 'E' : sample.coordinatePrecision === 'poi' ? 'P' : 'A'}</small></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -18]
        });
    }

    function popupHtml(sample) {
        const config = CATEGORY_CONFIG[sample.category];
        const collected = isCollected(sample);
        return `
            <div class="popup-content sample-popup">
                <h3>Sample #${escapeHtml(sample.sampleId)} – ${escapeHtml(sample.name)}</h3>
                <p><strong>Category:</strong> ${escapeHtml(config.label)}</p>
                <p><strong>Location:</strong> ${escapeHtml(sample.locationName)}</p>
                <p><strong>Coordinates:</strong> ${escapeHtml(sample.longitude)}:${escapeHtml(sample.latitude)}</p>
                <p><strong>Precision:</strong> <span class="precision-badge precision-${sample.coordinatePrecision}">${escapeHtml(PRECISION_LABELS[sample.coordinatePrecision])}</span></p>
                <p><strong>Position:</strong> ${escapeHtml(sample.positionNote || 'No additional note')}</p>
                <p><strong>Underwater:</strong> ${sample.underwater ? 'Yes' : 'No'}${sample.depthMeters != null ? ` (${escapeHtml(sample.depthMeters)} m)` : ''}</p>
                <p><strong>Status:</strong> <span class="sample-status-text">${collected ? 'Collected' : 'Uncollected'}</span></p>
                <button class="sample-status-button" data-sample-id="${escapeHtml(sample.id)}">Mark as ${collected ? 'uncollected' : 'collected'}</button>
            </div>`;
    }

    function updateMarkerIcon(sample) {
        const marker = markers.get(sample.id);
        if (marker) marker.setIcon(createIcon(sample));
    }

    function toggleCollected(sample) {
        if (isCollected(sample)) delete status[sample.id];
        else status[sample.id] = 'collected';
        saveStatus();
        updateMarkerIcon(sample);
        refresh();
        const marker = markers.get(sample.id);
        if (marker && map.hasLayer(marker)) marker.openPopup();
    }

    samples.forEach((sample) => {
        const marker = L.marker(getPoiDisplayPosition(`sample:${sample.id}`, displayPositions.get(sample.id)), {
            icon: createIcon(sample),
            title: `Sample #${sample.sampleId}: ${sample.name}`
        });
        marker.bindPopup(() => popupHtml(sample));
        marker.on('popupopen', (event) => {
            selectedSampleId = sample.id;
            const button = event.popup.getElement()?.querySelector('.sample-status-button');
            button?.addEventListener('click', () => toggleCollected(sample), { once: true });
        });
        marker.on('popupclose', () => {
            if (selectedSampleId === sample.id) selectedSampleId = null;
        });
        markers.set(sample.id, marker);
    });

    function renderControls() {
        controls.innerHTML = '';
        const collectedCount = samples.filter(isCollected).length;
        const progress = document.createElement('div');
        progress.className = 'sample-overall-progress';
        progress.textContent = `${collectedCount} / ${samples.length} Samples`;
        controls.appendChild(progress);

        const categories = document.createElement('div');
        categories.className = 'sample-category-filters';
        Object.entries(CATEGORY_CONFIG).forEach(([category, config]) => {
            const total = samples.filter((sample) => sample.category === category).length;
            const collected = samples.filter((sample) => sample.category === category && isCollected(sample)).length;
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" data-sample-category="${category}" ${categoryVisible[category] ? 'checked' : ''}><span>${escapeHtml(config.label)} (${collected}/${total})</span>`;
            categories.appendChild(label);
        });
        controls.appendChild(categories);

        const filterBox = document.createElement('div');
        filterBox.className = 'sample-detail-filters';
        const filterDefinitions = [
            ['uncollectedOnly', 'Only uncollected'],
            ['exactOnly', 'Only exact coordinates'],
            ['showPoi', 'Show POI anchors'],
            ['showApproximate', 'Show approximate anchors']
        ];
        filterDefinitions.forEach(([key, labelText]) => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" data-sample-filter="${key}" ${filters[key] ? 'checked' : ''}><span>${labelText}</span>`;
            filterBox.appendChild(label);
        });
        controls.appendChild(filterBox);

        controls.querySelectorAll('[data-sample-category]').forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                const category = checkbox.dataset.sampleCategory;
                categoryVisible[category] = checkbox.checked;
                localStorage.setItem(`${CATEGORY_KEY_PREFIX}${category}`, checkbox.checked);
                refresh();
            });
        });
        controls.querySelectorAll('[data-sample-filter]').forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                filters[checkbox.dataset.sampleFilter] = checkbox.checked;
                saveFilters();
                refresh();
            });
        });
    }

    function passesFilters(sample, queryMatch) {
        if (queryMatch && searchInput.value.trim()) return true;
        if (filters.uncollectedOnly && isCollected(sample)) return false;
        if (filters.exactOnly && sample.coordinatePrecision !== 'exact') return false;
        if (!filters.showPoi && sample.coordinatePrecision === 'poi') return false;
        if (!filters.showApproximate && sample.coordinatePrecision === 'approximate') return false;
        return true;
    }

    function revealSample(sample) {
        categoryVisible[sample.category] = true;
        localStorage.setItem(`${CATEGORY_KEY_PREFIX}${sample.category}`, 'true');
        filters.uncollectedOnly = false;
        if (sample.coordinatePrecision !== 'exact') filters.exactOnly = false;
        if (sample.coordinatePrecision === 'poi') filters.showPoi = true;
        if (sample.coordinatePrecision === 'approximate') filters.showApproximate = true;
        saveFilters();
        refresh();
        const marker = markers.get(sample.id);
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 5));
        marker.openPopup();
    }

    function renderList(visibleSamples) {
        list.innerHTML = '';
        const hasSearchQuery = Boolean(searchInput.value.trim());
        Object.entries(CATEGORY_CONFIG).forEach(([category, config]) => {
            const categorySamples = visibleSamples.filter((sample) => sample.category === category);
            if (!categorySamples.length) return;
            if (hasSearchQuery) expandedCategories.add(category);
            const section = document.createElement('section');
            section.className = 'sample-section';
            const heading = document.createElement('button');
            heading.type = 'button';
            heading.className = 'sample-section-header';
            const total = samples.filter((sample) => sample.category === category).length;
            const collected = samples.filter((sample) => sample.category === category && isCollected(sample)).length;
            const expanded = expandedCategories.has(category);
            heading.setAttribute('aria-expanded', String(expanded));
            heading.innerHTML = `<span>${escapeHtml(config.label)} (${collected}/${total})</span><span class="sample-section-toggle" aria-hidden="true">${expanded ? '▼' : '▶'}</span>`;
            section.appendChild(heading);
            const content = document.createElement('div');
            content.className = 'sample-section-content';
            content.hidden = !expanded;
            categorySamples.forEach((sample) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `sample-list-item${isCollected(sample) ? ' is-collected' : ''}`;
                item.innerHTML = `<span class="sample-list-id">#${escapeHtml(sample.sampleId)}</span><span>${escapeHtml(sample.name)}</span><small>${escapeHtml(sample.locationName)} · ${escapeHtml(sample.coordinatePrecision)}</small>`;
                item.addEventListener('click', () => revealSample(sample));
                content.appendChild(item);
            });
            heading.addEventListener('click', () => {
                if (expandedCategories.has(category)) expandedCategories.delete(category);
                else expandedCategories.add(category);
                renderList(visibleSamples);
            });
            section.appendChild(content);
            list.appendChild(section);
        });
    }

    function refresh() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const queryMatches = new Set(samples.filter((sample) => sampleMatches(sample, query)).map((sample) => sample.id));
        if (query) {
            samples.filter((sample) => queryMatches.has(sample.id)).forEach((sample) => {
                categoryVisible[sample.category] = true;
                localStorage.setItem(`${CATEGORY_KEY_PREFIX}${sample.category}`, 'true');
            });
        }

        const sidebarSamples = samples.filter((sample) => {
            const match = queryMatches.has(sample.id);
            return match && passesFilters(sample, match) && isRelatedLocationVisible(sample);
        });

        samples.forEach((sample) => {
            const marker = markers.get(sample.id);
            const match = queryMatches.has(sample.id);
            const shouldShow = categoryVisible[sample.category] && match && passesFilters(sample, match) && isRelatedLocationVisible(sample);
            if (shouldShow && !map.hasLayer(marker)) marker.addTo(map);
            if (!shouldShow && map.hasLayer(marker)) map.removeLayer(marker);
        });
        renderControls();
        renderList(sidebarSamples);
    }

    searchInput.addEventListener('input', refresh);
    clearSearch.addEventListener('click', () => setTimeout(refresh));
    window.addEventListener(LOCATION_VISIBILITY_EVENT, refresh);
    refresh();

    return { refresh, samples, markers };
}
