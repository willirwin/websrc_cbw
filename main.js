// websrc_cbw_beta/main.js

// application entrypoint

import { wireEvents, refreshStatus } from "./ui.js";
// load wireEvents and refreshStatus from ui.js
import { state } from "./state.js";
// load state from state.js

wireEvents();
// calls wireEvents to set up event listeners

refreshStatus();
// calls refreshStatus to update the UI initially

// starts periodic refresh; ui.js may adjust this interval based on minRecRefresh
state.timerId = setInterval(refreshStatus, state.pollMs);
// sets up a timer to call refreshStatus periodically based on pollMs in state
