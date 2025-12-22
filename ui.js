// websrc_cbw/ui.js

import { state } from "./state.js";                                                     // import shared state
import * as api from "./api.js";                                                        // import all API calls as api.*
import { $, $all, setText, setDisabled, formatErr, escapeHtml } from "./util.js";       // import DOM helpers

// -----------------------------
// Polling control
// -----------------------------

function clampPollMs(ms) {                                                              // clamp polling interval to safe range
    const n = Number(ms);                                                               // coerce to number
    if (!Number.isFinite(n)) return state.pollMs;                                       // ignore invalid values
    return Math.max(250, Math.min(10000, Math.trunc(n)));                               // clamp to [250..10000] ms
}                                                                                       // end clampPollMs

function maybeUpdatePollFromCustomState(s) {                                            // update polling based on device recommendation
    const desiredMs = clampPollMs(Number(s?.minRecRefresh) * 1000);                     // convert seconds -> ms and clamp
    if (!desiredMs || desiredMs === state.pollMs) return;                               // do nothing if unchanged

    state.pollMs = desiredMs;                                                           // store new poll period

    if (state.timerId) clearInterval(state.timerId);                                    // stop old interval if running
    state.timerId = setInterval(refreshStatus, state.pollMs);                           // start new interval with updated period
}                                                                                       // end maybeUpdatePollFromCustomState

// -----------------------------
// Formatting helpers
// -----------------------------

function parseValueColor(s) {                                                           // parse "value #Color" strings
    if (typeof s !== "string") return { value: String(s ?? ""), color: "" };            // default parsing for non-strings
    const parts = s.split(" #");                                                        // split into [value, color]
    return { value: parts[0], color: parts[1] ?? "" };                                  // return parsed fields
}                                                                                       // end parseValueColor

function formatUptime(ms) {                                                             // format ms into HH:MM:SS
    const totalMs = Number(ms);                                                         // coerce to number
    if (!Number.isFinite(totalMs) || totalMs < 0) return "--:--:--";                    // guard invalid values

    const hours = Math.floor(totalMs / 3600000);                                        // compute hours
    const minutes = Math.floor((totalMs % 3600000) / 60000);                            // compute minutes
    const seconds = Math.floor((totalMs % 60000) / 1000);                               // compute seconds

    const hh = String(hours).padStart(2, "0");                                          // zero-pad hours
    const mm = String(minutes).padStart(2, "0");                                        // zero-pad minutes
    const ss = String(seconds).padStart(2, "0");                                        // zero-pad seconds

    return `${hh}:${mm}:${ss}`;                                                         // return formatted uptime
}                                                                                       // end formatUptime

function formatNow() {                                                                  // format current local time
    return new Date().toLocaleString(undefined, {                                       // build locale string
        year: "numeric",                                                                // year
        month: "2-digit",                                                               // month
        day: "2-digit",                                                                 // day
        hour: "2-digit",                                                                // hour
        minute: "2-digit",                                                              // minute
        second: "2-digit",                                                              // second
    });                                                                                 // end options
}                                                                                       // end formatNow

function setReconnectEnabled(enabled) {                                                 // enable/disable reconnect button
    if (!state.els.refresh) return;                                                     // ignore if missing
    setDisabled(state.els.refresh, !enabled);                                           // invert because we disable when not enabled
}                                                                                       // end setReconnectEnabled

function startClock() {                                                                 // start a UI clock independent of polling
    if (!state.els.clock) return;                                                       // ignore if clock missing
    setText(state.els.clock, formatNow());                                              // set initial time
    setInterval(() => setText(state.els.clock, formatNow()), 1000);                     // update every second
}                                                                                       // end startClock

// -----------------------------
// Dynamic UI builder (index.html)
// -----------------------------

