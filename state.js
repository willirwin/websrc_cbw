// websrc_cbw/state.js

// shared application state for UI + polling coordination

export const state = {
    // polling interval in milliseconds (may be overridden by minRecRefresh)
    pollMs: 1000,

    // will hold the ID of the timer that triggers refreshStatus()
    timerId: null,

    // connection status (last poll succeeded)
    connected: false,

    // last JSON payload received from /customState.json
    lastStatus: null,

    // cached DOM elements (populated by ui.js)
    els: {},
};
