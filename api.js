// websrc_cbw/api.js

async function request(path, { method = "GET", body } = {}) {                            // core helper for API requests
    const opts = { method, headers: {} };                                                // initialize fetch options
    if (body !== undefined) {                                                            // if a request body is provided
        opts.headers["content-type"] = "application/json";                               // set JSON content type
        opts.body = JSON.stringify(body);                                                // serialize body to JSON string
    }                                                                              

    const res = await fetch(path, opts);                                                 // perform HTTP request

    if (!res.ok) {                                                                       // if response is not 2xx
        const text = await res.text().catch(() => "");                                   // read response text best-effort
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);                 // throw a useful error
    }                                                                                 

    const ct = res.headers.get("content-type") || "";                                    // read content-type header
    if (ct.includes("application/json")) return res.json();                              // parse JSON if present
    return res.text();                                                                   // otherwise return plain text
}                                                                                   

// -----------------------------
// Public config (index page uses this)
// -----------------------------

export function getPublicConfig() {                                                      // fetch config that drives index UI layout
    return request("/api/publicConfig", { method: "GET" });                              // GET safe config
}                                                                                 

// -----------------------------
// Poll endpoint (CBW-style)
// -----------------------------

export function getCustomState() {                                                       // fetch CBW-style state JSON
    return request("/customState.json?showUnits=1&showColors=1", { method: "GET" });     // GET poll endpoint
}                                                                                      

// -----------------------------
// Relay controls
// -----------------------------

export function relayOn(n) {                                                             // turn relay n ON
    return request(`/api/relay/${n}/on`, { method: "POST" });                            // POST to /on
}                                                                                     

export function relayOff(n) {                                                            // turn relay n OFF
    return request(`/api/relay/${n}/off`, { method: "POST" });                           // POST to /off
}                                                                                    

export function relayPulse(n, ms = 500) {                                                // pulse relay n for ms milliseconds
    return request(`/api/relay/${n}/pulse`, { method: "POST", body: { ms } });           // POST with {ms}
}                                                                                    

// -----------------------------
// Auth + Setup config APIs
// -----------------------------

export function authLogin(username, password) {                                          // login with username/password
    return fetch("/api/auth/login", {                                                    // POST to /api/auth/login
        method: "POST",                                                                  // HTTP method
        headers: { "Content-Type": "application/json" },                                 // JSON content type
        body: JSON.stringify({ username, password })                                     // JSON-encoded payload
    }).then(r => {                                                                       // process response
        if (!r.ok) throw new Error("Invalid credentials");                               // throw on HTTP error
        return r.json();                                                                 // parse JSON on success
    });                                                                                 
}

export function authLogout() {                                                           // logout
    return request("/api/auth/logout", { method: "POST" });                              // POST logout
}                                                                                       

export function authChange(oldPassword, newUsername, newPassword) {                      // change username/password
    return request("/api/auth/change", {                                                 // POST change request
        method: "POST",                                                                  // HTTP method
        body: { oldPassword, newUsername, newPassword },                                 // payload
    });                                                                                
}                                                                                      

export function getConfig() {                                                            // fetch protected config for setup UI
    return request("/api/config", { method: "GET" });                                    // GET /api/config
}                                                                                      

export function saveConfig(config) {                                                     // save protected config from setup UI
    return request("/api/config", { method: "POST", body: { config } });                 // POST config
}                                                                                   

export function resetConfig() {                                                          // reset config to defaults (credentials preserved)
    return request("/api/config/reset", { method: "POST" });                             // POST reset
}                                                                                  

export function authLogin(username, password) {                                          // login with username/password
    return request("/api/auth/login", { method: "POST", body: { username, password } }); // POST login
}

export function authLogout() {                                                           // logout
    return request("/api/auth/logout", { method: "POST" });                              // POST logout
}

export function authChange(oldPassword, newUsername, newPassword) {                      // change username/password
    return request("/api/auth/change", { method: "POST", body: { oldPassword, newUsername, newPassword } });    // POST change request
}

export function getConfig() {                                                            // fetch protected config for setup UI
    return request("/api/config", { method: "GET" });                                    // GET /api/config
}

export function saveConfig(config) {                                                     // save protected config from setup UI
    return request("/api/config", { method: "POST", body: { config } });                 // POST config
}
