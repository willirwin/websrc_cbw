// websrc_cbw/setup.js
// -----------------------------------------------------------------------------
// Setup screen logic: auth gating + tabbed config editors
// -----------------------------------------------------------------------------
import { getCredentials, isLoggedIn, setCredentials, setLoggedIn } from "./auth.js";
import { getDefaultUiConfig, getUiConfig, setUiConfig } from "./config.js";

// Force a login before allowing access to the setup screen.
const loginUrl = "login.html?next=setup.html";

if (!isLoggedIn()) {
    window.location.replace(loginUrl);
}

// Cache key DOM elements for the General tab.
const currentUserEl = document.getElementById("currentUser");
const logoutBtn = document.getElementById("logoutBtn");
const form = document.getElementById("setupForm");
const msgEl = document.getElementById("setupMsg");
const currentPasswordEl = document.getElementById("currentPassword");
const newUsernameEl = document.getElementById("newUsername");
const newPasswordEl = document.getElementById("newPassword");
const confirmPasswordEl = document.getElementById("confirmPassword");
// Sidebar tabs are purely client-side toggles (no page navigation).
// Cache elements for sidebar tab switching.
const navItems = Array.from(document.querySelectorAll(".nav-item[data-tab]"));
const sections = Array.from(document.querySelectorAll(".setup-section"));
// Cache elements used by the I/O Setup tab.
const relayListEl = document.getElementById("relayConfigList");
const dinListEl = document.getElementById("dinConfigList");
const sensorListEl = document.getElementById("sensorConfigList");
const saveIoBtn = document.getElementById("saveIoBtn");
const resetGeneralBtn = document.getElementById("resetGeneralBtn");
const resetIoBtn = document.getElementById("resetIoBtn");
const ioMsgEl = document.getElementById("ioMsg");
// Cache elements for Monitor & Control appearance settings.
const monitorForm = document.getElementById("monitorForm");
const resetMonitorBtn = document.getElementById("resetMonitorBtn");
const monitorMsgEl = document.getElementById("monitorMsg");
const titleInput = document.getElementById("titleInput");
const showConnectionEl = document.getElementById("showConnection");
const showClockEl = document.getElementById("showClock");
const showUptimeEl = document.getElementById("showUptime");

function setMessage(text, type) {
    msgEl.textContent = text;
    msgEl.className = type ? `form-msg ${type}` : "form-msg";
}

function setIoMessage(text, type) {
    ioMsgEl.textContent = text;
    ioMsgEl.className = type ? `form-msg ${type}` : "form-msg";
}

function setMonitorMessage(text, type) {
    monitorMsgEl.textContent = text;
    monitorMsgEl.className = type ? `form-msg ${type}` : "form-msg";
}

function confirmAction(message) {
    return window.confirm(message);
}

function setActiveTab(tabName) {
    navItems.forEach((item) => {
        item.classList.toggle("active", item.dataset.tab === tabName);
    });
    sections.forEach((section) => {
        section.classList.toggle("active", section.id === `tab-${tabName}`);
    });
}

navItems.forEach((item) => {
    item.addEventListener("click", () => {
        setActiveTab(item.dataset.tab);
    });
});

function refreshUsername() {
    const creds = getCredentials();
    currentUserEl.textContent = creds.username;
    newUsernameEl.value = creds.username;
}

function clearList(listEl) {
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
}

// Builds a reusable row for relay/DI/sensor naming and enablement.
function createConfigRow(labelText, nameValue, enabledValue, data) {
    const row = document.createElement("div");
    row.className = "config-row";
    if (data?.id) row.dataset.id = String(data.id);
    if (data?.key) row.dataset.key = String(data.key);
    row.dataset.kind = data?.kind || "";

    const label = document.createElement("span");
    label.className = "config-label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.className = "input config-input";
    input.value = nameValue;
    input.dataset.field = "name";

    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "checkbox-inline";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "checkbox";
    checkbox.checked = !!enabledValue;
    checkbox.dataset.field = "enabled";

    const checkboxText = document.createElement("span");
    checkboxText.textContent = "Enabled";

    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(checkboxText);

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(checkboxLabel);
    return row;
}

function renderIoConfig(cfg) {
    clearList(relayListEl);
    clearList(dinListEl);
    clearList(sensorListEl);

    const sensorLabels = {
        vin: "VIN",
        register1: "Register 1",
        oneWire1: "OneWire 1",
    };

    cfg.relays.forEach((relay) => {
        const row = createConfigRow(
            `Relay ${relay.id}`,
            relay.name,
            relay.enabled,
            { kind: "relay", id: relay.id },
        );
        relayListEl.appendChild(row);
    });

    cfg.digitalInputs.forEach((din) => {
        const row = createConfigRow(
            `Digital Input ${din.id}`,
            din.name,
            din.enabled,
            { kind: "din", id: din.id },
        );
        dinListEl.appendChild(row);
    });

    cfg.sensors.forEach((sensor) => {
        const row = createConfigRow(
            sensorLabels[sensor.key] || sensor.name,
            sensor.name,
            sensor.enabled,
            { kind: "sensor", key: sensor.key },
        );
        sensorListEl.appendChild(row);
    });
}

