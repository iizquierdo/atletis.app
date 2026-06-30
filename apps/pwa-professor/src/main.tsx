import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { SplashScreen } from "./components/SplashScreen";
import { hydrateThemeFromStorage } from "./lib/theme";
import { applyFavicon, readBrandingFromStorage } from "./lib/branding";

hydrateThemeFromStorage();
applyFavicon(readBrandingFromStorage().faviconUrl);

const Root = () => {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
