// websrc_cbw/server.js

import express from "express";                                                          // import Express web framework
import path from "path";                                                                // import path utilities
import fs from "fs";                                                                    // import filesystem utilities
import crypto from "crypto";                                                            // import crypto for hashing + session tokens
import { fileURLToPath } from "url";                                                    // import helper to convert module URL to path

const app = express();                                                                  // create the Express application instance

app.use(express.json({ limit: "256kb" }));                                              // parse JSON bodies, with a sane size limit

const __filename = fileURLToPath(import.meta.url);                                      // convert this module URL into a filesystem path
const __dirname = path.dirname(__filename);                                             // compute the directory containing this server.js file

const STORE_PATH = path.join(__dirname, "config_store.json");                           // absolute path to persisted config/creds store
const SESSION_COOKIE = "sid";                                                           // cookie name used for sessions
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;                                              // session lifetime (8 hours) for dev/LAN use

// -------------------------------
// Simulated device state (virtual MCU)
// -------------------------------

const dev = {                                                                           // device state object
    boot_ms: Date.now(),                                                                // timestamp used to compute uptime
    relays: [],                                                                         // relay states (boolean array), length = config.relays.length
    din: [],                                                                            // digital input states (boolean array), length = config.dis.length
    vin_v: 24.4,                                                                        // simulated VIN value (volts)
    register1: 0,                                                                       // simulated register value
    onewire1_f: 72.05,                                                                  // simulated OneWire temperature (F)
};                                                                              

// -------------------------------
// Store defaults (UI config + creds)
// -------------------------------

function defaultStore() {                                                               // returns a fresh default store object
    return {                                                                            // begin default store
        version: 1,                                                                     // store schema version
        creds: {                                                                        // credentials section (hashed)
            username: "admin",                                                          // default username
            saltHex: "",                                                                // will be filled on first save
            hashHex: "",                                                                // will be filled on first save
            iter: 150000,                                                               // PBKDF2 iterations (reasonable for LAN-grade)
        },                                                                       
        config: {                                                                       // UI configuration section
            pageTitle: "CASTLEROAD",                                                     // main header title shown on the page
            relays: [                                                                   // default relay list
                { id: "r1", name: "Relay 1", enabled: true },                           // relay entry #1
                { id: "r2", name: "Relay 2", enabled: true },                           // relay entry #2
                { id: "r3", name: "Relay 3", enabled: true },                           // relay entry #3
                { id: "r4", name: "Relay 4", enabled: true },                           // relay entry #4
            ],                                                                    
            dis: [                                                                      // default digital input list
                { id: "d1", name: "Digital Input 1", enabled: true },                   // DI entry #1
                { id: "d2", name: "Digital Input 2", enabled: true },                   // DI entry #2
                { id: "d3", name: "Digital Input 3", enabled: true },                   // DI entry #3
                { id: "d4", name: "Digital Input 4", enabled: true },                   // DI entry #4
            ],                                                                     
            values: [                                                                   // default value rows (VIN/Register/OneWire)
                { id: "vin", name: "VIN", enabled: true },                              // value row VIN
                { id: "reg1", name: "Register 1", enabled: true },                      // value row Register 1
                { id: "ow1", name: "OneWire 1", enabled: true },                        // value row OneWire 1
            ],                                                                        
        },                                                                         
    };                                                                               
}                                                                                 

// -------------------------------
// PBKDF2 helpers (LAN-grade; no external deps)
// -------------------------------

function pbkdf2Hash(password, saltHex, iter) {                                           // derive a PBKDF2 hash from a password and salt
    const salt = Buffer.from(saltHex, "hex");                                            // decode salt hex to bytes
    const dk = crypto.pbkdf2Sync(password, salt, iter, 32, "sha256");                    // compute derived key (32 bytes) with SHA-256
    return dk.toString("hex");                                                          // return hex string
}                                                                                  

