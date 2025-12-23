#!/usr/bin/env python3
# websrc_cbw/server.py
"""
Flask-based replacement for server.js. Serves the same static files and API
endpoints used by the browser UI, including minimal session auth and simulated
device behavior.
"""

# enable postponed evaluation of annotations
from __future__ import annotations

# standard library imports
import json
import logging
import math
import os
import random
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

# third-party imports
from flask import Flask, jsonify, redirect, request, send_from_directory

# -----------------------------------------------------------------------------
# App setup
# -----------------------------------------------------------------------------

# base directory for static assets and stored JSON
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Flask app instance with manual static routing
app = Flask(__name__, static_folder=None)

# -----------------------------------------------------------------------------
# Auth + UI config storage (server-side)
# -----------------------------------------------------------------------------

# filesystem paths for stored JSON files
AUTH_PATH = os.path.join(BASE_DIR, "auth.json")
UI_CONFIG_PATH = os.path.join(BASE_DIR, "ui-config.json")
# cookie name for the in-memory session token
SESSION_COOKIE = "cbw_session"
# in-memory sessions keyed by token; reset on server restart
sessions: Dict[str, Dict[str, Any]] = {}


# Read JSON from disk with a fallback value.
def read_json_safe(file_path: str, fallback: Any) -> Any:
    # safe JSON loader with fallback if file is missing or invalid
    # attempt to open and parse the JSON file
    try:
        # open the file for reading
        with open(file_path, "r", encoding="utf-8") as fh:
            # parse and return JSON payload
            return json.load(fh)
    except Exception:
        # on any error, return the fallback value
        return fallback


# Write JSON to disk with formatting.
def write_json_safe(file_path: str, data: Any) -> None:
    # writes formatted JSON for easy debugging/editing
    # open the file for writing and dump JSON
    with open(file_path, "w", encoding="utf-8") as fh:
        # format JSON with indentation
        json.dump(data, fh, indent=4)


# Build default credentials for first run.
def default_auth() -> Dict[str, str]:
    # default credentials for first run
    return {"username": "admin", "password": "admin"}


# Load auth credentials from disk.
def load_auth() -> Dict[str, str]:
    # read credentials from file or return defaults
    return read_json_safe(AUTH_PATH, default_auth())


# Save auth credentials to disk.
def save_auth(auth: Dict[str, str]) -> None:
    # persist credentials to file
    write_json_safe(AUTH_PATH, auth)


# Build the default UI configuration.
def default_ui_config() -> Dict[str, Any]:
    # matches the UI defaults used by the frontend
    # return a full UI configuration payload
    return {
        "title": "CASTLEROAD",
        "relays": [
            {"id": 1, "name": "Relay 1", "enabled": True},
            {"id": 2, "name": "Relay 2", "enabled": True},
            {"id": 3, "name": "Relay 3", "enabled": True},
            {"id": 4, "name": "Relay 4", "enabled": True},
        ],
        "digitalInputs": [
            {"id": 1, "name": "Digital Input 1", "enabled": True},
            {"id": 2, "name": "Digital Input 2", "enabled": True},
            {"id": 3, "name": "Digital Input 3", "enabled": True},
            {"id": 4, "name": "Digital Input 4", "enabled": True},
        ],
        "sensors": [
            {"key": "vin", "name": "VIN", "enabled": True},
            {"key": "register1", "name": "Register 1", "enabled": True},
            {"key": "oneWire1", "name": "OneWire 1", "enabled": True},
        ],
        "appearance": {
            "showClock": True,
            "showUptime": True,
            "showConnection": True,
        },
    }


# Load UI configuration from disk.
def load_ui_config() -> Dict[str, Any]:
    # read config from file or return defaults
    return read_json_safe(UI_CONFIG_PATH, default_ui_config())


# Save UI configuration to disk.
def save_ui_config(cfg: Dict[str, Any]) -> None:
    # persist config to file
    write_json_safe(UI_CONFIG_PATH, cfg)


# Enforce API auth using the session cookie.
def require_auth() -> Optional[Tuple[Any, int]]:
    # API guard: requires a valid session cookie
    # look up the session token from the request cookie
    token = request.cookies.get(SESSION_COOKIE)
    # allow the request if the token is valid
    if token and token in sessions:
        # authenticated callers pass through
        return None
    # reject unauthenticated callers
    return jsonify({"ok": False, "error": "unauthorized"}), 401


