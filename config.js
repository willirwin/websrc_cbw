// websrc_cbw/config.js
// -----------------------------------------------------------------------------
// UI configuration storage + application
// -----------------------------------------------------------------------------
// Server-backed config with a local in-memory cache for fast reads.

let cachedConfig = null;
// in-memory cache avoids extra round trips for repeated reads

// Base defaults used for first run and for reset operations.
function defaultConfig() {
    return {
        title: "CASTLEROAD",
        relays: [
            { id: 1, name: "Relay 1", enabled: true },
            { id: 2, name: "Relay 2", enabled: true },
            { id: 3, name: "Relay 3", enabled: true },
            { id: 4, name: "Relay 4", enabled: true },
        ],
        digitalInputs: [
            { id: 1, name: "Digital Input 1", enabled: true },
            { id: 2, name: "Digital Input 2", enabled: true },
            { id: 3, name: "Digital Input 3", enabled: true },
            { id: 4, name: "Digital Input 4", enabled: true },
        ],
        sensors: [
            { key: "vin", name: "VIN", enabled: true },
            { key: "register1", name: "Register 1", enabled: true },
            { key: "oneWire1", name: "OneWire 1", enabled: true },
        ],
        appearance: {
            showClock: true,
            showUptime: true,
            showConnection: true,
        },
    };
}

// Coerces user-provided config into a safe, predictable shape for the UI.
function normalizeConfig(raw) {
    const base = defaultConfig();
    const cfg = { ...base, ...(raw || {}) };

    cfg.title = String(cfg.title ?? base.title);

    cfg.relays = Array.isArray(cfg.relays) ? cfg.relays : base.relays;
    cfg.relays = cfg.relays.map((r, i) => ({
        id: i + 1,
        name: String(r?.name ?? `Relay ${i + 1}`),
        enabled: r?.enabled !== false,
    }));

    cfg.digitalInputs = Array.isArray(cfg.digitalInputs) ? cfg.digitalInputs : base.digitalInputs;
    cfg.digitalInputs = cfg.digitalInputs.map((d, i) => ({
        id: i + 1,
        name: String(d?.name ?? `Digital Input ${i + 1}`),
        enabled: d?.enabled !== false,
    }));

    cfg.sensors = Array.isArray(cfg.sensors) ? cfg.sensors : base.sensors;
    cfg.sensors = cfg.sensors.map((s, i) => {
        const fallback = base.sensors[i] || { key: "", name: "" };
        return {
            key: String(s?.key ?? fallback.key),
            name: String(s?.name ?? fallback.name),
            enabled: s?.enabled !== false,
        };
    });

    cfg.appearance = { ...base.appearance, ...(cfg.appearance || {}) };
    cfg.appearance.showClock = cfg.appearance.showClock !== false;
    cfg.appearance.showUptime = cfg.appearance.showUptime !== false;
    cfg.appearance.showConnection = cfg.appearance.showConnection !== false;

    return cfg;
}

// Shared fetch helper for the config API endpoints.
async function request(path, { method = "GET", body } = {}) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
        opts.headers["content-type"] = "application/json";
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
}

// Retrieves the cached config (after loadUiConfig has run).
export function getUiConfig() {
    return cachedConfig || normalizeConfig(null);
}

// Returns a fresh default config object for resets.
export function getDefaultUiConfig() {
    return normalizeConfig(null);
}

// Loads config from the server and updates the local cache.
export async function loadUiConfig() {
    try {
        const remote = await request("/api/ui-config", { method: "GET" });
        cachedConfig = normalizeConfig(remote);
        return cachedConfig;
    } catch {
        cachedConfig = cachedConfig || normalizeConfig(null);
        return cachedConfig;
    }
}

// Writes config to the server and updates the local cache.
export async function saveUiConfig(next) {
    const normalized = normalizeConfig(next);
    cachedConfig = normalized;
    await request("/api/ui-config", { method: "POST", body: normalized });
    return normalized;
}

// Applies stored UI config to index.html elements (labels, visibility, title).
export async function applyUiConfig() {
    const cfg = await loadUiConfig();
    const titleEl = document.getElementById("pageTitle");
    if (!titleEl) return;

    titleEl.textContent = cfg.title;
    document.title = cfg.title;

    cfg.relays.forEach((relay) => {
        const panel = document.getElementById(`relay${relay.id}`);
        const label = document.getElementById(`relay${relay.id}Label`);
        if (label) label.textContent = relay.name;
        if (panel) panel.style.display = relay.enabled ? "" : "none";
    });

    cfg.digitalInputs.forEach((din) => {
        const row = document.getElementById(`di${din.id}Row`);
        const label = document.getElementById(`di${din.id}Label`);
        if (label) label.textContent = din.name;
        if (row) row.style.display = din.enabled ? "" : "none";
    });

    // Map sensor keys to fixed DOM IDs in index.html.
    const sensorMap = {
        vin: { rowId: "vinRow", labelId: "vinLabel" },
        register1: { rowId: "reg1Row", labelId: "reg1Label" },
        oneWire1: { rowId: "ow1Row", labelId: "ow1Label" },
    };

    cfg.sensors.forEach((sensor) => {
        const map = sensorMap[sensor.key];
        if (!map) return;
        const row = document.getElementById(map.rowId);
        const label = document.getElementById(map.labelId);
        if (label) label.textContent = sensor.name;
        if (row) row.style.display = sensor.enabled ? "" : "none";
    });

    const connWrap = document.getElementById("connWrap");
    const clockWrap = document.getElementById("clockWrap");
    const uptimeWrap = document.getElementById("uptimeWrap");

    if (connWrap) connWrap.style.display = cfg.appearance.showConnection ? "" : "none";
    if (clockWrap) clockWrap.style.display = cfg.appearance.showClock ? "" : "none";
    if (uptimeWrap) uptimeWrap.style.display = cfg.appearance.showUptime ? "" : "none";
}
