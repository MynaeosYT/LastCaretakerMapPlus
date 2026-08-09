import L from 'leaflet';
import secretData from './data/secrets.json';
import { isRelatedLocationVisible, LOCATION_VISIBILITY_EVENT } from './location-visibility.js';

const STATUS_KEY = 'tlc-secret-status-v1';
const REVEAL_KEY = 'tlc-secret-reveal-v1';
const FILTER_KEY = 'tlc-secret-filters-v1';
const USER_STATES = new Set(['unknown', 'found', 'solved']);
const TYPE_LABELS = {
    hidden_room: 'Hidden room', hidden_underwater_room: 'Hidden underwater room', hidden_path: 'Hidden path',
    conditional_door: 'Conditional door', item_gate: 'Inventory condition', power_gate: 'Power-gated area',
    multi_trigger_puzzle: 'Multi-trigger puzzle', environmental_puzzle: 'Environmental puzzle',
    destructible_gate: 'Destructible gate', hidden_button: 'Hidden button', hidden_mine: 'Hidden mine',
    hidden_landmark: 'Hidden landmark', details_incomplete: 'Research lead'
};
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const label = (value) => String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function loadObject(key) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
}

function offsetPositions(secrets) {
    const groups = new Map();
    secrets.forEach((secret) => { const key = `${secret.longitude}:${secret.latitude}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(secret); });
    const positions = new Map();
    groups.forEach((group) => group.forEach((secret, index) => {
        if (group.length === 1) { positions.set(secret.id, [-secret.latitude, secret.longitude]); return; }
        const ring = Math.floor(index / 8); const slot = index % 8; const count = Math.min(8, group.length - ring * 8);
        const angle = Math.PI * 2 * slot / count; const radius = 1.35 + ring * .8;
        positions.set(secret.id, [-secret.latitude + Math.sin(angle) * radius, secret.longitude + Math.cos(angle) * radius]);
    }));
    return positions;
}

function searchText(secret) {
    return [secret.name, secret.locationName, secret.secretType, TYPE_LABELS[secret.secretType], secret.hint, secret.solution,
        ...secret.tags, ...secret.accessConditions.flatMap((condition) => [condition.conditionType, condition.summary, condition.item, condition.room])]
        .join(' ').toLocaleLowerCase();
}

export function initSecrets(map) {
    const secrets = secretData.secrets;
    const knownIds = new Set(secrets.map((secret) => secret.id));
    const storedStatus = loadObject(STATUS_KEY);
    const status = Object.fromEntries(Object.entries(storedStatus).filter(([id, state]) => knownIds.has(id) && USER_STATES.has(state)));
    const storedReveal = loadObject(REVEAL_KEY);
    const reveal = Object.fromEntries(Object.entries(storedReveal).filter(([id, state]) => knownIds.has(id) && state && typeof state === 'object'));
    const saved = loadObject(FILTER_KEY);
    const filters = { showSecrets: saved.showSecrets === true, unsolvedOnly: saved.unsolvedOnly === true, showResearch: saved.showResearch === true };
    let expanded = false;
    const controls = document.getElementById('secret-controls');
    const list = document.getElementById('secret-list');
    const searchInput = document.getElementById('location-search');
    const clearSearch = document.getElementById('clear-search');
    const markers = new Map();
    const positions = offsetPositions(secrets);
    const saveStatus = () => localStorage.setItem(STATUS_KEY, JSON.stringify(status));
    const saveReveal = () => localStorage.setItem(REVEAL_KEY, JSON.stringify(reveal));
    const saveFilters = () => localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    const userState = (secret) => status[secret.id] || 'unknown';
    const revealState = (secret) => reveal[secret.id] || {};

    function icon(secret) {
        const state = userState(secret);
        return L.divIcon({ className: 'secret-marker-wrapper', html: `<div class="secret-marker is-${state}${secret.status === 'details_incomplete' ? ' is-research' : ''}"><span class="keyhole-glyph"></span></div>`, iconSize: [30, 34], iconAnchor: [15, 29], popupAnchor: [0, -27] });
    }

    function accessHtml(secret) {
        if (!secret.accessConditions.length) return '';
        return `<h4>Access conditions</h4><ol>${secret.accessConditions.map((condition) => `<li><strong>${escapeHtml(label(condition.conditionType))}:</strong> ${escapeHtml(condition.summary)}</li>`).join('')}</ol>`;
    }

    function popupHtml(secret) {
        const shown = revealState(secret); const state = userState(secret); const research = secret.status === 'details_incomplete';
        const precision = secret.coordinatePrecision === 'poi' ? 'POI search-area anchor' : secret.coordinatePrecision === 'approximate' ? 'Approximate search area' : `Coordinates: ${secret.longitude}:${secret.latitude}`;
        const hint = shown.hintRevealed ? `<div class="secret-reveal-panel"><strong>1 · Hint</strong><p>${escapeHtml(secret.hint)}</p></div>` : '<button type="button" data-secret-reveal="hintRevealed">1 · Reveal hint</button>';
        const solution = research ? '<button type="button" disabled>2 · Solution not documented</button>' : shown.solutionRevealed
            ? `<div class="secret-reveal-panel"><strong>Solution</strong><p>${escapeHtml(secret.solution)}</p>${accessHtml(secret)}${secret.knownIssues.length ? `<details><summary>Known issues</summary>${secret.knownIssues.map((issue) => `<p>${escapeHtml(issue)}</p>`).join('')}</details>` : ''}</div>`
            : shown.hintRevealed ? '<button type="button" data-secret-reveal="solutionRevealed">2 · Reveal solution</button>' : '<button type="button" disabled>2 · Reveal hint first</button>';
        const contentsUnlocked = research ? shown.hintRevealed : shown.solutionRevealed;
        const contents = !secret.contentsSummary ? '' : shown.contentsRevealed ? `<div class="secret-reveal-panel"><strong>3 · Contents</strong><p>${escapeHtml(secret.contentsSummary)}</p></div>` : contentsUnlocked ? '<button type="button" data-secret-reveal="contentsRevealed">3 · Reveal contents</button>' : `<button type="button" disabled>3 · Reveal ${research ? 'hint' : 'solution'} first</button>`;
        return `<div class="popup-content secret-popup"><h3>SECRET</h3><p><strong>${escapeHtml(secret.name)}</strong></p><p>${escapeHtml(secret.locationName)}</p>
            <p><strong>Type:</strong> ${escapeHtml(TYPE_LABELS[secret.secretType] || label(secret.secretType))}</p><p><strong>Position:</strong> ${escapeHtml(precision)}</p>
            <p><span class="secret-confidence confidence-${escapeHtml(secret.confidence)}">${escapeHtml(label(secret.confidence))}</span>${research ? ' <span class="secret-research-badge">Research lead</span>' : ''}</p>
            ${research ? '<p>Hidden content confirmed – exact access not yet documented.</p>' : ''}
            <label class="secret-status-label">Status <select data-secret-status><option value="unknown"${state === 'unknown' ? ' selected' : ''}>Unknown</option><option value="found"${state === 'found' ? ' selected' : ''}>Found</option><option value="solved"${state === 'solved' ? ' selected' : ''}>Solved</option></select></label>
            <div class="secret-reveal-actions">${hint}${solution}${contents}</div></div>`;
    }

    function wirePopup(secret, marker) {
        const root = marker.getPopup()?.getElement();
        if (!root) return;
        L.DomEvent.disableClickPropagation(root);
        root.onchange = (event) => {
            if (!event.target.matches('[data-secret-status]')) return;
            L.DomEvent.stop(event);
            status[secret.id] = event.target.value; saveStatus(); marker.setIcon(icon(secret)); refresh(); refreshPopupAfterAction(secret, marker);
        };
        root.onclick = (event) => {
            const button = event.target.closest('[data-secret-reveal]');
            if (!button || !root.contains(button)) return;
            L.DomEvent.stop(event);
            reveal[secret.id] = { ...revealState(secret), [button.dataset.secretReveal]: true }; saveReveal(); refreshPopupAfterAction(secret, marker);
        };
    }

    function refreshPopupAfterAction(secret, marker) {
        setTimeout(() => {
            if (!marker.isPopupOpen()) marker.openPopup();
            renderOpenPopup(secret, marker);
        }, 0);
    }

    function renderOpenPopup(secret, marker) {
        const popupContent = marker.getPopup()?.getElement()?.querySelector('.leaflet-popup-content');
        if (!popupContent) return;
        popupContent.innerHTML = popupHtml(secret);
        wirePopup(secret, marker);
        marker.getPopup().update();
    }

    secrets.forEach((secret) => {
        const marker = L.marker(positions.get(secret.id), { icon: icon(secret), title: `${secret.name} · Secret` });
        marker.bindPopup(() => popupHtml(secret), { maxWidth: 440, maxHeight: 540 }); marker.on('popupopen', () => wirePopup(secret, marker)); markers.set(secret.id, marker);
    });

    function passes(secret, query) {
        if (!isRelatedLocationVisible(secret)) return false;
        if (query) return searchText(secret).includes(query);
        if (secret.status === 'details_incomplete' && !filters.showResearch) return false;
        if (filters.unsolvedOnly && userState(secret) === 'solved') return false;
        return true;
    }

    function revealSecret(secret) {
        filters.showSecrets = true; if (secret.status === 'details_incomplete') filters.showResearch = true; expanded = true; saveFilters(); refresh();
        const marker = markers.get(secret.id); if (!map.hasLayer(marker)) marker.addTo(map); map.setView(marker.getLatLng(), Math.max(map.getZoom(), 5)); marker.openPopup();
    }

    function renderControls() {
        const accessible = secrets.filter((secret) => secret.status === 'accessible');
        controls.innerHTML = `<div class="secret-control-title"><strong>Secrets</strong><span>Found ${accessible.filter((secret) => userState(secret) !== 'unknown').length}/${accessible.length} · Solved ${accessible.filter((secret) => userState(secret) === 'solved').length}/${accessible.length} · Research leads 4</span></div>
            <div class="secret-filters"><label><input type="checkbox" data-secret-filter="showSecrets" ${filters.showSecrets ? 'checked' : ''}>Show secrets</label><label><input type="checkbox" data-secret-filter="unsolvedOnly" ${filters.unsolvedOnly ? 'checked' : ''}>Only unsolved</label><label><input type="checkbox" data-secret-filter="showResearch" ${filters.showResearch ? 'checked' : ''}>Show research leads</label></div>`;
        controls.querySelectorAll('[data-secret-filter]').forEach((input) => input.addEventListener('change', () => { filters[input.dataset.secretFilter] = input.checked; saveFilters(); refresh(); }));
    }

    function renderList(visible) {
        const query = searchInput.value.trim(); if (query && visible.length) expanded = true; list.innerHTML = ''; if (!visible.length) return;
        const section = document.createElement('section'); section.className = 'secret-section';
        const header = document.createElement('button'); header.type = 'button'; header.className = 'sample-section-header secret-section-header'; header.setAttribute('aria-expanded', String(expanded)); header.innerHTML = `<span>Secrets (${visible.length}/${secrets.length})</span><span class="sample-section-toggle">${expanded ? '▼' : '▶'}</span>`;
        const content = document.createElement('div'); content.className = 'secret-section-content'; content.hidden = !expanded;
        visible.forEach((secret) => { const item = document.createElement('button'); item.type = 'button'; item.className = `secret-list-item is-${userState(secret)}${secret.status === 'details_incomplete' ? ' is-research' : ''}`; item.innerHTML = `<span class="secret-list-icon"><span class="keyhole-glyph"></span></span><span>${escapeHtml(secret.name)}<small>${escapeHtml(secret.locationName)} · ${escapeHtml(TYPE_LABELS[secret.secretType] || label(secret.secretType))}${secret.status === 'details_incomplete' ? ' · Research lead' : ''}</small></span>`; item.addEventListener('click', () => revealSecret(secret)); content.appendChild(item); });
        header.addEventListener('click', () => { expanded = !expanded; renderList(visible); }); section.append(header, content); list.appendChild(section);
    }

    function refresh() {
        const query = searchInput.value.trim().toLocaleLowerCase(); const visible = secrets.filter((secret) => passes(secret, query)); const ids = new Set(visible.map((secret) => secret.id));
        secrets.forEach((secret) => { const marker = markers.get(secret.id); const show = filters.showSecrets && ids.has(secret.id); if (show && !map.hasLayer(marker)) marker.addTo(map); if (!show && map.hasLayer(marker)) map.removeLayer(marker); });
        renderControls(); renderList(visible);
    }
    searchInput.addEventListener('input', refresh); clearSearch.addEventListener('click', () => setTimeout(refresh)); refresh();
    window.addEventListener(LOCATION_VISIBILITY_EVENT, refresh);
    return { refresh, secrets, markers };
}
