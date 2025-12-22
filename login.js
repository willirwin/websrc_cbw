// websrc_cbw/login.js
// -----------------------------------------------------------------------------
// Login screen logic (server-backed credentials)
// -----------------------------------------------------------------------------
import { login } from "./auth.js";

// Cache form elements once to keep handlers small and fast.
const form = document.getElementById("loginForm");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const msgEl = document.getElementById("loginMsg");

// Writes user-facing status messages into the login panel.
function setMessage(text, type) {
    msgEl.textContent = text;
    msgEl.className = type ? `form-msg ${type}` : "form-msg";
}

// Supports optional redirect (login.html?next=setup.html).
function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "setup.html";
}

form.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    // Submit credentials to the server; on success, go to setup.
    login(username, password)
        .then(() => {
            window.location.href = getNextUrl();
        })
        .catch(() => {
            setMessage("Invalid username or password.", "error");
            passwordEl.focus();
        });
});
