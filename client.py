#!/usr/bin/env python3
"""
client.py

Headless “browser” client for the simulated ControlByWeb-style device.

This script talks to the same HTTP endpoints that the real browser UI uses,
allowing command-line control and monitoring of the device.

Purpose:
- Simulate a browser from the CLI
- Exercise relay control endpoints
- Observe digital inputs and values
- Verify backend behavior without opening a browser
- Test login/session flows and server-backed setup configuration
"""

import argparse
import json
import time
from typing import Any, Dict, Optional, Tuple

import requests
# requests is used as the HTTP client (acts like the browser's fetch())

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

def _join(base: str, path: str) -> str:
    # joins base URL and path safely without duplicating slashes
    base = base.rstrip("/")
    if not path.startswith("/"):
        path = "/" + path
    return base + path


def format_req_err(e: Exception) -> str:
    # converts common requests exceptions into readable error messages
    if isinstance(e, requests.exceptions.ConnectTimeout):
        return "Connect timeout (server offline or blocked)"
    if isinstance(e, requests.exceptions.ReadTimeout):
        return "Read timeout (server not responding)"
    if isinstance(e, requests.exceptions.ConnectionError):
        return "Connection error (refused / unreachable / server offline)"
    if isinstance(e, requests.exceptions.HTTPError):
        return f"HTTP error: {e}"
    return f"Request error: {e}"


def parse_value_color(s: Any) -> Tuple[str, str]:
    """
    Parses ControlByWeb-style strings like:
        "72.05 F #Grey"

    Returns:
        ("72.05 F", "Grey")

    The UI ignores the color today, but we parse it anyway so this
    client mirrors browser behavior.
    """
    if not isinstance(s, str):
        return (str(s if s is not None else ""), "")

    parts = s.split(" #", 1)
    value = parts[0]
    color = parts[1] if len(parts) > 1 else ""
    return (value, color)


def format_uptime(ms: Any) -> str:
    """
    Formats uptime milliseconds into:
        HH:MM:SS.mmm

    Matches the formatting used in the browser UI.
    """
    try:
        total_ms = int(float(ms))
    except Exception:
        return ""

    if total_ms < 0:
        return ""

    hours = total_ms // 3600000
    minutes = (total_ms % 3600000) // 60000
    seconds = (total_ms % 60000) // 1000
    millis = total_ms % 1000

    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{millis:03d}"


def default_ui_config() -> Dict[str, Any]:
    # default UI configuration that mirrors server-side defaults
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


def print_json(data: Any) -> None:
    # prints structured JSON output for CLI readability
    print(json.dumps(data, indent=4, sort_keys=True))

# -----------------------------------------------------------------------------
# DeviceClient
# -----------------------------------------------------------------------------

