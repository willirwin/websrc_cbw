// websrc_cbw_beta/util.js

// utility helper functions for DOM manipulation and error formatting

export function $(sel, root = document) {
    // exports a helper function "$" to select a single DOM element
    return root.querySelector(sel);
    // returns first element matching selector "sel" within "root" (default is document)
}
export function $all(sel, root = document) {
    // exports a helper function "$all" to select multiple DOM elements
    return Array.from(root.querySelectorAll(sel));
    // makes a real array from Nodelist of all elements matching selector "sel" within "root" (default is document)
}
export function setText(el, text) {
    // exports "setText" to safely display text
    if (!el) return;
    // if element is null/undefined, do nothing
    el.textContent = String(text ?? "");
    // sets visible text only
}
export function setDisabled(el, disabled) {
    // exports a helper function "setDisabled" to enable/disable a DOM element
    if (!el) return;
    // if element is null/undefined, do nothing
    el.disabled = !!disabled; // force boolean
}
export function formatErr(e) {
    // exports a helper function "formatErr" to turn random throws into strings
    if (e instanceof Error) return e.message;
    // if "e" is an Error object, return its message
    return String(e);
    // otherwise, convert "e" to a string and return it
}