# Enforce page auth by redirecting to login.
def require_auth_page() -> Optional[Any]:
    # HTML guard: redirect to login when session is missing
    # look up the session token from the request cookie
    token = request.cookies.get(SESSION_COOKIE)
    # allow the request if the token is valid
    if token and token in sessions:
        # authenticated callers pass through
        return None
    # redirect unauthenticated callers to login
    return redirect("/login.html")


# Create a new session and set the cookie.
def create_session(username: str):
    # creates a new session and returns a response with cookie
    # generate a new random session token
    token = secrets.token_hex(16)
    # store session metadata in memory
    sessions[token] = {"username": username, "created": int(time.time() * 1000)}
    # build the response payload
    resp = jsonify({"ok": True})
    # attach the session cookie
    resp.set_cookie(SESSION_COOKIE, token, httponly=True, path="/")
    # return the response with cookie set
    return resp


# Clear the session and expire the cookie.
def clear_session():
    # clears session and expires the cookie
    # look up the current session token
    token = request.cookies.get(SESSION_COOKIE)
    # remove token from in-memory store if present
    if token in sessions:
        # delete the session entry
        sessions.pop(token, None)
    # build the response payload
    resp = jsonify({"ok": True})
    # expire the cookie on the client
    resp.set_cookie(SESSION_COOKIE, "", max_age=0, path="/")
    # return the response with cookie cleared
    return resp


# -----------------------------------------------------------------------------
# Auth endpoints
# -----------------------------------------------------------------------------


# Return session status for the client.
@app.get("/api/session")
def api_session():
    # read session token from the cookie
    token = request.cookies.get(SESSION_COOKIE)
    # return authenticated flag
    return jsonify({"ok": True, "authenticated": bool(token and token in sessions)})


# Handle login and create a session.
@app.post("/api/login")
def api_login():
    # parse the JSON payload
    payload = request.get_json(silent=True) or {}
    # extract credentials
    username = payload.get("username")
    password = payload.get("password")
    # load stored credentials
    auth = load_auth()
    # verify credentials against stored auth
    if username == auth.get("username") and password == auth.get("password"):
        # create a session on success
        return create_session(username)
    # return error if credentials are invalid
    return jsonify({"ok": False, "error": "invalid credentials"}), 401


# Handle logout and clear session.
@app.post("/api/logout")
def api_logout():
    # clear session cookie and memory
    return clear_session()


# Return current username (auth required).
@app.get("/api/credentials")
def api_credentials_get():
    # enforce authentication
    guard = require_auth()
    if guard:
        # return unauthorized response
        return guard
    # load stored credentials
    auth = load_auth()
    # return only the username
    return jsonify({"username": auth.get("username")})


# Update credentials (auth required).
@app.post("/api/credentials")
def api_credentials_post():
    # enforce authentication
    guard = require_auth()
    if guard:
        # return unauthorized response
        return guard
    # parse the JSON payload
    payload = request.get_json(silent=True) or {}
    # extract requested fields
    current_password = payload.get("currentPassword")
    username = payload.get("username")
    password = payload.get("password")
    # load current credentials
    auth = load_auth()
    # verify current password
    if current_password != auth.get("password"):
        # reject if current password is wrong
        return jsonify({"ok": False, "error": "invalid current password"}), 401
    # require a non-empty username and password
    if not username or not password:
        # reject missing fields
        return jsonify({"ok": False, "error": "username and password required"}), 400
    # persist the updated credentials
    save_auth({"username": str(username), "password": str(password)})
    # return success response
    return jsonify({"ok": True})


# Reset credentials to defaults (auth required).
@app.post("/api/credentials/reset")
def api_credentials_reset():
    # enforce authentication
    guard = require_auth()
    if guard:
        # return unauthorized response
        return guard
    # rebuild default credentials
    defaults = default_auth()
    # save defaults to disk
    save_auth(defaults)
    # return success with defaults
    return jsonify({"ok": True, "defaults": defaults})


# -----------------------------------------------------------------------------
# UI config endpoints
# -----------------------------------------------------------------------------