export function buildIndexUiFromConfig(cfg) {                                           // build index page panels based on config
    const containerTitle = $("#pageTitle");                                             // find title element
    if (containerTitle) setText(containerTitle, cfg.pageTitle || "Device");             // set visible page title

    const grid = $("#grid");                                                            // find main grid container
    if (!grid) return;                                                                  // if missing, cannot build UI

    grid.innerHTML = "";                                                                // clear any existing grid contents

    // --- Relays panels ---
    const relays = Array.isArray(cfg.relays) ? cfg.relays : [];                         // safe relay list
    relays.forEach((r, i) => {                                                          // build each relay panel
        if (!r.enabled) return;                                                         // skip disabled relays

        const n = i + 1;                                                                // 1-based relay number used by backend
        const panelHtml = `                                                           
            <div class="panel" id="relay${n}">
                <div class="panel-h" id="relay${n}Name">${escapeHtml(r.name || `Relay ${n}`)}</div>
                <div class="bar off" id="relay${n}Bar">Off</div>
                <div class="btnrow">
                    <button class="btn" data-relay="${n}" data-action="on">On</button>
                    <button class="btn" data-relay="${n}" data-action="off">Off</button>
                    <button class="btn" data-relay="${n}" data-action="pulse">Pulse</button>
                </div>
            </div>
        `;                                                                              // template for relay panel
        grid.insertAdjacentHTML("beforeend", panelHtml);                                // append relay panel to grid
    });                                                                                 // end relays.forEach

    // --- Digital Inputs panel ---
    const dis = Array.isArray(cfg.dis) ? cfg.dis : [];                                  // safe DI list
    const diRows = dis.map((d, i) => {                                                  // build DI rows
        if (!d.enabled) return "";                                                      // skip disabled
        const n = i + 1;                                                                // 1-based DI number used by backend
        return `
            <div class="kv">
                <span id="di${n}Name">${escapeHtml(d.name || `Digital Input ${n}`)}</span>
                <div class="bar off di-bar" id="di${n}Bar">Off</div>
            </div>
        `;                                                                              // return row HTML
    }).join("");                                                                        // join into one string

    if (diRows.trim()) {                                                                // if any DI rows exist
        const diPanel = `
            <div class="panel" id="diPanel">
                ${diRows}
            </div>
        `;                                                                              // DI panel wrapper
        grid.insertAdjacentHTML("beforeend", diPanel);                                  // append DI panel
    }                                                                                   // end DI panel build

    // --- Values panel ---
    const values = Array.isArray(cfg.values) ? cfg.values : [];                         // safe values list
    const valueRows = values.map((v) => {                                               // build values rows
        if (!v.enabled) return "";                                                      // skip disabled
        if (v.id === "vin") {
            return `<div class="kv"><span id="vinName">${escapeHtml(v.name || "VIN")}</span><span class="pill" id="vin">?</span></div>`;
        }
        if (v.id === "reg1") {
            return `<div class="kv"><span id="reg1Name">${escapeHtml(v.name || "Register 1")}</span><span class="pill" id="reg1">?</span></div>`;
        }
        if (v.id === "ow1") {
            return `<div class="kv"><span id="ow1Name">${escapeHtml(v.name || "OneWire 1")}</span><span class="pill" id="ow1">?</span></div>`;
        }
        return "";                                                                      // ignore unknown ids for now
    }).join("");                                                                        // join rows

    if (valueRows.trim()) {                                                             // if any value rows exist
        const valPanel = `
            <div class="panel" id="valuesPanel">
                <div class="panel-h">Values</div>
                ${valueRows}
            </div>
        `;                                                                              // values panel wrapper
        grid.insertAdjacentHTML("beforeend", valPanel);                                 // append values panel
    }                                                                                   // end values panel build
}                                                                                       // end buildIndexUiFromConfig

// -----------------------------
// DOM caching
// -----------------------------

function cacheDom() {                                                                   // cache commonly used DOM elements
    state.els = state.els || {};                                                        // ensure state.els exists

    state.els.conn = $("#conn");                                                        // cache connection status span
    state.els.refresh = $("#refreshBtn");                                               // cache reconnect button
    state.els.clock = $("#clock");                                                      // cache clock field
    state.els.uptimeMs = $("#uptimeMs");                                                // cache uptime field

    // Dynamic relay bars: find all matching ids like relayNBar
    state.els.relayBars = [];                                                           // reset relayBars array: dynamic per config
    $all('[id^="relay"][id$="Bar"]').forEach((el) => {                                  // select elements with id starting relay and ending Bar
        state.els.relayBars.push(el);                                                   // push into relayBars list
    });                                                                                 // end forEach

    // Dynamic DI bars: find ids like diNBar
    state.els.diBars = [];                                                              // reset diBars array: dynamic per config
    $all('[id^="di"][id$="Bar"]').forEach((el) => {                                     // select elements with id starting di and ending Bar
        state.els.diBars.push(el);                                                      // push into diBars list
    });                                                                                 // end forEach

    state.els.vin = $("#vin");                                                          // cache VIN pill (optional)
    state.els.reg1 = $("#reg1");                                                        // cache reg1 pill (optional)
    state.els.ow1 = $("#ow1");                                                          // cache onewire pill (optional)
}                                                                                       // end cacheDom

// -----------------------------
// Event wiring
// -----------------------------

async function handleRelayAction(btn) {                                                 // handle a relay button click
    const n = Number(btn.dataset.relay);                                                // parse relay number
    const action = btn.dataset.action;                                                  // read action string

    const relayN = btn.dataset.relay;                                                   // store relay number string for selector
    const onlyThisRelayBtns = $all(`button[data-relay="${relayN}"][data-action]`);      // select buttons for only that relay

    try {                                                                               // begin protected section
        onlyThisRelayBtns.forEach((b) => setDisabled(b, true));                         // disable only that relay’s buttons

        if (action === "on") await api.relayOn(n);                                      // call relayOn
        else if (action === "off") await api.relayOff(n);                               // call relayOff
        else if (action === "pulse") await api.relayPulse(n, 500);                      // call relayPulse

        await refreshStatus();                                                          // refresh UI state after command
    } finally {                                                                         // always re-enable buttons
        onlyThisRelayBtns.forEach((b) => setDisabled(b, false));                        // re-enable only that relay’s buttons
    }                                                                                   // end try/finally
}                                                                                       // end handleRelayAction

