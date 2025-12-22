// websrc_cbw_beta/server.js (run from C:\Users\user\Documents\websrc_cbw_beta> node server.js)

// simple Express server to simulate backend API for testing and development
// NOTE: no authentication; keep this on trusted networks only

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// -----------------------------------------------------------------------------
// Express app setup
// -----------------------------------------------------------------------------

const app = express();
// creates the Express application instance

app.use(express.json());
// enables JSON request body parsing for POST endpoints

// serve frontend files (index.html, main.js, ui.js, api.js, state.js, util.js)
const __filename = fileURLToPath(import.meta.url);
// converts this module URL into a filesystem path
const __dirname = path.dirname(__filename);
// computes the directory containing this server.js file
app.use(express.static(__dirname));
// serves files in this folder (static frontend)

// -----------------------------------------------------------------------------
// Simulated device state (this is your "virtual MCU" / "virtual CBW device")
// -----------------------------------------------------------------------------

// simulated device state
const dev = {
    boot_ms: Date.now(),
    // timestamp used to compute uptime

    // relays 1..4
    relays: [false, false, false, false],
    // boolean array representing relay outputs

    // digital inputs 1..4
    din: [false, false, false, false],
    // boolean array representing digital input states seen by the device

    // values (for simulate)
    vin_v: 24.4,
    // simulated VIN value (volts)

    register1: 0,
    // simulated register value

    onewire1_f: 72.05,
    // simulated OneWire temperature (F)
};

// -----------------------------------------------------------------------------
// Small utilities (shared helpers for validation / bounds)
// -----------------------------------------------------------------------------