# Return UI config.
@app.get("/api/ui-config")
def api_ui_config_get():
    # return current UI config
    return jsonify(load_ui_config())


# Save UI config (auth required).
@app.post("/api/ui-config")
def api_ui_config_post():
    # enforce authentication
    guard = require_auth()
    if guard:
        # return unauthorized response
        return guard
    # parse the JSON payload
    payload = request.get_json(silent=True) or {}
    # persist config
    save_ui_config(payload)
    # return success response
    return jsonify({"ok": True})


# -----------------------------------------------------------------------------
# Protected setup assets
# -----------------------------------------------------------------------------


# Serve setup.html with auth guard.
@app.get("/setup.html")
def setup_html():
    # enforce authentication for setup page
    guard = require_auth_page()
    if guard:
        # redirect unauthorized request
        return guard
    # serve the setup page from disk
    return send_from_directory(BASE_DIR, "setup.html")


# Serve setup.js with auth guard.
@app.get("/setup.js")
def setup_js():
    # enforce authentication for setup script
    guard = require_auth()
    if guard:
        # return unauthorized response
        return guard
    # serve the setup script from disk
    return send_from_directory(BASE_DIR, "setup.js")


# -----------------------------------------------------------------------------
# Simulated device state
# -----------------------------------------------------------------------------

# lock to protect shared device state
dev_lock = threading.Lock()

# in-memory device state snapshot
dev: Dict[str, Any] = {
    "boot_ms": int(time.time() * 1000),
    "relays": [False, False, False, False],
    "din": [False, False, False, False],
    "vin_v": 24.4,
    "register1": 0,
    "onewire1_f": 72.05,
}

# DI counter simulation state
di_counter = {"value": 0, "periodMs": 1000, "enabled": True}
# random DI toggle simulation state
din_sim = {"enabled": False, "periodMs": 2000}
# analog value simulation state
value_sim = {"enabled": True, "periodMs": 250, "t": 0}


# Clamp a value to an int range.
def clamp_int(x: Any, lo: int, hi: int) -> int:
    # clamps input to integer range
    # attempt to coerce to int
    try:
        # parse input as float then int
        n = int(float(x))
    except Exception:
        # return lower bound on conversion error
        return lo
    # clamp to requested range
    return max(lo, min(hi, n))


# Clamp a value to a numeric range.
def clamp_num(x: Any, lo: float, hi: float) -> float:
    # clamps input to numeric range
    # attempt to coerce to float
    try:
        # parse input as float
        n = float(x)
    except Exception:
        # return lower bound on conversion error
        return lo
    # clamp to requested range
    return max(lo, min(hi, n))


# Update dev.din from the counter.
def update_din_from_counter() -> None:
    # updates dev.din[] from the current counter bits
    # skip updates when simulation disabled
    if not di_counter["enabled"]:
        # leave inputs unchanged
        return
    # increment and wrap counter to 4 bits
    di_counter["value"] = (di_counter["value"] + 1) & 0x0F
    # update digital input bits from the counter
    dev["din"][0] = bool(di_counter["value"] & 0x01)
    dev["din"][1] = bool(di_counter["value"] & 0x02)
    dev["din"][2] = bool(di_counter["value"] & 0x04)
    dev["din"][3] = bool(di_counter["value"] & 0x08)


# Background thread loop for DI counter simulation.
def di_counter_loop() -> None:
    # background thread for DI counter simulation
    # run forever to keep simulation active
    while True:
        # update device state under lock
        with dev_lock:
            # update counter-derived inputs
            update_din_from_counter()
        # sleep until next tick
        time.sleep(max(0.05, di_counter["periodMs"] / 1000.0))


# Toggle a random DI bit when enabled.
def tick_din_sim() -> None:
    # toggles a random DI bit
    # skip updates when simulation disabled
    if not din_sim["enabled"]:
        # leave inputs unchanged
        return
    # choose a random DI index
    idx = random.randrange(0, 4)
    # flip the chosen input
    dev["din"][idx] = not dev["din"][idx]


# Background thread loop for random DI toggling.
def din_sim_loop() -> None:
    # background thread for random DI toggling
    # run forever to keep simulation active
    while True:
        # update device state under lock
        with dev_lock:
            # toggle a random input
            tick_din_sim()
        # sleep until next tick
        time.sleep(max(0.05, din_sim["periodMs"] / 1000.0))


