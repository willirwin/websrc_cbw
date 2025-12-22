// websrc_cbw/setup.js

import * as api from "./api.js";                                                        // import API module
import { $, $all, setText, setDisabled, formatErr, escapeHtml } from "./util.js";       // import DOM helpers

// -----------------------------
// DOM (matches your pasted setup.html)
// -----------------------------

const titleEl = $("#setupTitle");                                                       // <h3 id="setupTitle">
const logoutBtn = $("#logoutBtn");                                                      // logout button
const saveBtn = $("#saveBtn");                                                          // save button
const reloadBtn = $("#reloadBtn");                                                      // reload config button

const statusPanelEl = $("#setupStatusPanel");                                           // optional status panel
const statusTextEl = $("#setupStatusText");                                             // status text container

const cfgTitleEl = $("#cfgTitle");                                                      // general: page title input

const relayListEl = $("#relayList");                                                    // relays list container
const addRelayBtn = $("#addRelayBtn");                                                  // add relay button
const resetRelaysBtn = $("#resetRelaysBtn");                                            // reset relays button (optional in HTML)

const diListEl = $("#diList");                                                          // DI list container
const addDiBtn = $("#addDiBtn");                                                        // add DI button
const resetDiBtn = $("#resetDiBtn");                                                    // reset DI button (optional in HTML)

const valueListEl = $("#valueList");                                                    // values list container
const addValueBtn = $("#addValueBtn");                                                  // add value button (optional in HTML)
const resetValuesBtn = $("#resetValuesBtn");                                            // reset values button (optional in HTML)

const cfgJsonEl = $("#cfgJson");                                                        // export/import textarea
const reloadJsonBtn = $("#reloadJsonBtn");                                              // reload JSON button (optional in HTML)
const applyJsonBtn = $("#applyJsonBtn");                                                // apply JSON button (optional in HTML)

const authUserEl = $("#authUser");                                                      // security: username input
const authPassEl = $("#authPass");                                                      // security: password input

// Sidebar buttons use .setup-navbtn[data-view]
const navBtns = $all(".setup-navbtn[data-view]");                                       // sidebar navigation buttons
const views = $all(".setup-view[data-view]");                                           // all view panels

// -----------------------------
// State
// -----------------------------

let config = null;                                                                      // editable config object from server
let currentUsername = "";                                                               // current username from server (for default fill)

// -----------------------------
// Small helpers
// -----------------------------

function showStatus(msg, { show = true } = {}) {                                        // show status panel text
    if (!statusPanelEl || !statusTextEl) return;                                        // ignore if status panel not present
    if (!show) {                                                                        // if asked to hide
        statusPanelEl.style.display = "none";                                           // hide panel
        setText(statusTextEl, "");                                                      // clear text
        return;                                                                         // stop
    }                                                                                   // end hide
    statusPanelEl.style.display = "";                                                   // show panel
    setText(statusTextEl, msg);                                                         // set message text
}                                                                                       // end showStatus

function makeId(prefix) {                                                               // create a short unique-ish id
    const t = Date.now().toString(36);                                                  // time component
    const r = Math.floor(Math.random() * 1e6).toString(36);                             // random component
    return `${prefix}${t}${r}`.slice(0, 24);                                            // return id (max 24 chars)
}                                                                                       // end makeId

function setActiveView(name) {                                                          // show only one view panel
    views.forEach((el) => {                                                             // loop through all view panels
        el.style.display = el.dataset.view === name ? "" : "none";                      // show matching view; hide others
    });                                                                                 // end loop

    navBtns.forEach((b) => {                                                            // loop nav buttons
        const on = b.dataset.view === name;                                             // whether this is active
        b.classList.toggle("active", on);                                               // toggle active class (if your CSS uses it)
    });                                                                                 // end loop
}                                                                                       // end setActiveView

function normalizeBoolFromSelect(v) {                                                   // parse "true"/"false" from <select>
    return String(v) === "true";                                                        // return boolean
}                                                                                       // end normalizeBoolFromSelect

// -----------------------------
// Renderers (match your pasted HTML containers)
// -----------------------------

function renderRelayList() {                                                            // render relays list UI
    const rows = (config.relays || []).map((r, idx) => {                                // build one row per relay
        return `
            <div class="list-row" data-kind="relay" data-idx="${idx}">
                <input value="${escapeHtml(r.name)}" data-field="name" />
                <select data-field="enabled">
                    <option value="true" ${r.enabled ? "selected" : ""}>Enabled</option>
                    <option value="false" ${!r.enabled ? "selected" : ""}>Hidden</option>
                </select>
                <button class="btn" data-action="remove">Remove</button>
            </div>
        `;
    }).join("");                                                                        // join all rows
    relayListEl.innerHTML = rows || `<div class="hint">No relays configured.</div>`;    // render rows or empty message
}                                                                                       // end renderRelayList

