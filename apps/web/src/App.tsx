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
        // 1) Пытаемся восстановить сессию из refresh-cookie
        const { data } = await api.post("/auth/refresh");

        if (!alive) return;

        if (data?.ok && data?.accessToken) {
          // access — только в память
          setAccessToken(data.accessToken);

          // 2) Подтягиваем профиль, чтобы Header/ProtectedRoute знали юзера
          try {
            const meRes = await api.get("/auth/me");
            if (meRes?.data?.ok && meRes?.data?.user) {
              setUser(meRes.data.user); // публичные поля в localStorage
            } else {
              // если /auth/me вернуло что-то странное — считаем, что не залогинен
              clearAccessToken();
              clearAuth();
            }
          } catch {
            // ошибка при /auth/me → тоже вычищаем авторизацию
            clearAccessToken();
            clearAuth();
          }
        } else {
          // refresh вернулся без accessToken → невалидная сессия
          clearAccessToken();
          clearAuth();
        }
      } catch {
        // ❌ /auth/refresh упал (401 / нет куки / ошибка сети) → считаем гостем
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

  // Пока проверяем сессию — ничего не рендерим, чтобы не было мигания.
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