function clampInt(x, lo, hi) {
    // clamps a value to an integer range [lo..hi]
    const n = Number(x);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

// -----------------------------------------------------------------------------
// DI Simulation Modes (choose one mode by enabling it)
//
// There are currently TWO modes:
//   1) diCounter: DI1-4 represent bits 0-3 of a 4-bit counter
//   2) dinSim: random DI toggling for "noisy environment" simulation
//
// The default right now is:
//   - diCounter.enabled = false
//   - dinSim.enabled = false
//
// IMPORTANT: Do not enable both at once.
// -----------------------------------------------------------------------------

// DI counter simulator
const diCounter = {
    value: 0,           // 4-bit counter: 0..15
    periodMs: 1000,     // update rate
    enabled: true,     // set to true to enable counter mode
};

function updateDinFromCounter() {
    // updates dev.din[] from the current counter bits
    if (!diCounter.enabled) return;

    diCounter.value = (diCounter.value + 1) & 0x0F;
    // increments and wraps 0..15 (4-bit counter)

    // Map bits to digital inputs
    dev.din[0] = !!(diCounter.value & 0x01); // bit 0 -> DI1
    dev.din[1] = !!(diCounter.value & 0x02); // bit 1 -> DI2
    dev.din[2] = !!(diCounter.value & 0x04); // bit 2 -> DI3
    dev.din[3] = !!(diCounter.value & 0x08); // bit 3 -> DI4
}

setInterval(updateDinFromCounter, diCounter.periodMs);
// runs the DI counter updater on a fixed schedule (independent of UI polling)


// Default behavior: flip a random DI every 2 seconds.
const dinSim = {
    enabled: false,     // set to true to enable random DI toggling
    periodMs: 2000,
};

function tickDinSim() {
    // flips a random DI bit to simulate "unpredictable external signals"
    if (!dinSim.enabled) return;

    const i = clampInt(Math.floor(Math.random() * 4), 0, 3);
    // selects a valid DI index 0..3

    dev.din[i] = !dev.din[i];
    // toggles that DI
}

setInterval(tickDinSim, dinSim.periodMs);
// runs the random DI simulator on a fixed schedule

// POST /api/sim/di   body: { enabled: true/false, periodMs: 2000 }
app.post("/api/sim/di", (req, res) => {
    // lets you enable/disable the random DI simulator while the server runs
    // NOTE: updating periodMs here does NOT change the existing setInterval rate.
    // If you need dynamic interval changes, we can refactor this to restart the timer.
    if (typeof req.body?.enabled === "boolean") {
        dinSim.enabled = req.body.enabled;
    }
    if (req.body?.periodMs !== undefined) {
        dinSim.periodMs = clampInt(req.body.periodMs, 100, 60000);
    }
    res.json({ ok: true, dinSim });
});

// --- Value simulator (virtual MCU outputs) ----------------------------------
// Updates VIN, Register1, and OneWire1 while the server runs.

const valueSim = {
    enabled: true,
    periodMs: 250,
    t: 0,
};

function clampNum(x, lo, hi) {
    const n = Number(x);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function tickValueSim() {
    if (!valueSim.enabled) return;

    valueSim.t += valueSim.periodMs;

    // VIN: slow drift between 23.8 V and 25.2 V (triangle wave)
    {
        const period = 20000; // ms
        const phase = (valueSim.t % period) / period; // 0..1
        const tri = phase < 0.5 ? (phase * 2) : (2 - phase * 2); // 0..1..0
        dev.vin_v = 23.8 + (25.2 - 23.8) * tri;
    }

    // Register1: track the DI counter (0..15) so it is deterministic and debuggable
    // If you don’t have diCounter in your server, replace this with any integer you want.
    if (typeof diCounter?.value === "number") {
        dev.register1 = diCounter.value;       // customizable mapping here
    }

    // OneWire1 (F): slow sine wave 70..76 F
    {
        const period = 30000; // ms
        const w = (2 * Math.PI) / period;
        const temp = 73 + 3 * Math.sin(w * valueSim.t);
        dev.onewire1_f = clampNum(temp, -40, 212);
    }
}

setInterval(tickValueSim, valueSim.periodMs);

// -----------------------------------------------------------------------------
// ControlByWeb-style endpoint: /customState.json
// -----------------------------------------------------------------------------

// ControlByWeb-style: GET /customState.json?showUnits=1&showColors=1
app.get("/customState.json", (req, res) => {
    // showUnits/showColors mimic CBW query behavior
    const showUnits = req.query.showUnits === "1";
    const showColors = req.query.showColors === "1";

    const withColor = (s, color = "Grey") => (showColors ? `${s} #${color}` : s);
    // attaches a "#Color" suffix only if showColors=1

    // Build a payload that matches the CBW demo shape (strings, not numbers/bools)
    const payload = {
        digitalInput1: "0",
        digitalInput2: "0",
        digitalInput3: "0",
        digitalInput4: "0",

        relay1: "0",
        relay2: "0",
        relay3: "0",
        relay4: "0",

        // NOTE: "vinasdkfj" is a placeholder key used by CBW demo firmware.
        // Your frontend currently reads s.vinasdkfj, so we keep it unchanged for compatibility.
        vinasdkfj: withColor(`24.4${showUnits ? " V" : ""}`),

        register1: withColor(String(dev.counter)),
        oneWire1: withColor(`72.05${showUnits ? " F" : ""}`),

        utcTime: String(Math.floor(Date.now() / 1000)),
        timezoneOffset: "-18000",
        serialNumber: "00:00:00:00:00:00",

        bootTime: new Date(dev.boot_ms).toISOString(),
        uptimeMs: String(Date.now() - dev.boot_ms),

        // tells the UI the recommended minimum refresh interval (seconds)
        minRecRefresh: "1",
    };

    // Digital Inputs (device -> UI)
    payload.digitalInput1 = dev.din[0] ? "1" : "0";
    payload.digitalInput2 = dev.din[1] ? "1" : "0";
    payload.digitalInput3 = dev.din[2] ? "1" : "0";
    payload.digitalInput4 = dev.din[3] ? "1" : "0";

    // Relays (device -> UI)
    payload.relay1 = dev.relays[0] ? "1" : "0";
    payload.relay2 = dev.relays[1] ? "1" : "0";
    payload.relay3 = dev.relays[2] ? "1" : "0";
    payload.relay4 = dev.relays[3] ? "1" : "0";

    // Values (device -> UI)
    payload.vinasdkfj = withColor(`${dev.vin_v.toFixed(1)}${showUnits ? " V" : ""}`);
    payload.register1 = withColor(String(dev.register1));
    payload.oneWire1 = withColor(`${dev.onewire1_f.toFixed(2)}${showUnits ? " F" : ""}`);

    // prevent caching so the browser always re-fetches fresh data
    res.set("Cache-Control", "no-store");
    res.json(payload);
});


// -----------------------------------------------------------------------------
// Relay control endpoints (UI -> device control)
// -----------------------------------------------------------------------------

function relayIndex(n) {
    // converts relay number 1..4 into array index 0..3
    const i = Number(n) - 1;
    return (i >= 0 && i < 4) ? i : -1;
}

// POST /api/relay/:n/on
app.post("/api/relay/:n/on", (req, res) => {
    const i = relayIndex(req.params.n);
    if (i < 0) return res.status(400).json({ ok: false, error: "bad relay number" });

    dev.relays[i] = true;
    res.json({ ok: true, relay: i + 1, on: true });
});

// POST /api/relay/:n/off
app.post("/api/relay/:n/off", (req, res) => {
    const i = relayIndex(req.params.n);
    if (i < 0) return res.status(400).json({ ok: false, error: "bad relay number" });

    dev.relays[i] = false;
    res.json({ ok: true, relay: i + 1, on: false });
});

// POST /api/relay/:n/pulse  body optional: { ms: 250 }
app.post("/api/relay/:n/pulse", (req, res) => {
    const i = relayIndex(req.params.n);
    if (i < 0) return res.status(400).json({ ok: false, error: "bad relay number" });

    const ms = Math.max(10, Math.min(10000, Number(req.body?.ms ?? 500)));
    // clamps pulse width to a reasonable range

    dev.relays[i] = true;
    // immediately set relay ON

    setTimeout(() => {
        dev.relays[i] = false;
        // after ms, set relay OFF
    }, ms);

    res.json({ ok: true, relay: i + 1, pulsed_ms: ms });
});

app.post("/api/sim/values", (req, res) => {
    if (typeof req.body?.enabled === "boolean") {
        valueSim.enabled = req.body.enabled;
    }
    res.json({ ok: true, valueSim: { enabled: valueSim.enabled, periodMs: valueSim.periodMs } });
});

// -----------------------------------------------------------------------------
// Server start
// -----------------------------------------------------------------------------

app.listen(8000, () => {
    console.log("Dev server running at http://localhost:8000");
});