function renderDiList() {                                                               // render digital inputs list UI
    const rows = (config.dis || []).map((d, idx) => {                                   // build one row per DI
        return `
            <div class="list-row" data-kind="di" data-idx="${idx}">
                <input value="${escapeHtml(d.name)}" data-field="name" />
                <select data-field="enabled">
                    <option value="true" ${d.enabled ? "selected" : ""}>Enabled</option>
                    <option value="false" ${!d.enabled ? "selected" : ""}>Hidden</option>
                </select>
                <button class="btn" data-action="remove">Remove</button>
            </div>
        `;
    }).join("");                                                                        // join all rows
    diListEl.innerHTML = rows || `<div class="hint">No digital inputs configured.</div>`; // render rows or empty message
}                                                                                       // end renderDiList

function renderValueList() {                                                            // render values list UI
    const rows = (config.values || []).map((v, idx) => {                                // build one row per value
        return `
            <div class="list-row" data-kind="val" data-idx="${idx}">
                <input value="${escapeHtml(v.name)}" data-field="name" />
                <select data-field="enabled">
                    <option value="true" ${v.enabled ? "selected" : ""}>Enabled</option>
                    <option value="false" ${!v.enabled ? "selected" : ""}>Hidden</option>
                </select>
                <button class="btn" data-action="noop" disabled>Fixed</button>
            </div>
        `;
    }).join("");                                                                        // join all rows
    valueListEl.innerHTML = rows || `<div class="hint">No values configured.</div>`;    // render rows or empty message
}                                                                                       // end renderValueList

function renderExportJson() {                                                           // render config JSON into textarea
    if (!cfgJsonEl) return;                                                             // guard if export view removed
    cfgJsonEl.value = JSON.stringify(config, null, 4);                                  // pretty print config
}                                                                                       // end renderExportJson

function renderAll() {                                                                  // render all UI from config
    if (!config) return;                                                                // guard

    // Header/title
    if (titleEl) setText(titleEl, `Setup - ${config.pageTitle || "Device"}`);           // update page header text
    document.title = `Setup - ${config.pageTitle || "Device"}`;                         // update browser tab title

    // General view
    if (cfgTitleEl) cfgTitleEl.value = config.pageTitle || "";                          // fill title input

    // Security view defaults
    if (authUserEl) authUserEl.value = currentUsername || "";                           // fill username field
    if (authPassEl) authPassEl.value = "";                                              // never autofill password

    // Lists
    if (relayListEl) renderRelayList();                                                 // render relays list
    if (diListEl) renderDiList();                                                       // render DIs list
    if (valueListEl) renderValueList();                                                 // render values list

    // Export
    renderExportJson();                                                                 // update JSON box
}                                                                                       // end renderAll

// -----------------------------
// Read UI into config
// -----------------------------

function readGeneralIntoConfig() {                                                      // read general fields
    if (!cfgTitleEl) return;                                                            // guard
    config.pageTitle = String(cfgTitleEl.value ?? "").slice(0, 40);                     // clamp title to 40 chars
}                                                                                       // end readGeneralIntoConfig

// -----------------------------
// List edit handlers (reused from your old setup.js, but adapted)
// -----------------------------

