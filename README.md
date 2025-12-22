# websrc_cbw

Lightweight ControlByWeb-style demo UI and local dev server (Node) for an IoT control panel.

## What this repo does
- Serves a single-page control dashboard (`index.html`) plus admin setup screens.
- Simulates a device backend with relay control, digital inputs, and sensor values.
- Provides a simple local-only admin login and configuration editor (no real auth).

## Pages
- `index.html` - Control dashboard (relays, DIs, sensor values).
- `login.html` - Admin login gate (localStorage/sessionStorage).
- `setup.html` - Admin setup (General, I/O Setup, Monitor & Control).

## Features
- Relay control (on/off/pulse) via `/api/relay/:n/*`.
- CBW-style status polling via `/customState.json`.
- I/O naming + enable/disable controls stored in localStorage.
- Appearance controls for title/clock/uptime/connection display.

## Run
1) Install dependencies (only Express is required):
   - `npm install express`
2) Start the dev server:
   - `node server.js`
3) Open:
   - `http://localhost:8000/index.html`

## Configuration storage
- Auth credentials: `auth.json` (server-side)
- UI config: `ui-config.json` (server-side)
- Session: in-memory cookie-based session (clears on server restart)

## File map
- `server.js` - Express dev server + simulated device state
- `client.py` - CLI “browser” for state, relays, auth, and config
- `index.html` - Main control UI
- `login.html` - Admin login UI
- `setup.html` - Admin setup UI
- `main.js` - App entrypoint
- `ui.js` - DOM wiring + polling renderer
- `api.js` - Fetch helpers for backend endpoints
- `state.js` - Shared client state
- `config.js` - UI configuration storage + apply logic
- `auth.js` - Local-only auth helpers
- `login.js` - Login flow
- `setup.js` - Setup tabs + save/reset logic
- `util.js` - DOM/util helpers
- `style.css` - Shared styles

## CLI usage (client.py)
- `python client.py state` - show current device snapshot
- `python client.py relay on|off|pulse <n> [--ms]` - control relays
- `python client.py session` - show auth/session state
- `python client.py login <user> <pass>` / `python client.py logout`
- `python client.py creds show|set|reset` - manage credentials (requires login)
- `python client.py config show|set|reset` - manage UI config (set/reset requires login)
- Use `--auth-user` and `--auth-pass` for one-shot auth on protected commands