function makeSaltHex() {                                                                // generate a random 16-byte salt
    return crypto.randomBytes(16).toString("hex");                                       // return salt as hex string
}                                                                                    

function ensureCredsHashed(store) {                                                     // ensure store.creds has salt+hash populated
    if (!store?.creds) return;                                                          // bail if missing creds
    if (store.creds.saltHex && store.creds.hashHex) return;                             // already hashed => nothing to do
    const saltHex = makeSaltHex();                                                      // generate a new random salt
    const iter = Number(store.creds.iter) || 150000;                                    // choose iterations (fallback to default)
    const hashHex = pbkdf2Hash("admin", saltHex, iter);                                 // hash the default password "admin"
    store.creds.saltHex = saltHex;                                                      // write salt
    store.creds.hashHex = hashHex;                                                      // write hash
    store.creds.iter = iter;                                                            // write iterations
}                                                                                   

// -------------------------------
// Persistent store load/save
// -------------------------------

function loadStore() {                                                                  // load store from disk, or create default
    try {                                                                               // begin try block
        const raw = fs.readFileSync(STORE_PATH, "utf8");                                // read store file as text
        const parsed = JSON.parse(raw);                                                 // parse JSON
        ensureCredsHashed(parsed);                                                      // ensure creds are hashed (handles legacy)
        return parsed;                                                                  // return parsed store
    } catch {                                                                           // on any error (missing file / invalid JSON)
        const s = defaultStore();                                                       // create default store
        ensureCredsHashed(s);                                                           // hash default creds
        saveStore(s);                                                                   // persist immediately
        return s;                                                                       // return store
    }                                                                              
}                                                                                  

function saveStore(store) {                                                             // save store to disk atomically-ish
    const tmp = STORE_PATH + ".tmp";                                                    // temporary filename for safer writes
    fs.writeFileSync(tmp, JSON.stringify(store, null, 4), "utf8");                      // write pretty JSON to temp file
    fs.renameSync(tmp, STORE_PATH);                                                     // rename temp file into place
}                                                                                   

let store = loadStore();                                                                // load store at startup

// -------------------------------
// Session handling (in-memory map)
// -------------------------------

const sessions = new Map();                                                             // map sid -> { username, expiresAt }

function newSessionId() {                                                               // generate a new session token
    return crypto.randomBytes(24).toString("hex");                                       // 48 hex chars of randomness
}                                                                                  

function parseCookies(req) {                                                            // minimal cookie parser (no external deps)
    const hdr = req.headers.cookie || "";                                               // read Cookie header or default to empty
    const out = {};                                                                     // output cookie map
    hdr.split(";").forEach((part) => {                                                  // split cookie string into parts
        const s = part.trim();                                                          // trim whitespace
        if (!s) return;                                                                 // skip empty
        const eq = s.indexOf("=");                                                      // find '='
        if (eq < 0) return;                                                             // skip malformed
        const k = s.slice(0, eq).trim();                                                // cookie name
        const v = s.slice(eq + 1).trim();                                               // cookie value
        out[k] = decodeURIComponent(v);                                                 // store decoded cookie value
    });                                                                            
    return out;                                                                         // return cookie map
}                                                                                 

function setSessionCookie(res, sid) {                                                   // set an HttpOnly cookie for session id
    const parts = [];                                                                   // cookie attribute parts
    parts.push(`${SESSION_COOKIE}=${encodeURIComponent(sid)}`);                         // set cookie value
    parts.push("Path=/");                                                               // cookie applies to entire site
    parts.push("HttpOnly");                                                             // JS cannot read cookie (reduces XSS impact)
    parts.push("SameSite=Lax");                                                         // mitigate CSRF for most navigation
    res.setHeader("Set-Cookie", parts.join("; "));                                      // write Set-Cookie header
}                                                                                  

