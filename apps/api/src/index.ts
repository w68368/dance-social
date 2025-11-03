import express from "express";

const app = express();
app.use(express.json());

// Пробный маршрут
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "api", version: "0.1.0" });
});

// Старт сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
