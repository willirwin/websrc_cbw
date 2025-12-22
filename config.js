const CONFIG_KEY = "cbw_ui_config";

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

export function getUiConfig() {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
        try {
            return normalizeConfig(JSON.parse(raw));
        } catch {
            return normalizeConfig(null);
        }
    }
    const defaults = normalizeConfig(null);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(defaults));
    return defaults;
}

export function setUiConfig(next) {
    const normalized = normalizeConfig(next);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
    return normalized;
}

export function applyUiConfig() {
    const cfg = getUiConfig();
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
