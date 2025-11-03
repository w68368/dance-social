import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main style={{ padding: "40px", textAlign: "center" }}>
      <h1 style={{ fontSize: "48px", marginBottom: "10px" }}>404</h1>
      <h2 style={{ marginBottom: "20px" }}>Page not found</h2>
      <p style={{ marginBottom: "30px", opacity: 0.8 }}>
        Страница, которую ты ищешь, не существует или была перемещена.
      </p>

      <Link
        to="/"
        style={{
          padding: "10px 18px",
          borderRadius: "10px",
          background: "#f6c449",
          fontWeight: "600",
          color: "#1f1a2e",
          textDecoration: "none",
        }}
      >
        ← На главную
      </Link>
    </main>
  );
}