# Update VIN, register, and OneWire values when enabled.
def tick_value_sim() -> None:
    # updates VIN, register, and OneWire values
    # skip updates when simulation disabled
    if not value_sim["enabled"]:
        # leave values unchanged
        return
    # advance simulation time
    value_sim["t"] += value_sim["periodMs"]

    # VIN triangle wave between 23.8 and 25.2
    # set the period for the triangle wave
    period = 20000
    # compute phase in 0..1 range
    phase = (value_sim["t"] % period) / period
    # compute normalized triangle waveform
    tri = (phase * 2) if phase < 0.5 else (2 - phase * 2)
    # write VIN value
    dev["vin_v"] = 23.8 + (25.2 - 23.8) * tri

    # Register1 tracks DI counter
    dev["register1"] = int(di_counter["value"])

    # OneWire1 sine wave 70..76 F
    # set the period for the sine wave
    period = 30000
    # compute angular frequency
    w = (2 * math.pi) / period
    # compute temperature value
    temp = 73 + 3 * math.sin(w * value_sim["t"])
    # clamp and store the temperature
    dev["onewire1_f"] = clamp_num(temp, -40, 212)


# Background thread loop for value simulation.
def value_sim_loop() -> None:
    # background thread for value simulation
    # run forever to keep simulation active
    while True:
        # update device state under lock
        with dev_lock:
            # update simulated values
            tick_value_sim()
        # sleep until next tick
        time.sleep(max(0.05, value_sim["periodMs"] / 1000.0))


# start the DI counter thread
threading.Thread(target=di_counter_loop, daemon=True).start()
# start the random DI toggle thread
threading.Thread(target=din_sim_loop, daemon=True).start()
# start the analog value simulation thread
threading.Thread(target=value_sim_loop, daemon=True).start()


# -----------------------------------------------------------------------------
# Device API endpoints
# -----------------------------------------------------------------------------


# Update DI simulation settings.
@app.post("/api/sim/di")
def api_sim_di():
    # parse the JSON payload
    payload = request.get_json(silent=True) or {}
    # update enabled flag if provided
    if isinstance(payload.get("enabled"), bool):
        # store the new enabled flag
        din_sim["enabled"] = payload["enabled"]
    # update period if provided
    if payload.get("periodMs") is not None:
        # clamp and store the period
        din_sim["periodMs"] = clamp_int(payload.get("periodMs"), 100, 60000)
    # return updated simulation settings
    return jsonify({"ok": True, "dinSim": din_sim})


# Update value simulation settings.
@app.post("/api/sim/values")
def api_sim_values():
    # parse the JSON payload
    payload = request.get_json(silent=True) or {}
    # update enabled flag if provided
    if isinstance(payload.get("enabled"), bool):
        # store the new enabled flag
        value_sim["enabled"] = payload["enabled"]
    # return updated simulation settings
    return jsonify({"ok": True, "valueSim": {"enabled": value_sim["enabled"], "periodMs": value_sim["periodMs"]}})


# Convert relay number 1..4 to index 0..3.
def relay_index(n: Any) -> int:
    # converts relay number 1..4 to index 0..3
    # attempt to parse a relay number
    try:
        # translate to zero-based index
        idx = int(n) - 1
    except Exception:
        # return invalid index on error
        return -1
    # return index if valid, otherwise -1
    return idx if 0 <= idx < 4 else -1


# Turn a relay on.
@app.post("/api/relay/<int:n>/on")
def api_relay_on(n: int):
    # map relay number to index
    idx = relay_index(n)
    # validate the relay number
    if idx < 0:
        # return error for invalid relay
        return jsonify({"ok": False, "error": "bad relay number"}), 400
    # update relay state under lock
    with dev_lock:
        # set the relay state to on
        dev["relays"][idx] = True
    # return success response
    return jsonify({"ok": True, "relay": idx + 1, "on": True})


# Turn a relay off.
@app.post("/api/relay/<int:n>/off")
def api_relay_off(n: int):
    # map relay number to index
    idx = relay_index(n)
    # validate the relay number
    if idx < 0:
        # return error for invalid relay
        return jsonify({"ok": False, "error": "bad relay number"}), 400
    # update relay state under lock
    with dev_lock:
        # set the relay state to off
        dev["relays"][idx] = False
    # return success response
    return jsonify({"ok": True, "relay": idx + 1, "on": False})


