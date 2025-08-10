import React from "react";
import ReactDOM from "react-dom/client";
// Console filtering removed - all logs now visible
import App from "./components/App";
import "./base.css";

ReactDOM.hydrateRoot(
  document.getElementById("root"),
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
