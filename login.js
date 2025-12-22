// login.js

import * as api from "./api.js";
import { $, setText, setDisabled, formatErr } from "./util.js";

const userEl = $("#user");
const passEl = $("#pass");
const btnEl = $("#loginBtn");
const msgEl = $("#msg");

async function doLogin() {
    const username = String(userEl.value ?? "").trim();
    const password = String(passEl.value ?? "");

    if (!username || !password) {
        setText(msgEl, "Enter username and password.");
        return;
    }

    try {
        setDisabled(btnEl, true);
        setText(msgEl, "Logging in...");

        await api.authLogin(username, password);

        // successful login → go to setup
        window.location.href = "/setup.html";
    } catch (e) {
        setText(msgEl, `Login failed: ${formatErr(e)}`);
    } finally {
        setDisabled(btnEl, false);
    }
}

// CLICK HANDLER (this is what was missing)
btnEl.addEventListener("click", doLogin);

// Optional: allow Enter key in password field
passEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
});