function clearSessionCookie(res) {                                                      // clear the session cookie
    res.setHeader(                                                                      // set cookie with expired max-age
        "Set-Cookie",
        `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );                                                                          
}                                                                                  

function getSession(req) {                                                              // retrieve a valid session (or null)
    const cookies = parseCookies(req);                                                  // parse cookies from request
    const sid = cookies[SESSION_COOKIE];                                                // read session id cookie
    if (!sid) return null;                                                              // no cookie => not logged in
    const s = sessions.get(sid);                                                        // lookup session record
    if (!s) return null;                                                                // unknown sid => not logged in
    if (Date.now() > s.expiresAt) {                                                     // if expired
        sessions.delete(sid);                                                   
        return null;                                                                    // treat as not logged in
    }                                                                              
    return { sid, ...s };                                                               // return session info (sid + record)
}                                                                                  

function requireAuth(req, res, next) {                                                  // Express middleware: require login
    const s = getSession(req);                                                          // get current session
    if (!s) {                                                                           // if missing/invalid
        return res.status(401).json({ ok: false, error: "auth_required" });             // respond 401 for API routes
    }                                                                               
    req.session = s;                                                                    // attach session to request
    next();                                                                             // continue to route handler
}                                                                                   

// -------------------------------
// Config validation + normalization
// -------------------------------

function clampStr(x, maxLen) {                                                          // clamp any value into a string with length limit
    const s = String(x ?? "");                                                          // coerce to string
    return s.length > maxLen ? s.slice(0, maxLen) : s;                                  // return trimmed if too long
}                                                                                

function normalizeList(list, prefix) {                                                  // normalize relay/di/value lists into safe objects
    const arr = Array.isArray(list) ? list : [];                                        // ensure array
    const out = [];                                                                     // output array
    for (let i = 0; i < arr.length; i += 1) {                                           // iterate entries
        const it = arr[i] || {};                                                        // read entry (fallback to empty object)
        const id = clampStr(it.id || `${prefix}${i + 1}`, 24);                           // enforce an id
        const name = clampStr(it.name || `${prefix.toUpperCase()} ${i + 1}`, 40);       // enforce a name
        const enabled = typeof it.enabled === "boolean" ? it.enabled : true;            // coerce enabled to boolean (default true)
        out.push({ id, name, enabled });                                                // append normalized entry
    }                                                                              
    return out;                                                                         // return normalized list
}                                                                                    

function normalizeConfig(cfg) {                                                         // normalize incoming config object
    const c = cfg || {};                                                                // ensure object
    const pageTitle = clampStr(c.pageTitle || "CASTLEROAD", 40);                         // title with max length
    const relays = normalizeList(c.relays, "r");                                        // normalize relay list
    const dis = normalizeList(c.dis, "d");                                              // normalize DI list
    const values = normalizeList(c.values, "v");                                        // normalize value list
    return { pageTitle, relays, dis, values };                                          // return normalized config
}                                                                                

function ensureDevArrayLengths() {                                                      // match dev.relays/dev.din to config lengths
    const rN = store.config.relays.length;                                              // number of configured relays
    const dN = store.config.dis.length;                                                 // number of configured digital inputs
    while (dev.relays.length < rN) dev.relays.push(false);                              // expand relays with OFF defaults
    while (dev.relays.length > rN) dev.relays.pop();                                    // shrink extra relays
    while (dev.din.length < dN) dev.din.push(false);                                    // expand DIs with OFF defaults
    while (dev.din.length > dN) dev.din.pop();                                          // shrink extra DIs
}                                                                                  

ensureDevArrayLengths();                                                                // initialize dev arrays at startup

// -------------------------------
// Static files (public)
// -------------------------------

app.get("/", (req, res) => {                                                            // route for root URL
    res.sendFile(path.join(__dirname, "index.html"));                                   // serve index.html
});                                                                                 

app.get("/login.html", (req, res) => {                                                  // explicitly serve login page
    res.sendFile(path.join(__dirname, "login.html"));                                   // serve login.html
});                                                                               

app.get("/setup.html", (req, res) => {                                                  // protected setup page
   res.sendFile(path.join(__dirname, "setup.html"));                                    // serve setup.html
});                                                                                

app.use(express.static(__dirname));                                                     // serve other static files (js/css/html) from this folder

// -------------------------------
// Auth API
// -------------------------------

app.post("/api/auth/login", (req, res) => {                                             // login endpoint
    const username = clampStr(req.body?.username, 64);                                  // read username
    const password = String(req.body?.password ?? "");                                  // read password as string
    if (!username || !password) {                                                       // validate presence
        return res.status(400).json({ ok: false, error: "missing_fields" });            // bad request
    }                                                                              

    const creds = store.creds;                                                          // reference creds
    if (username !== creds.username) {                                                  // user mismatch
        return res.status(401).json({ ok: false, error: "invalid_credentials" });       // unauthorized
    }                                                                              

    const hashHex = pbkdf2Hash(password, creds.saltHex, creds.iter);                    // hash provided password
    if (hashHex !== creds.hashHex) {                                                    // compare hashes
        return res.status(401).json({ ok: false, error: "invalid_credentials" });       // unauthorized
    }                                                                              

    const sid = newSessionId();                                                         // allocate new session id
    sessions.set(sid, {                                                                 // store session record
        username: creds.username,                                                       // store username
        expiresAt: Date.now() + SESSION_TTL_MS,                                         // store expiry time
    });                                                                            

    setSessionCookie(res, sid);                                                         // set HttpOnly cookie
    res.json({ ok: true });                                                             // respond success
});                                                                                

app.post("/api/auth/logout", (req, res) => {                                            // logout endpoint
    const s = getSession(req);                                                          // read session (if any)
    if (s?.sid) sessions.delete(s.sid);                                                 // end server-side session record
    clearSessionCookie(res);                                                            // clear cookie
    res.json({ ok: true });                                                             // respond success
});                                                                                 

app.post("/api/auth/change", requireAuth, (req, res) => {                               // change username/password endpoint
    const oldPassword = String(req.body?.oldPassword ?? "");                            // current password
    const newUsername = clampStr(req.body?.newUsername ?? store.creds.username, 64);    // new username (optional)
    const newPassword = String(req.body?.newPassword ?? "");                            // new password (optional)

    const creds = store.creds;                                                          // reference creds

    const oldHashHex = pbkdf2Hash(oldPassword, creds.saltHex, creds.iter);              // hash old password provided
    if (oldHashHex !== creds.hashHex) {                                                 // verify old password
        return res.status(401).json({ ok: false, error: "invalid_old_password" });      // unauthorized
    }                                                                         

    if (!newUsername) {                                                                 // username must not be empty
        return res.status(400).json({ ok: false, error: "bad_username" });              // bad request
    }                                                                                 

    if (newPassword && newPassword.length < 4) {                                        // minimal password policy for LAN-grade
        return res.status(400).json({ ok: false, error: "password_too_short" });        // reject short passwords
    }                                                                                 

    creds.username = newUsername;                                                       // update username

    if (newPassword) {                                                                  // if changing password
        const saltHex = makeSaltHex();                                                  // generate new salt
        const iter = creds.iter || 150000;                                              // keep iteration count
        const hashHex = pbkdf2Hash(newPassword, saltHex, iter);                         // hash new password
        creds.saltHex = saltHex;                                                        // store salt
        creds.hashHex = hashHex;                                                        // store hash
        creds.iter = iter;                                                              // store iterations
    }                                                                             

    saveStore(store);                                                                   // persist store

    res.json({ ok: true, username: creds.username });                                   // respond success
});                                                                             

// -------------------------------
// Config API (public + protected)
// -------------------------------

app.get("/api/publicConfig", (req, res) => {                                            // public config for index UI
    const c = store.config;                                                             // reference config
    res.set("Cache-Control", "no-store");                                               // prevent caching
    res.json({                                                                          // return safe subset only
        pageTitle: c.pageTitle,                                                         // page title
        relays: c.relays,                                                               // relay list (names + enabled)
        dis: c.dis,                                                                     // DI list (names + enabled)
        values: c.values,                                                               // value list (names + enabled)
    });                                                                            
});                                                                                   

app.get("/api/config", requireAuth, (req, res) => {                                     // protected full config endpoint
    res.set("Cache-Control", "no-store");                                               // prevent caching
    res.json({ ok: true, config: store.config, username: store.creds.username });       // return config + current username
});                                                                                 

app.post("/api/config", requireAuth, (req, res) => {                                    // protected config update endpoint
    const incoming = req.body?.config;                                                  // read incoming config object
    const next = normalizeConfig(incoming);                                             // normalize and sanitize
    store.config = next;                                                                // save into store
    saveStore(store);                                                                   // persist store
    ensureDevArrayLengths();                                                            // resize device arrays to match new config
    res.json({ ok: true, config: store.config });                                       // return updated config
});                                                                            

app.post("/api/config/reset", requireAuth, (req, res) => {                              // protected factory reset endpoint
    const fresh = defaultStore();                                                       // create fresh default store
    fresh.creds = store.creds;                                                          // preserve credentials on reset (safer)
    ensureCredsHashed(fresh);                                                           // ensure creds valid
    store = fresh;                                                                      // swap store in memory
    saveStore(store);                                                                   // persist reset store
    ensureDevArrayLengths();                                                            // resize arrays for defaults
    res.json({ ok: true, config: store.config });                                       // return reset config
});                                                                            

// -------------------------------
// ControlByWeb-style endpoint: /customState.json
// -------------------------------

app.get("/customState.json", (req, res) => {                                            // CBW-like poll endpoint
    const showUnits = req.query.showUnits === "1";                                      // showUnits toggles unit suffixes
    const showColors = req.query.showColors === "1";                                    // showColors toggles "#Color" suffixes

    const withColor = (s, color = "Grey") => (showColors ? `${s} #${color}` : s);       // append "#Color" if requested

    const payload = {};                                                                 // create payload object

    // Relays (dynamic)
    for (let i = 0; i < store.config.relays.length; i += 1) {                           // iterate configured relays
        payload[`relay${i + 1}`] = dev.relays[i] ? "1" : "0";                           // set relayN as "1"/"0"
    }                                                                            

    // Digital Inputs (dynamic)
    for (let i = 0; i < store.config.dis.length; i += 1) {                              // iterate configured DIs
        payload[`digitalInput${i + 1}`] = dev.din[i] ? "1" : "0";                       // set digitalInputN as "1"/"0"
    }                                                                               

    // Values (fixed keys used by existing UI logic; still safe even if hidden by config)
    payload.vin = withColor(`${dev.vin_v.toFixed(1)}${showUnits ? " V" : ""}`);   // VIN string (legacy key)
    payload.register1 = withColor(String(dev.register1));                               // register1 string
    payload.oneWire1 = withColor(`${dev.onewire1_f.toFixed(2)}${showUnits ? " F" : ""}`); // onewire string

    // Time + device identity style fields
    payload.utcTime = String(Math.floor(Date.now() / 1000));                            // seconds since epoch (UTC)
    payload.timezoneOffset = "-18000";                                                  // example timezone offset (seconds)
    payload.serialNumber = "00:00:00:00:00:00";                                         // placeholder serial/MAC-like string

    // Boot + uptime
    payload.bootTime = new Date(dev.boot_ms).toISOString();                             // ISO timestamp when device booted
    payload.uptimeMs = String(Date.now() - dev.boot_ms);                                // milliseconds since boot as string

    // Recommended refresh interval (seconds)
    payload.minRecRefresh = "1";                                                        // minimum recommended refresh seconds

    res.set("Cache-Control", "no-store");                                               // prevent caching
    res.json(payload);                                                                  // respond with JSON payload
});                                                                                 

