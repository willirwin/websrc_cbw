import { getCredentials, setLoggedIn } from "./auth.js";

const form = document.getElementById("loginForm");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const msgEl = document.getElementById("loginMsg");

function setMessage(text, type) {
    msgEl.textContent = text;
    msgEl.className = type ? `form-msg ${type}` : "form-msg";
}

function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "setup.html";
}

getCredentials();

form.addEventListener("submit", (event) => {
    event.preventDefault();

    const creds = getCredentials();
    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (username === creds.username && password === creds.password) {
        setLoggedIn(true);
        window.location.href = getNextUrl();
        return;
    }

    setMessage("Invalid username or password.", "error");
    passwordEl.focus();
});