function attachListHandlers() {                                                         // attach document-level handlers
    document.addEventListener("input", (ev) => {                                        // handle typing in inputs
        const row = ev.target.closest(".list-row");                                     // find list row
        if (!row) return;                                                               // ignore
        const kind = row.dataset.kind;                                                  // relay/di/val
        const idx = Number(row.dataset.idx);                                            // row index
        const field = ev.target.dataset.field;                                          // name field
        if (!Number.isFinite(idx) || field !== "name") return;                          // validate

        if (kind === "relay" && config.relays[idx]) config.relays[idx].name = String(ev.target.value); // update relay name
        if (kind === "di" && config.dis[idx]) config.dis[idx].name = String(ev.target.value);          // update DI name
        if (kind === "val" && config.values[idx]) config.values[idx].name = String(ev.target.value);   // update value name

        renderExportJson();                                                             // keep export JSON in sync
    });                                                                                 // end input handler

    document.addEventListener("change", (ev) => {                                       // handle enabled dropdown changes
        const row = ev.target.closest(".list-row");                                     // find list row
        if (!row) return;                                                               // ignore
        const kind = row.dataset.kind;                                                  // kind
        const idx = Number(row.dataset.idx);                                            // index
        const field = ev.target.dataset.field;                                          // enabled
        if (!Number.isFinite(idx) || field !== "enabled") return;                       // validate

        const enabled = normalizeBoolFromSelect(ev.target.value);                       // parse enabled
        if (kind === "relay" && config.relays[idx]) config.relays[idx].enabled = enabled; // update relay enabled
        if (kind === "di" && config.dis[idx]) config.dis[idx].enabled = enabled;         // update DI enabled
        if (kind === "val" && config.values[idx]) config.values[idx].enabled = enabled;  // update value enabled

        renderExportJson();                                                             // keep export JSON in sync
    });                                                                                 // end change handler

    document.addEventListener("click", (ev) => {                                        // handle remove button clicks
        const btn = ev.target.closest("button[data-action]");                           // find action button
        if (!btn) return;                                                               // ignore
        const row = btn.closest(".list-row");                                           // find row
        if (!row) return;                                                               // ignore
        if (btn.dataset.action !== "remove") return;                                    // only remove is handled here

        const kind = row.dataset.kind;                                                  // kind
        const idx = Number(row.dataset.idx);                                            // index
        if (!Number.isFinite(idx)) return;                                              // validate

        if (kind === "relay") config.relays.splice(idx, 1);                             // remove relay entry
        if (kind === "di") config.dis.splice(idx, 1);                                  // remove DI entry

        renderAll();                                                                    // re-render lists + JSON
    });                                                                                 // end click handler
}                                                                                       // end attachListHandlers

// -----------------------------
// Actions
// -----------------------------

async function reloadFromServer() {                                                     // reload config from server
    try {                                                                               // begin try
        setDisabled(reloadBtn, true);                                                   // disable reload
        showStatus("Loading from device...");                                           // show status
        const res = await api.getConfig();                                              // fetch protected config
        config = res.config;                                                            // set config
        currentUsername = res.username || "";                                           // set username
        renderAll();                                                                    // render UI
        showStatus("Loaded.");                                                          // show status
    } catch (e) {                                                                       // on error
        showStatus(`Load failed: ${formatErr(e)}`);                                     // show error
    } finally {                                                                         // always
        setDisabled(reloadBtn, false);                                                  // re-enable reload
    }                                                                                   // end try/finally
}                                                                                       // end reloadFromServer

async function saveToServer() {                                                         // save config + optionally credentials
    try {                                                                               // begin try
        setDisabled(saveBtn, true);                                                     // disable save button
        showStatus("Saving...");                                                        // show status

        // Read general fields
        readGeneralIntoConfig();                                                        // update config.pageTitle from UI

        // Save config
        const res = await api.saveConfig(config);                                       // POST config
        config = res.config;                                                            // update local config from server response

        // Optional credential change (only if user typed something)
        const newUser = String(authUserEl?.value ?? "").trim();                         // read username field
        const newPass = String(authPassEl?.value ?? "");                                // read password field
        if (newUser && (newUser !== currentUsername || newPass)) {                      // if username changed or password provided
            // For change endpoint we need old password; in your server implementation, change requires oldPassword.
            // Since this UI is "set new creds", we interpret authPass as "new password" ONLY,
            // and we require the user to also type current password somewhere. Your pasted UI doesn't include that.
            // So: do NOT call authChange here; instead just warn.
            showStatus("Saved UI. Note: credential change requires the old password (use the login/password view in the old UI).");
        } else {                                                                        // no cred changes
            showStatus("Saved. Main page will reflect changes immediately.");           // show success
        }                                                                               // end optional cred path

        renderAll();                                                                    // re-render
    } catch (e) {                                                                       // on error
        showStatus(`Save failed: ${formatErr(e)}`);                                     // show error
    } finally {                                                                         // always
        setDisabled(saveBtn, false);                                                    // re-enable save
    }                                                                                   // end try/finally
}                                                                                       // end saveToServer

async function doLogout() {                                                             // logout and return to login page
    try {                                                                               // begin try
        await api.authLogout();                                                         // call logout endpoint
    } finally {                                                                         // always redirect
        window.location.href = "/login.html";                                           // go to login
    }                                                                                   // end finally
}                                                                                       // end doLogout

function addRelay() {                                                                   // add a relay entry
    config.relays.push({ id: makeId("r"), name: `Relay ${config.relays.length + 1}`, enabled: true }); // push relay
    renderAll();                                                                        // refresh UI
}                                                                                       // end addRelay

function resetRelaysTo4() {                                                             // reset relays to 4 defaults
    config.relays = [                                                                   // replace with 4 defaults
        { id: "r1", name: "Relay 1", enabled: true },                                   // relay 1
        { id: "r2", name: "Relay 2", enabled: true },                                   // relay 2
        { id: "r3", name: "Relay 3", enabled: true },                                   // relay 3
        { id: "r4", name: "Relay 4", enabled: true },                                   // relay 4
    ];                                                                                  // end array
    renderAll();                                                                        // refresh UI
}                                                                                       // end resetRelaysTo4

