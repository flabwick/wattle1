import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { initRegistries } from "./registries/init.js";
import "./styles/global.css";

initRegistries();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