class DeviceClient:
    """
    Thin HTTP wrapper around the simulated device API.

    This class intentionally mirrors what the browser does:
    - GET /customState.json for state
    - POST /api/relay/... for relay control
    - /api/login + /api/ui-config for setup flows
    """

    def __init__(
        self,
        base_url: str,
        timeout: Tuple[float, float] = (0.5, 2.0),
    ):
        self.base_url = base_url
        # base URL of the simulated device (e.g. http://localhost:8000)

        self.timeout = timeout
        # (connect timeout, read timeout)

        self.session = requests.Session()
        # persistent session like a browser connection

    def close(self) -> None:
        # closes the HTTP session cleanly
        self.session.close()

    def _request(
        self,
        method: str,
        path: str,
        json: Any = None
    ) -> Optional[Dict[str, Any]]:
        """
        Internal helper for all HTTP requests.

        Handles:
        - URL construction
        - JSON body
        - HTTP error handling
        - JSON response parsing
        """
        url = _join(self.base_url, path)

        r = self.session.request(
            method,
            url,
            json=json,
            timeout=self.timeout,
        )

        if not r.ok:
            # surface server-side errors clearly
            text = ""
            try:
                text = r.text
            except Exception:
                pass
            raise requests.exceptions.HTTPError(
                f"{r.status_code} {r.reason}: {text}".strip()
            )

        # parse JSON only if server says it is JSON
        ct = (r.headers.get("content-type") or "").lower()
        if "application/json" in ct:
            return r.json()

        return None

    # -------------------------------------------------------------------------
    # Public API methods (mirror browser behavior)
    # -------------------------------------------------------------------------

    def get_custom_state(self) -> Dict[str, Any]:
        # fetches the full device snapshot (same as browser polling)
        data = self._request(
            "GET",
            "/customState.json?showUnits=1&showColors=1"
        )
        return data or {}

    def relay_on(self, n: int) -> Dict[str, Any]:
        # turns relay n ON
        return self._request("POST", f"/api/relay/{n}/on") or {}

    def relay_off(self, n: int) -> Dict[str, Any]:
        # turns relay n OFF
        return self._request("POST", f"/api/relay/{n}/off") or {}

    def relay_pulse(self, n: int, ms: int) -> Dict[str, Any]:
        # pulses relay n for ms milliseconds
        return self._request(
            "POST",
            f"/api/relay/{n}/pulse",
            json={"ms": int(ms)},
        ) or {}

    # -------------------------------------------------------------------------
    # Auth + setup configuration methods
    # -------------------------------------------------------------------------

    def get_session(self) -> Dict[str, Any]:
        # checks current auth status (cookie-backed session)
        return self._request("GET", "/api/session") or {}

    def login(self, username: str, password: str) -> Dict[str, Any]:
        # logs in and stores session cookie in this session
        return self._request(
            "POST",
            "/api/login",
            json={"username": username, "password": password},
        ) or {}

    def logout(self) -> Dict[str, Any]:
        # logs out and clears session cookie
        return self._request("POST", "/api/logout") or {}

    def get_credentials(self) -> Dict[str, Any]:
        # fetches current username (password is never returned)
        return self._request("GET", "/api/credentials") or {}

    def update_credentials(
        self,
        current_password: str,
        username: str,
        password: str,
    ) -> Dict[str, Any]:
        # updates credentials after verifying current password
        return self._request(
            "POST",
            "/api/credentials",
            json={
                "currentPassword": current_password,
                "username": username,
                "password": password,
            },
        ) or {}

    def reset_credentials(self) -> Dict[str, Any]:
        # resets credentials to admin/admin on the server
        return self._request("POST", "/api/credentials/reset") or {}

    def get_ui_config(self) -> Dict[str, Any]:
        # fetches UI configuration (public read)
        return self._request("GET", "/api/ui-config") or {}

    def set_ui_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        # saves UI configuration (requires auth)
        return self._request("POST", "/api/ui-config", json=config) or {}

# -----------------------------------------------------------------------------
# Console rendering helpers
# -----------------------------------------------------------------------------

def _get_bit(s: Dict[str, Any], key: str) -> str:
    # extracts a digital/relay bit ("1" or "0") from payload safely
    v = s.get(key)
    if v == "1":
        return "1"
    if v == "0":
        return "0"
    return "?"


def _print_state(s: Dict[str, Any]) -> None:
    """
    Prints a compact single-line summary of device state.

    This mirrors what the browser UI shows:
    - Relays
    - Digital inputs
    - VIN / Register / OneWire
    - Uptime
    """
    relays = [_get_bit(s, f"relay{i}") for i in range(1, 5)]
    dis = [_get_bit(s, f"digitalInput{i}") for i in range(1, 5)]

    vin, _ = parse_value_color(s.get("vinasdkfj"))
    reg1, _ = parse_value_color(s.get("register1"))
    ow1, _ = parse_value_color(s.get("oneWire1"))

    uptime_ms = s.get("uptimeMs", "")
    uptime_fmt = format_uptime(uptime_ms)

    print(
        "relays=[" + "".join(relays) + "] "
        "din=[" + "".join(dis) + "] "
        f"vin='{vin}' reg1='{reg1}' ow1='{ow1}' "
        f"uptime={uptime_fmt}"
    )

# -----------------------------------------------------------------------------
# main() - CLI entrypoint
# -----------------------------------------------------------------------------