# Pulse a relay on then off after a delay.
@app.post("/api/relay/<int:n>/pulse")
def api_relay_pulse(n: int):
    # map relay number to index
    idx = relay_index(n)
    # validate the relay number
    if idx < 0:
        # return error for invalid relay
        return jsonify({"ok": False, "error": "bad relay number"}), 400

    # parse the JSON payload
    payload = request.get_json(silent=True) or {}
    # clamp the requested pulse duration
    ms = clamp_int(payload.get("ms", 500), 10, 10000)

    # set relay on under lock
    with dev_lock:
        # set the relay state to on
        dev["relays"][idx] = True

    # helper to turn relay back off
    def turn_off():
        # update relay state under lock
        with dev_lock:
            # set the relay state to off
            dev["relays"][idx] = False

    # schedule relay to turn off after delay
    threading.Timer(ms / 1000.0, turn_off).start()
    # return success response
    return jsonify({"ok": True, "relay": idx + 1, "pulsed_ms": ms})


# Return device state in CBW-style format.
@app.get("/customState.json")
def custom_state():
    # read optional query flags
    show_units = request.args.get("showUnits") == "1"
    show_colors = request.args.get("showColors") == "1"

    # helper to apply color tag when requested
    def with_color(s: str, color: str = "Grey") -> str:
        # append color suffix only when enabled
        return f"{s} #{color}" if show_colors else s

    # build payload under lock
    with dev_lock:
        # base payload with fixed fields
        payload = {
            "digitalInput1": "0",
            "digitalInput2": "0",
            "digitalInput3": "0",
            "digitalInput4": "0",
            "relay1": "0",
            "relay2": "0",
            "relay3": "0",
            "relay4": "0",
            "vinasdkfj": with_color(f"24.4{' V' if show_units else ''}"),
            "register1": with_color(str(dev["register1"])),
            "oneWire1": with_color(f"{dev['onewire1_f']:.2f}{' F' if show_units else ''}"),
            "utcTime": str(int(time.time())),
            "timezoneOffset": "-18000",
            "serialNumber": "00:00:00:00:00:00",
            "bootTime": datetime.fromtimestamp(dev["boot_ms"] / 1000, tz=timezone.utc).isoformat(),
            "uptimeMs": str(int(time.time() * 1000 - dev["boot_ms"])),
            "minRecRefresh": "1",
        }

        # fill digital input and relay values from current state
        for i in range(4):
            # write digital input value
            payload[f"digitalInput{i + 1}"] = "1" if dev["din"][i] else "0"
            # write relay value
            payload[f"relay{i + 1}"] = "1" if dev["relays"][i] else "0"

        # update VIN value after initial payload
        payload["vinasdkfj"] = with_color(f"{dev['vin_v']:.1f}{' V' if show_units else ''}")

    # build JSON response
    resp = jsonify(payload)
    # prevent caching in the browser
    resp.headers["Cache-Control"] = "no-store"
    # return response
    return resp


# -----------------------------------------------------------------------------
# Static file routes
# -----------------------------------------------------------------------------


# Serve the main dashboard page.
@app.get("/")
def index():
    # serve index.html from disk
    return send_from_directory(BASE_DIR, "index.html")


# Serve static assets with setup protection.
@app.get("/<path:filename>")
def static_files(filename: str):
    # keep setup files protected; everything else is static
    # guard setup page
    if filename == "setup.html":
        # check session and redirect if needed
        guard = require_auth_page()
        if guard:
            # redirect unauthorized request
            return guard
    # guard setup script
    if filename == "setup.js":
        # check session and return error if needed
        guard = require_auth()
        if guard:
            # return unauthorized response
            return guard
    # serve the requested file
    return send_from_directory(BASE_DIR, filename)


if __name__ == "__main__":
    # import CLI helpers to suppress the banner
    from flask import cli

    # disable the Flask startup banner
    cli.show_server_banner = lambda *args, **kwargs: None
    # reduce request logging noise from Werkzeug
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    # print a single startup line for the user
    print("Dev server running at http://localhost:8000")
    # run the development server
    app.run(host="0.0.0.0", port=8000)
