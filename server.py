#!/usr/bin/env python3
# websrc_cbw/server.py
"""
Flask-based replacement for server.js. Serves the same static files and API
endpoints used by the browser UI, including minimal session auth and simulated
device behavior.
"""

from __future__ import annotations

import json
import math
import os
import random
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from flask import Flask, jsonify, redirect, request, send_from_directory

# -----------------------------------------------------------------------------
# App setup
# -----------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

# -----------------------------------------------------------------------------
# Auth + UI config storage (server-side)
# -----------------------------------------------------------------------------

AUTH_PATH = os.path.join(BASE_DIR, "auth.json")
UI_CONFIG_PATH = os.path.join(BASE_DIR, "ui-config.json")
SESSION_COOKIE = "cbw_session"
sessions: Dict[str, Dict[str, Any]] = {}
# in-memory sessions keyed by token; reset on server restart


def read_json_safe(file_path: str, fallback: Any) -> Any:
    # safe JSON loader with fallback if file is missing or invalid
    try:
        with open(file_path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return fallback


def write_json_safe(file_path: str, data: Any) -> None:
    # writes formatted JSON for easy debugging/editing
    with open(file_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=4)


def default_auth() -> Dict[str, str]:
    # default credentials for first run
    return {"username": "admin", "password": "admin"}


def load_auth() -> Dict[str, str]:
    return read_json_safe(AUTH_PATH, default_auth())


def save_auth(auth: Dict[str, str]) -> None:
    write_json_safe(AUTH_PATH, auth)


def default_ui_config() -> Dict[str, Any]:
    # matches the UI defaults used by the frontend
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


def load_ui_config() -> Dict[str, Any]:
    return read_json_safe(UI_CONFIG_PATH, default_ui_config())


def save_ui_config(cfg: Dict[str, Any]) -> None:
    write_json_safe(UI_CONFIG_PATH, cfg)


def require_auth() -> Optional[Tuple[Any, int]]:
    # API guard: requires a valid session cookie
    token = request.cookies.get(SESSION_COOKIE)
    if token and token in sessions:
        return None
    return jsonify({"ok": False, "error": "unauthorized"}), 401


def require_auth_page() -> Optional[Any]:
    # HTML guard: redirect to login when session is missing
    token = request.cookies.get(SESSION_COOKIE)
    if token and token in sessions:
        return None
    return redirect("/login.html")


def create_session(username: str):
    # creates a new session and returns a response with cookie
    token = secrets.token_hex(16)
    sessions[token] = {"username": username, "created": int(time.time() * 1000)}
    resp = jsonify({"ok": True})
    resp.set_cookie(SESSION_COOKIE, token, httponly=True, path="/")
    return resp


def clear_session():
    # clears session and expires the cookie
    token = request.cookies.get(SESSION_COOKIE)
    if token in sessions:
        sessions.pop(token, None)
    resp = jsonify({"ok": True})
    resp.set_cookie(SESSION_COOKIE, "", max_age=0, path="/")
    return resp


# -----------------------------------------------------------------------------
# Auth endpoints
# -----------------------------------------------------------------------------


@app.get("/api/session")
def api_session():
    token = request.cookies.get(SESSION_COOKIE)
    return jsonify({"ok": True, "authenticated": bool(token and token in sessions)})


@app.post("/api/login")
def api_login():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username")
    password = payload.get("password")
    auth = load_auth()
    if username == auth.get("username") and password == auth.get("password"):
        return create_session(username)
    return jsonify({"ok": False, "error": "invalid credentials"}), 401


@app.post("/api/logout")
def api_logout():
    return clear_session()


@app.get("/api/credentials")
def api_credentials_get():
    guard = require_auth()
    if guard:
        return guard
    auth = load_auth()
    return jsonify({"username": auth.get("username")})


@app.post("/api/credentials")
def api_credentials_post():
    guard = require_auth()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    current_password = payload.get("currentPassword")
    username = payload.get("username")
    password = payload.get("password")
    auth = load_auth()
    if current_password != auth.get("password"):
        return jsonify({"ok": False, "error": "invalid current password"}), 401
    if not username or not password:
        return jsonify({"ok": False, "error": "username and password required"}), 400
    save_auth({"username": str(username), "password": str(password)})
    return jsonify({"ok": True})


@app.post("/api/credentials/reset")
def api_credentials_reset():
    guard = require_auth()
    if guard:
        return guard
    defaults = default_auth()
    save_auth(defaults)
    return jsonify({"ok": True, "defaults": defaults})


# -----------------------------------------------------------------------------
# UI config endpoints
# -----------------------------------------------------------------------------


@app.get("/api/ui-config")
def api_ui_config_get():
    return jsonify(load_ui_config())


@app.post("/api/ui-config")
def api_ui_config_post():
    guard = require_auth()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    save_ui_config(payload)
    return jsonify({"ok": True})


# -----------------------------------------------------------------------------
# Protected setup assets
# -----------------------------------------------------------------------------


@app.get("/setup.html")
def setup_html():
    guard = require_auth_page()
    if guard:
        return guard
    return send_from_directory(BASE_DIR, "setup.html")


@app.get("/setup.js")
def setup_js():
    guard = require_auth()
    if guard:
        return guard
    return send_from_directory(BASE_DIR, "setup.js")


# -----------------------------------------------------------------------------
# Simulated device state
# -----------------------------------------------------------------------------

dev_lock = threading.Lock()

dev: Dict[str, Any] = {
    "boot_ms": int(time.time() * 1000),
    "relays": [False, False, False, False],
    "din": [False, False, False, False],
    "vin_v": 24.4,
    "register1": 0,
    "onewire1_f": 72.05,
}

di_counter = {"value": 0, "periodMs": 1000, "enabled": True}
din_sim = {"enabled": False, "periodMs": 2000}
value_sim = {"enabled": True, "periodMs": 250, "t": 0}


def clamp_int(x: Any, lo: int, hi: int) -> int:
    # clamps input to integer range
    try:
        n = int(float(x))
    except Exception:
        return lo
    return max(lo, min(hi, n))


def clamp_num(x: Any, lo: float, hi: float) -> float:
    # clamps input to numeric range
    try:
        n = float(x)
    except Exception:
        return lo
    return max(lo, min(hi, n))


def update_din_from_counter() -> None:
    # updates dev.din[] from the current counter bits
    if not di_counter["enabled"]:
        return
    di_counter["value"] = (di_counter["value"] + 1) & 0x0F
    dev["din"][0] = bool(di_counter["value"] & 0x01)
    dev["din"][1] = bool(di_counter["value"] & 0x02)
    dev["din"][2] = bool(di_counter["value"] & 0x04)
    dev["din"][3] = bool(di_counter["value"] & 0x08)


def di_counter_loop() -> None:
    # background thread for DI counter simulation
    while True:
        with dev_lock:
            update_din_from_counter()
        time.sleep(max(0.05, di_counter["periodMs"] / 1000.0))


def tick_din_sim() -> None:
    # toggles a random DI bit
    if not din_sim["enabled"]:
        return
    idx = random.randrange(0, 4)
    dev["din"][idx] = not dev["din"][idx]


def din_sim_loop() -> None:
    # background thread for random DI toggling
    while True:
        with dev_lock:
            tick_din_sim()
        time.sleep(max(0.05, din_sim["periodMs"] / 1000.0))


def tick_value_sim() -> None:
    # updates VIN, register, and OneWire values
    if not value_sim["enabled"]:
        return
    value_sim["t"] += value_sim["periodMs"]

    # VIN triangle wave between 23.8 and 25.2
    period = 20000
    phase = (value_sim["t"] % period) / period
    tri = (phase * 2) if phase < 0.5 else (2 - phase * 2)
    dev["vin_v"] = 23.8 + (25.2 - 23.8) * tri

    # Register1 tracks DI counter
    dev["register1"] = int(di_counter["value"])

    # OneWire1 sine wave 70..76 F
    period = 30000
    w = (2 * math.pi) / period
    temp = 73 + 3 * math.sin(w * value_sim["t"])
    dev["onewire1_f"] = clamp_num(temp, -40, 212)


def value_sim_loop() -> None:
    # background thread for value simulation
    while True:
        with dev_lock:
            tick_value_sim()
        time.sleep(max(0.05, value_sim["periodMs"] / 1000.0))


threading.Thread(target=di_counter_loop, daemon=True).start()
threading.Thread(target=din_sim_loop, daemon=True).start()
threading.Thread(target=value_sim_loop, daemon=True).start()


# -----------------------------------------------------------------------------
# Device API endpoints
# -----------------------------------------------------------------------------


@app.post("/api/sim/di")
def api_sim_di():
    payload = request.get_json(silent=True) or {}
    if isinstance(payload.get("enabled"), bool):
        din_sim["enabled"] = payload["enabled"]
    if payload.get("periodMs") is not None:
        din_sim["periodMs"] = clamp_int(payload.get("periodMs"), 100, 60000)
    return jsonify({"ok": True, "dinSim": din_sim})


@app.post("/api/sim/values")
def api_sim_values():
    payload = request.get_json(silent=True) or {}
    if isinstance(payload.get("enabled"), bool):
        value_sim["enabled"] = payload["enabled"]
    return jsonify({"ok": True, "valueSim": {"enabled": value_sim["enabled"], "periodMs": value_sim["periodMs"]}})


def relay_index(n: Any) -> int:
    # converts relay number 1..4 to index 0..3
    try:
        idx = int(n) - 1
    except Exception:
        return -1
    return idx if 0 <= idx < 4 else -1


@app.post("/api/relay/<int:n>/on")
def api_relay_on(n: int):
    idx = relay_index(n)
    if idx < 0:
        return jsonify({"ok": False, "error": "bad relay number"}), 400
    with dev_lock:
        dev["relays"][idx] = True
    return jsonify({"ok": True, "relay": idx + 1, "on": True})


@app.post("/api/relay/<int:n>/off")
def api_relay_off(n: int):
    idx = relay_index(n)
    if idx < 0:
        return jsonify({"ok": False, "error": "bad relay number"}), 400
    with dev_lock:
        dev["relays"][idx] = False
    return jsonify({"ok": True, "relay": idx + 1, "on": False})


@app.post("/api/relay/<int:n>/pulse")
def api_relay_pulse(n: int):
    idx = relay_index(n)
    if idx < 0:
        return jsonify({"ok": False, "error": "bad relay number"}), 400

    payload = request.get_json(silent=True) or {}
    ms = clamp_int(payload.get("ms", 500), 10, 10000)

    with dev_lock:
        dev["relays"][idx] = True

    def turn_off():
        with dev_lock:
            dev["relays"][idx] = False

    threading.Timer(ms / 1000.0, turn_off).start()
    return jsonify({"ok": True, "relay": idx + 1, "pulsed_ms": ms})


@app.get("/customState.json")
def custom_state():
    show_units = request.args.get("showUnits") == "1"
    show_colors = request.args.get("showColors") == "1"

    def with_color(s: str, color: str = "Grey") -> str:
        return f"{s} #{color}" if show_colors else s

    with dev_lock:
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

        for i in range(4):
            payload[f"digitalInput{i + 1}"] = "1" if dev["din"][i] else "0"
            payload[f"relay{i + 1}"] = "1" if dev["relays"][i] else "0"

        payload["vinasdkfj"] = with_color(f"{dev['vin_v']:.1f}{' V' if show_units else ''}")

    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "no-store"
    return resp


# -----------------------------------------------------------------------------
# Static file routes
# -----------------------------------------------------------------------------


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    # keep setup files protected; everything else is static
    if filename == "setup.html":
        guard = require_auth_page()
        if guard:
            return guard
    if filename == "setup.js":
        guard = require_auth()
        if guard:
            return guard
    return send_from_directory(BASE_DIR, filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
