// websrc_cbw/ui.js
// websrc_cbw_beta/ui.js

// user interface logic for wiring events and refreshing status

import { state } from "./state.js";
// pulls shared "state" object from state.js
import * as api from "./api.js";
// pulls all exports from api.js as object "api"
import { $, $all, setText, setDisabled, formatErr } from "./util.js";
// pulls helper functions from util.js

// -----------------------------------------------------------------------------
// Polling control (device tells us its recommended minimum refresh interval)
// -----------------------------------------------------------------------------

function clampPollMs(ms) {
    // clamps a poll interval to a sane range to avoid browser abuse
    const n = Number(ms);
    if (!Number.isFinite(n)) return state.pollMs;
    return Math.max(250, Math.min(10000, Math.trunc(n)));
}

function maybeUpdatePollFromCustomState(s) {
    // reads s.minRecRefresh (seconds) and updates our polling timer if needed
    const desiredMs = clampPollMs(Number(s?.minRecRefresh) * 1000);
    if (!desiredMs || desiredMs === state.pollMs) return;

    state.pollMs = desiredMs;

    if (state.timerId) {
        clearInterval(state.timerId);
    }
    state.timerId = setInterval(refreshStatus, state.pollMs);
}

function parseValueColor(s) {
    // parses strings like "72.05 F #Grey" into { value: "72.05 F", color: "Grey" }
    if (typeof s !== "string") return { value: String(s ?? ""), color: "" };

    const parts = s.split(" #");
    return { value: parts[0], color: parts[1] ?? "" };
}

function formatDateTime(iso) {
    // formats an ISO timestamp into a human-readable local date/time
    if (!iso) return "";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);

    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
}

function formatUptime(ms) {
    // formats milliseconds into HH:MM:SS.mmm
    const totalMs = Number(ms);
    if (!Number.isFinite(totalMs) || totalMs < 0) return "";

    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const millis = Math.floor(totalMs % 1000);

    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    const mmm = String(millis).padStart(3, "0");

    return `${hh}:${mm}:${ss}`;
}

function formatNow() {
    // formats the current local time
    return new Date().toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function startClock() {
    // updates the on-screen clock independently of device polling
    if (!state.els.clock) return;

    setText(state.els.clock, formatNow());

    setInterval(() => {
        setText(state.els.clock, formatNow());
    }, 1000);
}

// -----------------------------------------------------------------------------
// DOM caching (only cache IDs that actually exist in index.html)
// -----------------------------------------------------------------------------

function cacheDom() {
    // internal helper function
    state.els = state.els || {};
    // ensure state.els exists

    // footer
    state.els.conn = state.els.conn || $("#conn");
    // finds element with ID "conn" and caches it
    // optional device time fields (add to index.html if desired)
    state.els.clock = state.els.clock || $("#clock");
    // finds element with ID "bootTime" and caches it (may be null if not present)
    state.els.uptimeMs = state.els.uptimeMs || $("#uptimeMs");
    // finds element with ID "uptimeMs" and caches it (may be null if not present)

    // relay bars
    state.els.relayBars = state.els.relayBars || [
        $("#relay1Bar"), $("#relay2Bar"), $("#relay3Bar"), $("#relay4Bar"),
    ];

    // digital input pills
    state.els.diBars = state.els.diBars || [
        $("#di1Bar"), $("#di2Bar"), $("#di3Bar"), $("#di4Bar"),
    ];

    // values
    state.els.vin = state.els.vin || $("#vin");
    state.els.reg1 = state.els.reg1 || $("#reg1");
    state.els.ow1 = state.els.ow1 || $("#ow1");
}

// -----------------------------------------------------------------------------
// Event wiring (relay control + manual refresh)
// -----------------------------------------------------------------------------

async function handleRelayAction(btn) {
    // handles a single relay action (on/off/pulse) with per-relay button disable
    const n = Number(btn.dataset.relay);
    const action = btn.dataset.action;

    const relayN = btn.dataset.relay;
    const onlyThisRelayBtns = $all(`button[data-relay="${relayN}"][data-action]`);

    try {
        onlyThisRelayBtns.forEach(b => setDisabled(b, true));

        if (action === "on") await api.relayOn(n);
        else if (action === "off") await api.relayOff(n);
        else if (action === "pulse") await api.relayPulse(n, 500);

        await refreshStatus();
    } finally {
        onlyThisRelayBtns.forEach(b => setDisabled(b, false));
    }
}

export function wireEvents() {
    // exports function "wireEvents" to be called by main.js
    cacheDom();
    startClock();

    // Relay buttons: event delegation (works for all relays without per-button wiring)
    document.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("button[data-relay][data-action]");
        if (!btn) return;

        try {
            await handleRelayAction(btn);
        } catch (e) {
            // keep failures visible in console; UI remains stable
            console.error(formatErr(e));
        }
    });

    refreshStatus();
    // initial status refresh
}

// -----------------------------------------------------------------------------
// Rendering (customState.json -> DOM)
// -----------------------------------------------------------------------------

// Maps CBW-style strings into the live DOM (no state mutation beyond visuals).
function renderCustomState(s) {
    // Connection indicator
    setText(state.els.conn, "OK");

    // Optional device time fields (only update if elements exist)
    setText(state.els.bootTime, formatDateTime(s.bootTime));
    setText(state.els.uptimeMs, formatUptime(s.uptimeMs));

    // Relays
    const relays = [s.relay1, s.relay2, s.relay3, s.relay4].map(x => x === "1");
    relays.forEach((on, i) => {
        const bar = state.els.relayBars[i];
        if (!bar) return;

        bar.classList.toggle("on", on);
        bar.classList.toggle("off", !on);
        setText(bar, on ? "On" : "Off");
    });

    // Digital Inputs
    const dis = [s.digitalInput1, s.digitalInput2, s.digitalInput3, s.digitalInput4]
        .map(x => x === "1");

    dis.forEach((on, i) => {
        const bar = state.els.diBars[i];
        if (!bar) return;

        bar.classList.toggle("on", on);
        bar.classList.toggle("off", !on);
        setText(bar, on ? "On" : "Off");
    });


    // Values
    // NOTE: "vinasdkfj" is kept for compatibility with your current backend key
    setText(state.els.vin, parseValueColor(s.vinasdkfj).value);
    setText(state.els.reg1, parseValueColor(s.register1).value);
    setText(state.els.ow1, parseValueColor(s.oneWire1).value);
}

function renderDisconnected(e) {
    // internal helper function to update UI on disconnection
    setText(state.els.conn, "Disconnected");

    // clear optional fields if present
    setText(state.els.bootTime, "");
    setText(state.els.uptimeMs, "--:--:--");

    // leave the last-known relay/DI/value state visible (embedded-style behavior)
    console.error(`Disconnected: ${formatErr(e)}`);
}

// -----------------------------------------------------------------------------
// Polling entrypoint
// -----------------------------------------------------------------------------

export async function refreshStatus() {
    // exports function "refreshStatus" to be called by main.js
    cacheDom(); // ensure DOM elements are cached
    try {
        const s = await api.getCustomState();
        // fetch status JSON from API

        state.lastStatus = s;
        state.connected = true;
        // persist connection status

        maybeUpdatePollFromCustomState(s);
        // update polling rate if device recommends a different minimum

        renderCustomState(s);
        // update UI with new status
    } catch (e) {
        state.connected = false;
        renderDisconnected(e);
        // if failed, render disconnected state
    }
}
