import { getCredentials, isLoggedIn, setCredentials, setLoggedIn } from "./auth.js";

const loginUrl = "login.html?next=setup.html";

if (!isLoggedIn()) {
    window.location.replace(loginUrl);
}

const currentUserEl = document.getElementById("currentUser");
const logoutBtn = document.getElementById("logoutBtn");
const form = document.getElementById("setupForm");
const msgEl = document.getElementById("setupMsg");
const currentPasswordEl = document.getElementById("currentPassword");
const newUsernameEl = document.getElementById("newUsername");
const newPasswordEl = document.getElementById("newPassword");
const confirmPasswordEl = document.getElementById("confirmPassword");

function setMessage(text, type) {
    msgEl.textContent = text;
    msgEl.className = type ? `form-msg ${type}` : "form-msg";
}

function refreshUsername() {
    const creds = getCredentials();
    currentUserEl.textContent = creds.username;
    newUsernameEl.value = creds.username;
}

refreshUsername();

logoutBtn.addEventListener("click", () => {
    setLoggedIn(false);
    window.location.href = "login.html";
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    setMessage("", "");

    const creds = getCredentials();
    const currentPassword = currentPasswordEl.value;
    const newUsername = newUsernameEl.value.trim();
    const newPassword = newPasswordEl.value;
    const confirmPassword = confirmPasswordEl.value;

    if (currentPassword !== creds.password) {
        setMessage("Current password is incorrect.", "error");
        currentPasswordEl.focus();
        return;
    }

    if (!newUsername) {
        setMessage("New username is required.", "error");
        newUsernameEl.focus();
        return;
    }

    if (!newPassword || newPassword.length < 4) {
        setMessage("New password must be at least 4 characters.", "error");
        newPasswordEl.focus();
        return;
    }

    if (newPassword !== confirmPassword) {
        setMessage("New passwords do not match.", "error");
        confirmPasswordEl.focus();
        return;
    }

    setCredentials({ username: newUsername, password: newPassword });
    setMessage("Credentials updated.", "success");
    currentPasswordEl.value = "";
    newPasswordEl.value = "";
    confirmPasswordEl.value = "";
    refreshUsername();
});
