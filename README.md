# 🩰 StepUnity — Platforma Społecznościowa dla Tancerzy

**StepUnity** to nowoczesna aplikacja webowa zbudowana jako **monorepo** (pnpm workspaces).  
Zawiera kompletny backend (Express + Prisma + PostgreSQL), frontend (React + Vite + TS) oraz mocny system bezpieczeństwa:
- weryfikacja e-mail (kod 6 cyfr),
- refresh token rotation,
- reset hasła przez email,
- sprawdzanie haseł (HIBP + zxcvbn),
- reCAPTCHA v2,
- blokada konta,
- detekcja disposable email,
- upload avatarów.

Instrukcja zawiera pełne kroki do uruchomienia projektu **na nowym komputerze**, z Dockerem i migracjami Prisma.

---

# 📦 Struktura Monorepo

```
dance-social/
│
├── apps/
│   ├── api/      → Backend (Express + TS + Prisma)
│   └── web/      → Frontend (React + Vite + TS)
│
├── packages/
│   └── shared/   → Wspólne typy
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

---

# 🚀 Instalacja na nowym komputerze

## 1️⃣ Wymagane narzędzia

| Narzędzie | Wersja | Komenda |
|----------|--------|---------|
| Node.js | 18+ | `node -v` |
| pnpm | 8+ | `pnpm -v` |
| Docker Desktop | — | — |
| Git | 2.4+ | `git --version` |
| PostgreSQL | 14+ | `psql --version` |

---

## 2️⃣ Klonowanie repozytorium

```
git clone https://github.com/w68368/dance-social.git
cd dance-social
```

## 3️⃣ Instalacja zależności

```
pnpm install
```

---

# 🐳 4️⃣ Uruchomienie PostgreSQL przez Docker (zalecane)

W katalogu głównym:

```
docker-compose up -d
```

Sprawdzenie:

```
docker ps
```

Baza działa na:

```
localhost:5432
```

---

# ⚙️ 5️⃣ Plik .env (API)

Przejdź:

```
cd apps/api
```

Utwórz `.env`:

```
PORT=3000
NODE_ENV=development

APP_NAME="StepUnity"

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dance_social?schema=public"

JWT_SECRET="super-secret-access-key-change-me"
ACCESS_TOKEN_TTL="15m"

REFRESH_TOKEN_DAYS=30
COOKIE_DOMAIN=""
COOKIE_SECURE=false
COOKIE_SAMESITE="lax"

CLIENT_ORIGIN="http://localhost:5173"
FRONTEND_ORIGIN="http://localhost:5173"

SMTP_HOST="sandbox.smtp.mailtrap.io"
SMTP_PORT=2525
SMTP_USER="YOUR_MAILTRAP_USER"
SMTP_PASS="YOUR_MAILTRAP_PASS"
MAIL_FROM="StepUnity <no-reply@stepunity.local>"

UPLOAD_DIR="uploads"
MAX_UPLOAD_MB=10

EMAIL_CODE_TTL_MIN=10
EMAIL_MAX_ATTEMPTS=5

RESET_TOKEN_TTL_MIN=30

RECAPTCHA_SECRET_KEY="YOUR_RECAPTCHA_SECRET"
```

---

# 🔧 6️⃣ Migracje Prisma

W katalogu głównym projektu:

```
pnpm --filter @app/api prisma:generate
pnpm --filter @app/api prisma:migrate
```

Podgląd bazy:

```
pnpm --filter @app/api prisma:studio
```

👉 http://localhost:5555

---

# ▶️ 7️⃣ Uruchamianie aplikacji

## Backend:

```
pnpm dev:api
```

👉 http://localhost:3000

## Frontend:

```
pnpm dev:web
```

👉 http://localhost:5173

---

# 🔌 Kluczowe endpointy API

| Endpoint | Metoda | Opis |
|---------|--------|------|
| `/api/auth/register-start` | POST | Krok 1 rejestracji |
| `/api/auth/register-verify` | POST | Potwierdzenie kodu |
| `/api/auth/login` | POST | Logowanie |
| `/api/auth/refresh` | POST | Odświeżanie tokena |
| `/api/auth/logout` | POST | Wylogowanie |
| `/api/auth/logout-all` | POST | Wylogowanie ze wszystkich urządzeń |
| `/api/auth/forgot` | POST | Reset hasła (wysyłka email) |
| `/api/auth/reset` | POST | Ustawienie nowego hasła |
| `/api/auth/me` | GET | Dane aktualnego użytkownika |

---

# 🧪 System bezpieczeństwa (skrót)

✔ Email verification (6-cyfrowy kod)  
✔ reCAPTCHA v2  
✔ Blokada konta po błędach  
✔ Sprawdzanie haseł w wyciekach (HIBP)  
✔ zxcvbn – ocena siły hasła  
✔ Refresh token rotation (HttpOnly cookie)  
✔ Reset hasła  
✔ Detekcja disposable email  
✔ Upload avatarów  

---

# 🧰 Najważniejsze komendy pnpm

| Komenda | Co robi |
|--------|---------|
| `pnpm install` | Instalacja zależności |
| `pnpm dev:api` | Backend |
| `pnpm dev:web` | Frontend |
| `pnpm build` | Build monorepo |
| `pnpm --filter @app/api prisma:migrate` | Migracje |
| `pnpm --filter @app/api prisma:studio` | Podgląd bazy |

---

# 🧰 Komendy Git

```
git status
git add .
git commit -m "Updated README: full installation guide, Docker, Prisma"
git push
```

---

# 👨‍💻 Autor

**Anastasiya Bialkevich**  
GitHub: https://github.com/w68368
