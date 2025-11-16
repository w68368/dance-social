// apps/web/src/routes/ProtectedRoute.tsx
import { Outlet, useLocation, Link } from "react-router-dom";
import { getUser } from "../lib/auth";

export default function ProtectedRoute() {
  const user = getUser();
  const location = useLocation();

  if (!user) {
    const fullPath =
      location.pathname + location.search + (location.hash || "");
    const next = encodeURIComponent(fullPath || "/");
    return <NeedLoginScreen next={next} />;
  }

  return <Outlet />;
}

type NeedLoginScreenProps = {
  next: string;
};

function NeedLoginScreen({ next }: NeedLoginScreenProps) {
  return (
    <div className="auth-page">
      <div className="register-card" style={{ textAlign: "center" }}>
        <h2>Sign in required</h2>
        <p className="register-sub">
          To access this page, please sign in to your StepUnity account.
          <br />
          We will return you here right after login.
        </p>

        {/* Кнопка по центру, текст тоже по центру */}
        <Link
          to={`/login?next=${next}`}
          className="su-btn su-btn-primary"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            maxWidth: "260px",
            margin: "22px auto 10px",
            textAlign: "center",
          }}
        >
          Go to Login
        </Link>

        <p className="auth-muted" style={{ marginTop: 16, fontSize: 14 }}>
          Don’t have an account yet?{" "}
          <Link to="/register" className="auth-link-blue">
            Create one here
          </Link>
        </p>
      </div>
    </div>
  );
}
