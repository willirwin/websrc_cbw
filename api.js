// websrc_cbw_beta/api.js

// low-level API functions to communicate with the backend server

// -----------------------------------------------------------------------------
// Core request helper
// -----------------------------------------------------------------------------

// Centralized fetch wrapper; throws on non-2xx so the UI can show "Disconnected".
async function request(path, { method = "GET", body } = {}) {
    // creates function "request" to make HTTP requests
    const opts = { method, headers: {} };
    // sets up object "opts" for fetch with method and headers

    if (body !== undefined) {
        // if a body is provided
        opts.headers["content-type"] = "application/json";
        // set Content-Type header to "application/json"
        opts.body = JSON.stringify(body);
        // convert body to JSON string
    }

    const res = await fetch(path, opts);
    // performs the HTTP request using fetch with the given path and options

    // If server returns non-2xx status, throw with useful info:
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        // attempt to read response text, default to empty string on failure
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
        // throw an error with status code, status text, and response text
    }

    // Some endpoints return no content (204):
    const ct = res.headers.get("content-type") || "";
    // reads Content-Type header from the response (or defaults to empty string)
    if (ct.includes("application/json")) return res.json();
    // if Content-Type indicates JSON, parse and return JSON
    return res.text();
    // otherwise, return response as plain text
}

// -----------------------------------------------------------------------------
// ControlByWeb-style polling endpoint
// -----------------------------------------------------------------------------

export function getCustomState() {
    // exports function "getCustomState" to get custom state information
    // this is the main poll endpoint used by the UI (CBW-style strings)
    return request("/customState.json?showUnits=1&showColors=1", {
        method: "GET",
    });
}

// -----------------------------------------------------------------------------
// Relay control endpoints (UI -> device control)
// -----------------------------------------------------------------------------

export function relayOn(n) {
    // exports function "relayOn" to turn relay n ON
    return request(`/api/relay/${n}/on`, { method: "POST" });
}

export function relayOff(n) {
    // exports function "relayOff" to turn relay n OFF
    return request(`/api/relay/${n}/off`, { method: "POST" });
}

export function relayPulse(n, ms = 500) {
    // exports function "relayPulse" to pulse relay n for ms milliseconds
    // body format matches backend: { ms: 250 }
    return request(`/api/relay/${n}/pulse`, { method: "POST", body: { ms } });
}
