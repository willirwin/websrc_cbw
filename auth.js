const STORAGE_KEY = "cbw_auth";
const SESSION_KEY = "cbw_auth_session";

export function getCredentials() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.username === "string" && typeof parsed.password === "string") {
                return parsed;
            }
        } catch {
            // ignore parse errors and reset defaults
        }
    }

    const defaults = { username: "admin", password: "admin" };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
}

export function setCredentials(next) {
    const payload = {
        username: String(next.username ?? ""),
        password: String(next.password ?? ""),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
}

export function isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === "1";
}

export function setLoggedIn(enabled) {
    if (enabled) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
}
