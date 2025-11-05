import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import Header from "./components/Header";
import AppRoutes from "./routes/AppRoutes";
import { api } from "./api";
import { setAccessToken } from "./lib/accessToken";
import { setUser } from "./lib/auth";
import "./App.css";

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    // 1) Пытаемся восстановить сессию из refresh-cookie
    api
      .post("/auth/refresh")
      .then(async ({ data }) => {
        if (!alive) return;

        if (data?.ok && data?.accessToken) {
          // access — только в память
          setAccessToken(data.accessToken);

          // 2) Подтянем профиль, чтобы Header/ProtectedRoute сразу знали юзера
          try {
            const me = await api.get("/auth/me");
            if (me?.data?.ok && me?.data?.user) {
              setUser(me.data.user); // юзера — в localStorage (публичные поля)
            }
          } catch {
            // молча игнорим — пользователь может быть гость
          }
        }
      })
      .catch(() => {
        // нет активной refresh-куки — просто гость
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  // Можно рендерить лоадер/скелетон. Чтобы не мигало — вернём null.
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