// -------------------------------
// Relay control endpoints (dynamic)
// -------------------------------

function relayIndex(n) {                                                                // convert relay number into dev.relays index
    const i = Number(n) - 1;                                                            // convert 1-based to 0-based
    if (!Number.isFinite(i)) return -1;                                                 // reject NaN
    if (i < 0 || i >= dev.relays.length) return -1;                                     // bounds check against configured count
    return i;                                                                           // return valid index
}                                                                                    

app.post("/api/relay/:n/on", (req, res) => {                                            // turn relay N on
    const i = relayIndex(req.params.n);                                                 // validate and get index
    if (i < 0) return res.status(400).json({ ok: false, error: "bad relay number" });   // reject invalid relay
    dev.relays[i] = true;                                                               // set relay state ON
    res.json({ ok: true, relay: i + 1, on: true });                                     // respond success
});                                                                                   

app.post("/api/relay/:n/off", (req, res) => {                                           // turn relay N off
    const i = relayIndex(req.params.n);                                                 // validate and get index
    if (i < 0) return res.status(400).json({ ok: false, error: "bad relay number" });   // reject invalid relay
    dev.relays[i] = false;                                                              // set relay state OFF
    res.json({ ok: true, relay: i + 1, on: false });                                    // respond success
});                                                                             

