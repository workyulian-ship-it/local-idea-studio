import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installDevMock } from "./devMock";

if (import.meta.env.DEV && !window.lumen) installDevMock();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