export function wireEvents() {                                                          // wire all UI events
    cacheDom();                                                                         // cache DOM elements
    startClock();                                                                       // start local clock display

    document.addEventListener("click", async (ev) => {                                  // click handler for relay buttons via delegation
        const btn = ev.target.closest("button[data-relay][data-action]");               // locate relay action button
        if (!btn) return;                                                               // ignore other clicks

        try {                                                                           // handle action
            await handleRelayAction(btn);                                               // execute relay action
        } catch (e) {                                                                   // log errors
            console.error(formatErr(e));                                                // print useful error message
        }                                                                               // end catch
    });                                                                                 // end event listener

    if (state.els.refresh) {                                                            // if reconnect button exists
        state.els.refresh.addEventListener("click", async () => {                       // handle reconnect click
            if (state.connected) return;                                                // do nothing if already connected
            try {                                                                       // begin protected section
                setReconnectEnabled(false);                                             // disable button to prevent spamming
                await refreshStatus();                                                  // attempt one reconnect poll
            } finally {                                                                 // do nothing else here
                // refreshStatus updates enabled/disabled based on success/failure      // explanatory comment
            }                                                                           // end finally
        });                                                                             // end click handler
    }                                                                                   // end refresh existence

    refreshStatus();                                                                    // do an initial poll (non-blocking)
}                                                                                       // end wireEvents

// -----------------------------
// Rendering
// -----------------------------

function renderCustomState(s) {                                                         // render a successful poll payload
    setText(state.els.conn, "OK");                                                      // set connection indicator
    setReconnectEnabled(false);                                                         // disable reconnect button when connected

    setText(state.els.uptimeMs, formatUptime(s.uptimeMs));                              // render formatted uptime if element exists

    // Relays: update relayNBar elements in DOM order; we built them in config order
    const relayStates = [];                                                             // array of boolean relay states
    const relayCount = state.els.relayBars.length;                                      // how many relay bars are present
    for (let i = 0; i < relayCount; i += 1) {                                           // iterate bars present
        relayStates.push(s[`relay${i + 1}`] === "1");                                   // read payload relayN
    }                                                                                   // end loop

    relayStates.forEach((on, i) => {                                                    // apply state to bars
        const bar = state.els.relayBars[i];                                             // get bar element
        if (!bar) return;                                                               // guard

        bar.classList.toggle("on", on);                                                 // toggle ON class
        bar.classList.toggle("off", !on);                                               // toggle OFF class
        setText(bar, on ? "On" : "Off");                                                // set label text
    });                                                                                 // end forEach

    // DIs: update diNBar elements in DOM order; we built them in config order
    const diStates = [];                                                                // array of boolean DI states
    const diCount = state.els.diBars.length;                                            // number of DI bars present
    for (let i = 0; i < diCount; i += 1) {                                              // iterate bars present
        diStates.push(s[`digitalInput${i + 1}`] === "1");                               // read payload digitalInputN
    }                                                                                   // end loop

    diStates.forEach((on, i) => {                                                       // apply state to DI bars
        const bar = state.els.diBars[i];                                                // get bar element
        if (!bar) return;                                                               // guard

        bar.classList.toggle("on", on);                                                 // toggle ON class
        bar.classList.toggle("off", !on);                                               // toggle OFF class
        setText(bar, on ? "On" : "Off");                                                // set label
    });                                                                                 // end forEach

    // Values: render only if elements exist
    if (state.els.vin) setText(state.els.vin, parseValueColor(s.vin).value);      // render VIN value
    if (state.els.reg1) setText(state.els.reg1, parseValueColor(s.register1).value);    // render Register 1
    if (state.els.ow1) setText(state.els.ow1, parseValueColor(s.oneWire1).value);       // render OneWire 1
}                                                                                       // end renderCustomState

function renderDisconnected(e) {                                                        // render disconnected state
    setText(state.els.conn, "Disconnected");                                            // set connection status
    setReconnectEnabled(true);                                                          // enable reconnect button

    setText(state.els.uptimeMs, "--:--:--");                                            // clear uptime display

    console.error(`Disconnected: ${formatErr(e)}`);                                     // log error detail for debugging
}                                                                                       // end renderDisconnected

// -----------------------------
// Polling entrypoint
// -----------------------------

export async function refreshStatus() {                                                 // fetch + render device state
    cacheDom();                                                                         // refresh DOM cache (safe if UI rebuilt)
    try {                                                                               // begin try block
        const s = await api.getCustomState();                                           // fetch /customState.json

        state.lastStatus = s;                                                           // store last payload
        state.connected = true;                                                         // mark connected

        maybeUpdatePollFromCustomState(s);                                              // update polling interval if recommended
        renderCustomState(s);                                                           // render payload into DOM
    } catch (e) {                                                                       // on failure
        state.connected = false;                                                        // mark disconnected
        renderDisconnected(e);                                                          // render disconnected UI
    }                                                                                   // end try/catch
}                                                                                       // end refreshStatus
