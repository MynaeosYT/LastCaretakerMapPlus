import L from 'leaflet';
import questData from './data/quests.json';
import eventData from './data/world_events.json';
import { isRelatedLocationVisible, LOCATION_VISIBILITY_EVENT } from './location-visibility.js';

const STATUS_KEY = 'tlc-quest-status-v1';
const FILTER_KEY = 'tlc-quest-filters-v1';
const MARKER_TRIGGERS = new Set(['proximity', 'arrival', 'interaction', 'scan']);
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const titleCase = (value) => String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function loadObject(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
}

function questSearchText(quest) {
    return [quest.name, ...quest.aliases, quest.initiatedBy,
        ...quest.startLocations.flatMap((location) => [location.name, location.note]),
        ...quest.objectiveLocations.flatMap((location) => [location.name, location.note])]
        .join(' ').toLocaleLowerCase();
}

function eventSearchText(event) {
    return [event.name, 'Jonah whale oil whale world event', event.locationName,
        `${event.longitude}:${event.latitude}`, ...event.notes].join(' ').toLocaleLowerCase();
}

export function initQuests(map) {
    const quests = questData.quests;
    const events = eventData.events;
    const knownIds = new Set(quests.map((quest) => quest.id));
    const rawStatus = loadObject(STATUS_KEY);
    const status = Object.fromEntries(Object.entries(rawStatus).filter(([id, value]) => knownIds.has(id) && ['unknown', 'active', 'completed'].includes(value)));
    const saved = loadObject(FILTER_KEY);
    const filters = {
        showStarts: saved.showStarts === true,
        showObjectives: saved.showObjectives === true,
        showRewards: saved.showRewards === true,
        showEvents: saved.showEvents === true,
        showLockedEvents: saved.showLockedEvents === true
    };
    let questsExpanded = false;
    let eventsExpanded = false;
    let announcementPending = false;
    const questControls = document.getElementById('quest-controls');
    const questList = document.getElementById('quest-list');
    const eventControls = document.getElementById('world-event-controls');
    const eventList = document.getElementById('world-event-list');
    const searchInput = document.getElementById('location-search');
    const clearSearch = document.getElementById('clear-search');
    const startMarkers = new Map();
    const objectiveMarkers = new Map();
    const eventMarkers = new Map();

    const saveStatus = () => localStorage.setItem(STATUS_KEY, JSON.stringify(status));
    const saveFilters = () => localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    const isJonahComplete = () => status['quest-project-jonah'] === 'completed';
    const hasStartMarker = (quest) => quest.startLocations.length > 0 && (MARKER_TRIGGERS.has(quest.triggerType) || quest.suggestedDefaultMapVisibility === true);

    function questIcon(quest, objective = false) {
        const state = status[quest.id] || 'unknown';
        return L.divIcon({
            className: 'quest-marker-wrapper',
            html: `<div class="quest-marker${objective ? ' is-objective' : ''} is-${state}">${objective ? '<span>•</span>' : '<span class="quest-start-glyph"></span>'}</div>`,
            iconSize: objective ? [22, 22] : [32, 32], iconAnchor: objective ? [11, 11] : [16, 28], popupAnchor: [0, -25]
        });
    }

    const eventIcon = (locked) => L.divIcon({
        className: 'world-event-marker-wrapper',
        html: `<div class="world-event-marker${locked ? ' is-locked' : ''}"><span class="whale-glyph"></span></div>`,
        iconSize: [38, 30], iconAnchor: [19, 25], popupAnchor: [0, -24]
    });

    function detailsHtml(quest) {
        const objectives = quest.objectiveLocations.length
            ? `<h4>Objectives / relevant POIs</h4><ol>${quest.objectiveLocations.map((location) => `<li><strong>${escapeHtml(location.name)}</strong><br><small>${escapeHtml(location.note)}</small></li>`).join('')}</ol>` : '';
        const prerequisites = quest.prerequisiteQuests.length ? `<p><strong>Prerequisites:</strong> ${escapeHtml(quest.prerequisiteQuests.join(', '))}</p>` : '';
        const notes = quest.notes.length ? `<h4>Notes / uncertainty</h4>${quest.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}` : '';
        const rewards = filters.showRewards ? '<p><strong>Rewards:</strong> No reward data is documented in this dataset.</p>' : '';
        return `${objectives}${prerequisites}${rewards}${notes}`;
    }

    function questPopup(quest, location, objective = false) {
        const state = status[quest.id] || 'unknown';
        return `<div class="popup-content quest-popup"><h3>! ${escapeHtml(quest.name.toUpperCase())}</h3>
            <p><strong>${objective ? 'Objective / relevant POI' : 'Quest Start'}</strong></p>
            <p>${escapeHtml(location.name)}</p>
            <p><strong>Trigger:</strong> ${escapeHtml(quest.initiatedBy || titleCase(quest.triggerType))}</p>
            <p><strong>Confidence:</strong> ${escapeHtml(titleCase(quest.confidence))}${quest.playerVerified ? ' · Player verified' : ''}</p>
            <label class="quest-status-label">Status <select data-quest-status="${escapeHtml(quest.id)}"><option value="unknown"${state === 'unknown' ? ' selected' : ''}>Unknown</option><option value="active"${state === 'active' ? ' selected' : ''}>Active</option><option value="completed"${state === 'completed' ? ' selected' : ''}>Completed</option></select></label>
            <details><summary>Show quest details</summary><div class="quest-details">${detailsHtml(quest)}</div></details></div>`;
    }

    function eventPopup(event) {
        const locked = !isJonahComplete();
        const visibleNotes = event.notes.filter((note) => !note.includes('38:118'));
        const coordinate = event.coordinatePrecision === 'poi' ? '' : `<p><strong>Coordinates:</strong> ${escapeHtml(event.longitude)}:${escapeHtml(event.latitude)}</p>`;
        const distance = event.reportedActivationDistanceMeters ? `<p><strong>Reported activation distance:</strong> ~${event.reportedActivationDistanceMeters} m</p>` : '';
        return `<div class="popup-content world-event-popup"><h3>OIL WHALE</h3><p><strong>Project Jonah World Event</strong></p>
            <p><strong>Area:</strong> ${escapeHtml(event.locationName)}</p>${coordinate}<p><strong>Trigger:</strong> Approach the area</p>
            <p><strong>Requires:</strong> Project Jonah completed${locked ? ' (not marked complete)' : ''}</p>${distance}
            <p><strong>Spawn reliability:</strong> ${escapeHtml(titleCase(event.publicSpawnReliability))}</p>
            ${event.coordinatePrecision === 'poi' ? '<p>Map marker uses Platform Omega as a POI anchor, not an exact whale position.</p>' : ''}
            <details><summary>Show event notes</summary>${visibleNotes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</details></div>`;
    }

    function wireQuestPopup(marker, quest) {
        const select = marker.getPopup()?.getElement()?.querySelector('[data-quest-status]');
        select?.addEventListener('change', () => {
            const wasJonahComplete = isJonahComplete();
            status[quest.id] = select.value;
            saveStatus();
            if (quest.id === 'quest-project-jonah' && !wasJonahComplete && isJonahComplete()) announcementPending = true;
            updateIcons(); refresh();
        });
    }

    quests.forEach((quest) => {
        if (hasStartMarker(quest)) quest.startLocations.forEach((location, index) => {
            const key = `${quest.id}::start::${index}`;
            const marker = L.marker([-location.latitude, location.longitude], { icon: questIcon(quest), title: `${quest.name} · Quest Start` });
            marker.bindPopup(() => questPopup(quest, location), { maxWidth: 430, maxHeight: 520 });
            marker.on('popupopen', () => wireQuestPopup(marker, quest));
            startMarkers.set(key, { marker, quest, location });
        });
        quest.objectiveLocations.forEach((location, index) => {
            const key = `${quest.id}::objective::${index}`;
            const marker = L.marker([-location.latitude, location.longitude], { icon: questIcon(quest, true), title: `${quest.name} · Objective` });
            marker.bindPopup(() => questPopup(quest, location, true), { maxWidth: 430, maxHeight: 520 });
            marker.on('popupopen', () => wireQuestPopup(marker, quest));
            objectiveMarkers.set(key, { marker, quest, location });
        });
    });

    events.forEach((event) => {
        const marker = L.marker([-event.latitude, event.longitude], { icon: eventIcon(!isJonahComplete()), title: event.name });
        marker.bindPopup(() => eventPopup(event), { maxWidth: 400 });
        eventMarkers.set(event.id, { marker, event });
    });

    function updateIcons() {
        startMarkers.forEach(({ marker, quest }) => marker.setIcon(questIcon(quest)));
        objectiveMarkers.forEach(({ marker, quest }) => marker.setIcon(questIcon(quest, true)));
        eventMarkers.forEach(({ marker }) => marker.setIcon(eventIcon(!isJonahComplete())));
    }

    function revealMarker(entry, kind) {
        if (kind === 'event') { filters.showEvents = true; filters.showLockedEvents = true; eventsExpanded = true; }
        else { filters.showStarts = true; questsExpanded = true; }
        saveFilters(); refresh();
        const marker = entry.marker;
        if (!map.hasLayer(marker)) marker.addTo(map);
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 5)); marker.openPopup();
    }

    function renderControls() {
        const completed = quests.filter((quest) => status[quest.id] === 'completed').length;
        questControls.innerHTML = `<div class="quest-control-title"><strong>Quests</strong><span>${completed}/${quests.length} completed</span></div><div class="quest-filters">
            <label><input type="checkbox" data-quest-filter="showStarts" ${filters.showStarts ? 'checked' : ''}>Show quest starts</label>
            <label><input type="checkbox" data-quest-filter="showObjectives" ${filters.showObjectives ? 'checked' : ''} ${filters.showStarts ? '' : 'disabled'}>Show objectives</label>
            <label><input type="checkbox" data-quest-filter="showRewards" ${filters.showRewards ? 'checked' : ''}>Show rewards</label></div>`;
        eventControls.innerHTML = `<div class="world-event-title"><strong>World Events</strong><span>Project Jonah</span></div><div class="world-event-filters">
            <label><input type="checkbox" data-event-filter="showEvents" ${filters.showEvents ? 'checked' : ''}>Project Jonah Whales</label>
            <label><input type="checkbox" data-event-filter="showLockedEvents" ${filters.showLockedEvents ? 'checked' : ''}>Show Jonah locations anyway</label></div>
            ${announcementPending ? '<div class="jonah-notice"><strong>Project Jonah completed</strong><span>3 Oil Whale locations are now available.</span><button type="button">Show locations</button></div>' : ''}`;
        questControls.querySelectorAll('[data-quest-filter]').forEach((input) => input.addEventListener('change', () => {
            filters[input.dataset.questFilter] = input.checked; saveFilters(); refresh();
        }));
        eventControls.querySelectorAll('[data-event-filter]').forEach((input) => input.addEventListener('change', () => {
            filters[input.dataset.eventFilter] = input.checked; saveFilters(); refresh();
        }));
        eventControls.querySelector('.jonah-notice button')?.addEventListener('click', () => {
            filters.showEvents = true; announcementPending = false; saveFilters(); refresh();
        });
    }

    function section(container, title, count, expanded, onToggle, items) {
        container.innerHTML = '';
        if (!items.length) return;
        const wrapper = document.createElement('section'); wrapper.className = 'quest-section';
        const header = document.createElement('button'); header.className = 'sample-section-header quest-section-header'; header.type = 'button'; header.setAttribute('aria-expanded', String(expanded));
        header.innerHTML = `<span>${escapeHtml(title)} (${count})</span><span class="sample-section-toggle">${expanded ? '▼' : '▶'}</span>`;
        const content = document.createElement('div'); content.className = 'quest-section-content'; content.hidden = !expanded;
        items.forEach(({ label, meta, click, state }) => { const button = document.createElement('button'); button.type = 'button'; button.className = `quest-list-item${state === 'completed' ? ' is-completed' : ''}`; button.innerHTML = `<span class="quest-list-glyph">${title === 'World Events' ? '<span class="whale-glyph"></span>' : '!'}</span><span>${escapeHtml(label)}<small>${escapeHtml(meta)}</small></span>`; button.addEventListener('click', click); content.appendChild(button); });
        header.addEventListener('click', onToggle); wrapper.append(header, content); container.appendChild(wrapper);
    }

    function refresh() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const questLocationIsVisible = (quest) => {
            const mappedLocations = [...quest.startLocations, ...quest.objectiveLocations];
            return mappedLocations.length === 0 || mappedLocations.some(isRelatedLocationVisible);
        };
        const matchingQuests = quests.filter((quest) => questLocationIsVisible(quest) && (!query || questSearchText(quest).includes(query)));
        const matchingEvents = events.filter((event) => !query || eventSearchText(event).includes(query));
        if (query && matchingQuests.length) questsExpanded = true;
        if (query && matchingEvents.length) eventsExpanded = true;
        startMarkers.forEach(({ marker, quest, location }) => { const show = filters.showStarts && isRelatedLocationVisible(location) && (!query || matchingQuests.includes(quest)); if (show && !map.hasLayer(marker)) marker.addTo(map); if (!show && map.hasLayer(marker)) map.removeLayer(marker); });
        objectiveMarkers.forEach(({ marker, quest, location }) => { const show = filters.showStarts && filters.showObjectives && isRelatedLocationVisible(location) && (!query || matchingQuests.includes(quest)); if (show && !map.hasLayer(marker)) marker.addTo(map); if (!show && map.hasLayer(marker)) map.removeLayer(marker); });
        eventMarkers.forEach(({ marker, event }) => { const unlocked = isJonahComplete() || filters.showLockedEvents || Boolean(query); const show = filters.showEvents && unlocked && isRelatedLocationVisible(event) && (!query || matchingEvents.includes(event)); if (show && !map.hasLayer(marker)) marker.addTo(map); if (!show && map.hasLayer(marker)) map.removeLayer(marker); });
        renderControls();
        section(questList, 'Quest Starts', matchingQuests.length, questsExpanded, () => { questsExpanded = !questsExpanded; refresh(); }, matchingQuests.map((quest) => {
            const start = [...startMarkers.values()].find((entry) => entry.quest.id === quest.id && isRelatedLocationVisible(entry.location));
            const objective = [...objectiveMarkers.values()].find((entry) => entry.quest.id === quest.id && isRelatedLocationVisible(entry.location));
            const target = start || objective;
            return { label: quest.name, meta: target ? `${titleCase(quest.triggerType)} · ${target.location.name}` : `${titleCase(quest.triggerType)} · No reliable map position`, state: status[quest.id] || 'unknown', click: () => target && revealMarker(target, start ? 'start' : 'objective') };
        }));
        section(eventList, 'World Events', matchingEvents.length, eventsExpanded, () => { eventsExpanded = !eventsExpanded; refresh(); }, matchingEvents.map((event) => ({ label: event.name, meta: `${event.locationName}${isJonahComplete() ? '' : ' · locked'}`, click: () => revealMarker(eventMarkers.get(event.id), 'event') })));
    }

    searchInput.addEventListener('input', refresh);
    clearSearch.addEventListener('click', () => setTimeout(refresh));
    window.addEventListener(LOCATION_VISIBILITY_EVENT, refresh);
    refresh();
    return { refresh, quests, events, startMarkers, objectiveMarkers, eventMarkers };
}