function loadMonitorConfig(cfg) {
    titleInput.value = cfg.title;
    showConnectionEl.checked = cfg.appearance.showConnection;
    showClockEl.checked = cfg.appearance.showClock;
    showUptimeEl.checked = cfg.appearance.showUptime;
}

// Extracts current UI values into a normalized config shape.
function readConfigRows(listEl, kind) {
    const rows = Array.from(listEl.querySelectorAll(".config-row"));
    return rows.map((row, index) => {
        const nameInput = row.querySelector('input[data-field="name"]');
        const enabledInput = row.querySelector('input[data-field="enabled"]');
        const name = nameInput ? nameInput.value.trim() : "";

        if (kind === "relay" || kind === "din") {
            const id = Number(row.dataset.id || index + 1);
            return {
                id,
                name: name || `${kind === "relay" ? "Relay" : "Digital Input"} ${id}`,
                enabled: enabledInput ? enabledInput.checked : true,
            };
        }

        return {
            key: row.dataset.key || "",
            name: name || row.dataset.key || "",
            enabled: enabledInput ? enabledInput.checked : true,
        };
    });
}

function loadUiConfig() {
    const cfg = getUiConfig();
    renderIoConfig(cfg);
    loadMonitorConfig(cfg);
}

refreshUsername();
loadUiConfig();

logoutBtn.addEventListener("click", () => {
    setLoggedIn(false);
    window.location.href = "login.html";
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    setMessage("", "");

    if (!confirmAction("Save credential changes?")) return;

    const creds = getCredentials();
    const currentPassword = currentPasswordEl.value;
    const newUsername = newUsernameEl.value.trim();
    const newPassword = newPasswordEl.value;
    const confirmPassword = confirmPasswordEl.value;

    if (currentPassword !== creds.password) {
        setMessage("Current password is incorrect.", "error");
        currentPasswordEl.focus();
        return;
    }

    if (!newUsername) {
        setMessage("New username is required.", "error");
        newUsernameEl.focus();
        return;
    }

    if (!newPassword || newPassword.length < 4) {
        setMessage("New password must be at least 4 characters.", "error");
        newPasswordEl.focus();
        return;
    }

    if (newPassword !== confirmPassword) {
        setMessage("New passwords do not match.", "error");
        confirmPasswordEl.focus();
        return;
    }

    setCredentials({ username: newUsername, password: newPassword });
    setMessage("Credentials updated.", "success");
    currentPasswordEl.value = "";
    newPasswordEl.value = "";
    confirmPasswordEl.value = "";
    refreshUsername();
});

saveIoBtn.addEventListener("click", () => {
    if (!confirmAction("Save I/O settings changes?")) return;
    const cfg = getUiConfig();
    cfg.relays = readConfigRows(relayListEl, "relay");
    cfg.digitalInputs = readConfigRows(dinListEl, "din");
    cfg.sensors = readConfigRows(sensorListEl, "sensor");
    setUiConfig(cfg);
    setIoMessage("I/O settings saved.", "success");
});

resetGeneralBtn.addEventListener("click", () => {
    if (!confirmAction("Reset credentials to default values?")) return;
    setCredentials({ username: "admin", password: "admin" });
    currentPasswordEl.value = "";
    newPasswordEl.value = "";
    confirmPasswordEl.value = "";
    refreshUsername();
    setMessage("Credentials reset to defaults.", "success");
});

resetIoBtn.addEventListener("click", () => {
    if (!confirmAction("Reset I/O settings to defaults?")) return;
    const defaults = getDefaultUiConfig();
    const cfg = getUiConfig();
    cfg.relays = defaults.relays;
    cfg.digitalInputs = defaults.digitalInputs;
    cfg.sensors = defaults.sensors;
    setUiConfig(cfg);
    renderIoConfig(cfg);
    setIoMessage("I/O settings reset to defaults.", "success");
});

monitorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!confirmAction("Save monitor settings changes?")) return;
    const cfg = getUiConfig();
    cfg.title = titleInput.value.trim() || cfg.title;
    cfg.appearance = {
        showConnection: showConnectionEl.checked,
        showClock: showClockEl.checked,
        showUptime: showUptimeEl.checked,
    };
    setUiConfig(cfg);
    setMonitorMessage("Monitor settings saved.", "success");
});

resetMonitorBtn.addEventListener("click", () => {
    if (!confirmAction("Reset monitor settings to defaults?")) return;
    const defaults = getDefaultUiConfig();
    const cfg = getUiConfig();
    cfg.title = defaults.title;
    cfg.appearance = defaults.appearance;
    setUiConfig(cfg);
    loadMonitorConfig(cfg);
    setMonitorMessage("Monitor settings reset to defaults.", "success");
});