def main() -> int:
    # top-level argument parser
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://localhost:8000")
    p.add_argument("--connect-timeout", type=float, default=0.5)
    p.add_argument("--read-timeout", type=float, default=2.0)
    p.add_argument("--auth-user", help="Username for commands that require login")
    p.add_argument("--auth-pass", help="Password for commands that require login")

    sub = p.add_subparsers(dest="cmd", required=True)

    # read-only snapshot
    sub.add_parser("state")

    # relay control
    rp = sub.add_parser("relay")
    rp.add_argument("mode", choices=["on", "off", "pulse"])
    rp.add_argument("n", type=int, help="Relay number 1..4")
    rp.add_argument("--ms", type=int, default=250)

    # watch loop (continuous polling)
    wp = sub.add_parser("watch")
    wp.add_argument("--interval", type=float, default=0.5)
    wp.add_argument("--max-fails", type=int, default=3)

    # auth/session helpers
    sub.add_parser("session")

    lp = sub.add_parser("login")
    lp.add_argument("username")
    lp.add_argument("password")

    sub.add_parser("logout")

    # credential management
    cp = sub.add_parser("creds")
    cps = cp.add_subparsers(dest="action", required=True)
    cps.add_parser("show")
    cset = cps.add_parser("set")
    cset.add_argument("current_password")
    cset.add_argument("username")
    cset.add_argument("password")
    cps.add_parser("reset")

    # UI config management
    cfg = sub.add_parser("config")
    cfgs = cfg.add_subparsers(dest="action", required=True)
    cfgs.add_parser("show")
    cfgset = cfgs.add_parser("set")
    cfgset.add_argument("--json", help="Raw JSON string for full config")
    cfgset.add_argument("--file", help="Path to JSON file for full config")
    cfgs.add_parser("reset")

    args = p.parse_args()

    cli = DeviceClient(
        args.base,
        timeout=(args.connect_timeout, args.read_timeout),
    )

    try:
        def ensure_auth() -> bool:
            # ensures a logged-in session for protected endpoints
            try:
                status = cli.get_session()
                if status.get("authenticated"):
                    return True
            except Exception as e:
                print(f"ERROR: {format_req_err(e)}")
                return False

            if args.auth_user and args.auth_pass:
                try:
                    cli.login(args.auth_user, args.auth_pass)
                    return True
                except Exception as e:
                    print(f"ERROR: {format_req_err(e)}")
                    return False

            print("ERROR: login required (use login command or --auth-user/--auth-pass).")
            return False

        def load_config_payload() -> Dict[str, Any]:
            # loads JSON config from CLI arguments
            if args.json:
                return json.loads(args.json)
            if args.file:
                with open(args.file, "r", encoding="utf-8") as fh:
                    return json.load(fh)
            raise ValueError("config set requires --json or --file")

        if args.cmd == "state":
            _print_state(cli.get_custom_state())

        elif args.cmd == "relay":
            n = args.n
            if n < 1 or n > 4:
                print("ERROR: relay number must be 1..4")
                return 2

            if args.mode == "on":
                cli.relay_on(n)
            elif args.mode == "off":
                cli.relay_off(n)
            else:
                cli.relay_pulse(n, args.ms)

            _print_state(cli.get_custom_state())

        elif args.cmd == "watch":
            fails = 0
            while True:
                try:
                    _print_state(cli.get_custom_state())
                    fails = 0
                except Exception as e:
                    fails += 1
                    print(f"DISCONNECTED: {format_req_err(e)} (fails={fails})")
                    if args.max_fails > 0 and fails >= args.max_fails:
                        return 2
                time.sleep(max(0.05, args.interval))

        elif args.cmd == "session":
            print_json(cli.get_session())

        elif args.cmd == "login":
            cli.login(args.username, args.password)
            print("OK: logged in")

        elif args.cmd == "logout":
            cli.logout()
            print("OK: logged out")

        elif args.cmd == "creds":
            if not ensure_auth():
                return 2

            if args.action == "show":
                print_json(cli.get_credentials())
            elif args.action == "set":
                cli.update_credentials(args.current_password, args.username, args.password)
                print("OK: credentials updated")
            elif args.action == "reset":
                print_json(cli.reset_credentials())

        elif args.cmd == "config":
            if args.action == "show":
                print_json(cli.get_ui_config())
            elif args.action == "set":
                if not ensure_auth():
                    return 2
                cfg = load_config_payload()
                cli.set_ui_config(cfg)
                print("OK: config saved")
            elif args.action == "reset":
                if not ensure_auth():
                    return 2
                cli.set_ui_config(default_ui_config())
                print("OK: config reset to defaults")

        return 0

    finally:
        cli.close()


# -----------------------------------------------------------------------------
# Script entrypoint
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    raise SystemExit(main())
