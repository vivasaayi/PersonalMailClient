import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { registerLicense } from "@syncfusion/ej2-base";
import App from "./App";
import { AppThemeProvider } from "./theme";
import { AccountsProvider } from "./stores/accountsStore";
import { NotificationsProvider } from "./stores/notifications";
import "@syncfusion/ej2-base/styles/material.css";
import "@syncfusion/ej2-buttons/styles/material.css";
import "@syncfusion/ej2-inputs/styles/material.css";
import "@syncfusion/ej2-popups/styles/material.css";
import "@syncfusion/ej2-lists/styles/material.css";
import "@syncfusion/ej2-dropdowns/styles/material.css";
import "@syncfusion/ej2-react-grids/styles/material.css";
import "./index.css";
const syncfusionLicenseKey = import.meta.env.VITE_SYNCFUSION_LICENSE;
if (syncfusionLicenseKey) {
    registerLicense(syncfusionLicenseKey);
}
else if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn("Syncfusion license key not found. Set VITE_SYNCFUSION_LICENSE for production builds.");
}
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(AppThemeProvider, { children: _jsx(NotificationsProvider, { children: _jsx(AccountsProvider, { children: _jsx(App, {}) }) }) }) }));
