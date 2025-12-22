// websrc_cbw/main.js

import { wireEvents, refreshStatus, buildIndexUiFromConfig } from "./ui.js";             // import UI functions
import { state } from "./state.js";                                                      // import shared state
import { getPublicConfig } from "./api.js";                                              // import config fetcher

async function boot() {                                                                  // app startup function
    const cfg = await getPublicConfig();                                                 // fetch public config from server
    state.config = cfg;                                                                  // store config in shared state

    document.title = cfg.pageTitle || "Device";                                          // set tab title to configured page title
    buildIndexUiFromConfig(cfg);                                                         // build index DOM based on relays/dis/values

    wireEvents();                                                                        // wire click handlers + cache DOM
    await refreshStatus();                                                               // do one initial status poll and render

    state.timerId = setInterval(refreshStatus, state.pollMs);                            // start periodic polling loop
}                                                     

boot().catch((e) => {                                                                    // run boot and log startup failures
    console.error(e);                                                                    // print error to console
});                                                                
