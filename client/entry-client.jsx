import React from "react";
import ReactDOM from "react-dom/client";
// Console filtering removed - all logs now visible
import AppRouter from "./components/AppRouter";
import "./base.css";

ReactDOM.hydrateRoot(
  document.getElementById("root"),
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