app.post("/api/relay/:n/pulse", (req, res) => {                                         // pulse relay N for ms milliseconds
    const i = relayIndex(req.params.n);                                                 // validate and get index
    if (i < 0) return res.status(400).json({ ok: false, error: "bad relay number" });   // reject invalid relay

    const msRaw = Number(req.body?.ms ?? 500);                                          // read requested pulse width
    const ms = Math.max(10, Math.min(10000, Number.isFinite(msRaw) ? msRaw : 500));     // clamp to [10..10000] ms

    dev.relays[i] = true;                                                               // set relay ON immediately
    setTimeout(() => {                                                                  // schedule OFF transition
        dev.relays[i] = false;                                                          // set relay OFF after pulse duration
    }, ms);                                                                             // end setTimeout

    res.json({ ok: true, relay: i + 1, pulsed_ms: ms });                                // respond success
});                                                                                

// -------------------------------
// Simple DI + value simulation (keeps your demo “alive”)
// -------------------------------

setInterval(() => {                                                                     // periodic simulation tick
    // DI simulation: toggle one random DI occasionally
    if (dev.din.length > 0 && Math.random() < 0.35) {                                   // probabilistic DI toggle
        const i = Math.floor(Math.random() * dev.din.length);                           // choose DI index
        dev.din[i] = !dev.din[i];                                                       // toggle that DI
    }                                                                              

    // VIN drift: bounded triangle-ish motion
    const t = Date.now();                                                               // current time ms
    const period = 20000;                                                               // drift period ms
    const phase = (t % period) / period;                                                // normalized phase 0..1
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;                                // triangle wave 0..1..0
    dev.vin_v = 23.8 + (25.2 - 23.8) * tri;                                             // map triangle wave into voltage range

    // Register: count number of ON DIs (simple deterministic signal)
    dev.register1 = dev.din.reduce((acc, b) => acc + (b ? 1 : 0), 0);                    // integer 0..N

    // OneWire: slow sine wave
    const w = (2 * Math.PI) / 30000;                                                    // angular frequency
    dev.onewire1_f = 73 + 3 * Math.sin(w * t);                                          // compute temperature
}, 250);                                                                                // tick interval

// -------------------------------
// Start server
// -------------------------------

app.listen(8000, () => {                                                                // start listening on port 8000
    console.log("Dev server running at http://localhost:8000");                         // log a friendly URL
});                                                                                 