function addDi() {                                                                      // add a digital input entry
    config.dis.push({ id: makeId("d"), name: `Digital Input ${config.dis.length + 1}`, enabled: true }); // push DI
    renderAll();                                                                        // refresh UI
}                                                                                       // end addDi

function resetDiTo4() {                                                                 // reset DIs to 4 defaults
    config.dis = [                                                                      // replace with 4 defaults
        { id: "d1", name: "Digital Input 1", enabled: true },                           // DI 1
        { id: "d2", name: "Digital Input 2", enabled: true },                           // DI 2
        { id: "d3", name: "Digital Input 3", enabled: true },                           // DI 3
        { id: "d4", name: "Digital Input 4", enabled: true },                           // DI 4
    ];                                                                                  // end array
    renderAll();                                                                        // refresh UI
}                                                                                       // end resetDiTo4

function addValue() {                                                                   // add a value entry (advanced use)
    config.values.push({ id: makeId("v"), name: `Value ${config.values.length + 1}`, enabled: true }); // add value
    renderAll();                                                                        // refresh
}                                                                                       // end addValue

function resetValuesDefaults() {                                                        // reset values to defaults
    config.values = [                                                                   // default values
        { id: "vin", name: "VIN", enabled: true },                                      // VIN
        { id: "reg1", name: "Register 1", enabled: true },                              // Register 1
        { id: "ow1", name: "OneWire 1", enabled: true },                                // OneWire 1
    ];                                                                                  // end array
    renderAll();                                                                        // refresh
}                                                                                       // end resetValuesDefaults

function reloadJsonBox() {                                                              // reload JSON textarea from current config
    renderExportJson();                                                                 // set textarea value
    showStatus("JSON reloaded.");                                                       // status message
}                                                                                       // end reloadJsonBox

function applyJsonBox() {                                                               // apply JSON textarea into config
    if (!cfgJsonEl) return;                                                             // guard
    try {                                                                               // begin try
        const parsed = JSON.parse(cfgJsonEl.value);                                     // parse JSON from textarea
        config = parsed;                                                                // replace config
        renderAll();                                                                    // re-render UI
        showStatus("Applied JSON to editor (not saved yet).");                          // info
    } catch (e) {                                                                       // on parse error
        showStatus(`Invalid JSON: ${formatErr(e)}`);                                    // show error
    }                                                                                   // end try/catch
}                                                                                       // end applyJsonBox

// -----------------------------
// Boot
// -----------------------------

function wireNav() {                                                                    // wire sidebar navigation
    navBtns.forEach((btn) => {                                                          // loop buttons
        btn.addEventListener("click", () => {                                           // click handler
            setActiveView(btn.dataset.view);                                            // switch view
        });                                                                             // end click
    });                                                                                 // end loop
}                                                                                       // end wireNav

function wireButtons() {                                                                // wire action buttons
    logoutBtn?.addEventListener("click", doLogout);                                     // logout
    saveBtn?.addEventListener("click", saveToServer);                                   // save
    reloadBtn?.addEventListener("click", reloadFromServer);                             // reload

    addRelayBtn?.addEventListener("click", addRelay);                                   // add relay
    resetRelaysBtn?.addEventListener("click", resetRelaysTo4);                          // reset relays

    addDiBtn?.addEventListener("click", addDi);                                         // add DI
    resetDiBtn?.addEventListener("click", resetDiTo4);                                  // reset DIs

    addValueBtn?.addEventListener("click", addValue);                                   // add value (optional)
    resetValuesBtn?.addEventListener("click", resetValuesDefaults);                     // reset values

    reloadJsonBtn?.addEventListener("click", reloadJsonBox);                            // reload JSON textarea
    applyJsonBtn?.addEventListener("click", applyJsonBox);                              // apply JSON textarea
}                                                                                       // end wireButtons

async function boot() {                                                                 // main init
    wireNav();                                                                          // wire sidebar
    wireButtons();                                                                      // wire buttons
    attachListHandlers();                                                               // wire list handlers

    await reloadFromServer();                                                           // load config and render
    setActiveView("general");                                                           // default view
    showStatus("", { show: false });                                                    // hide status panel by default
}                                                                                       // end boot

boot().catch((e) => {                                                                   // boot error handler
    showStatus(`Setup init failed: ${formatErr(e)}`);                                   // show error
    console.error(e);                                                                   // log details
});                                                                                     // end boot().catch
