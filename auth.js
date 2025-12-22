// websrc_cbw/auth.js
// -----------------------------------------------------------------------------
// Server-backed auth helpers for login/logout and credential management
// Session is maintained by an HttpOnly cookie set by the server.
// -----------------------------------------------------------------------------

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

// Checks whether the current browser session is authenticated.
export function getSession() {
    return request("/api/session", { method: "GET" });
}

// Performs login and establishes a session cookie.
export function login(username, password) {
    return request("/api/login", { method: "POST", body: { username, password } });
}

// Clears the server session cookie.
export function logout() {
    return request("/api/logout", { method: "POST" });
}

// Updates credentials server-side.
export function updateCredentials(username, password, currentPassword) {
    return request("/api/credentials", {
        method: "POST",
        body: { username, password, currentPassword },
    });
}

// Resets credentials to defaults on the server.
export function resetCredentials() {
    return request("/api/credentials/reset", { method: "POST" });
}
