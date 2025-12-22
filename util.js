// websrc_cbw/util.js

export function $(sel, root = document) {                                                // select one element
    return root.querySelector(sel);                                                      // return first match or null
}                                                                                        // end $

export function $all(sel, root = document) {                                             // select multiple elements
    return Array.from(root.querySelectorAll(sel));                                       // convert NodeList into real array
}                                                                                        // end $all

export function setText(el, text) {                                                      // safely set visible text
    if (!el) return;                                                                     // ignore if element missing
    el.textContent = String(text ?? "");                                                 // set textContent only (no HTML injection)
}                                                                                        // end setText

export function setDisabled(el, disabled) {                                              // enable/disable a control
    if (!el) return;                                                                     // ignore if element missing
    el.disabled = !!disabled;                                                            // set boolean disabled property
}                                                                                        // end setDisabled

export function formatErr(e) {                                                           // convert unknown error types to string
    if (e instanceof Error) return e.message;                                            // prefer Error.message
    return String(e);                                                                    // fallback string conversion
}                                                                                        // end formatErr

export function escapeHtml(s) {                                                          // escape a string for safe HTML insertion
    const x = String(s ?? "");                                                           // coerce to string
    return x                                                                             // begin replacements
        .replaceAll("&", "&amp;")                                                        // escape &
        .replaceAll("<", "&lt;")                                                         // escape <
        .replaceAll(">", "&gt;")                                                         // escape >
        .replaceAll('"', "&quot;")                                                       // escape "
        .replaceAll("'", "&#39;");                                                       // escape '
}                                                                                        // end escapeHtml
