import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import Header from "./components/Header";
import AppRoutes from "./routes/AppRoutes";
import { api } from "./api";
import { setAccessToken, clearAccessToken } from "./lib/accessToken";
import { setUser, clearAuth } from "./lib/auth";
import "./App.css";

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 1) Attempt to restore the session using the refresh cookie
        const { data } = await api.post("/auth/refresh");

        if (!alive) return;

        if (data?.ok && data?.accessToken) {
          // Save access token only in memory
          setAccessToken(data.accessToken);

          // 2) Fetch user profile so Header / ProtectedRoute know the logged-in user
          try {
            const meRes = await api.get("/auth/me");
            if (meRes?.data?.ok && meRes?.data?.user) {
              setUser(meRes.data.user); // public fields saved to localStorage
            } else {
              // If /auth/me returned something unexpected → treat as not logged in
              clearAccessToken();
              clearAuth();
            }
          } catch {
            // Error during /auth/me → clear auth session as well
            clearAccessToken();
            clearAuth();
          }
        } else {
          // refresh returned without an accessToken → invalid session
          clearAccessToken();
          clearAuth();
        }
      } catch {
        // /auth/refresh failed (401 / missing cookie / network error) → treat as guest
        clearAccessToken();
        clearAuth();
      } finally {
        if (alive) {
          setReady(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // While the session is being checked — render nothing to avoid flickering
  if (!ready) return null;

  return (
    <BrowserRouter>
      <Header />
      <div className="container">
        <AppRoutes />
      </div>
    </BrowserRouter>
  );
}
