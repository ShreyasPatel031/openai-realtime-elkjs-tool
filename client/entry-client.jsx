import React from "react";
import ReactDOM from "react-dom/client";
// Silence console noise but whitelist required protocol logs
(() => {
  if (typeof window !== 'undefined') {
    const original = { ...console };
    const allow = (args) => {
      try {
        const first = args && args[0];
        if (typeof first !== 'string') return false;
        return (
          first.startsWith('REQ /v1/responses') ||
          first.startsWith('EVENT response.') ||
          first.startsWith('FOLLOWUP SEND')
        );
      } catch { return false; }
    };
    const wrapper = (method) => (...args) => {
      if (window.__SHOW_LOGS__ === true || allow(args)) {
        return original[method]?.apply(original, args);
      }
      // no-op otherwise
    };
    try {
      console.log = wrapper('log');
      console.info = wrapper('info');
      console.debug = wrapper('debug');
      console.warn = wrapper('warn');
      console.trace = wrapper('trace');
      // keep errors visible
      console.error = original.error?.bind(original);
    } catch {}
  }
})();
import App from "./components/App";
import "./base.css";

ReactDOM.hydrateRoot(
  document.getElementById("root"),
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
