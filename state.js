// websrc_cbw/state.js                                                                    // file header comment

export const state = {                                                                   // shared application state object
    pollMs: 1000,                                                                        // polling interval (ms), may be overridden by device minRecRefresh
    timerId: null,                                                                       // setInterval id for polling loop
    connected: false,                                                                    // whether last poll succeeded
    lastStatus: null,                                                                    // most recent /customState.json payload
    els: {},                                                                             // cached DOM elements
    config: null,                                                                        // public config used to build index UI (relays/dis/values + titles)
};                                                                                       // end state
