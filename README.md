# ✨ StepUnity — Premium Tech / Startup Edition  
Platforma Społecznościowa dla Tancerzy

<p align="center">
  <img src="https://img.shields.io/badge/Monorepo-pnpm%20workspaces-7b3fe4?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-6f42c1?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-ffca28?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL-31648c?style=for-the-badge" />
</p>

---

# 🚀 Vision

**StepUnity** to profesjonalna platforma społecznościowa nowej generacji, zaprojektowana dla tancerzy.  
Łączy szybki frontend, bezpieczny backend oraz zaawansowany system tworzenia treści — w stylu nowoczesnych aplikacji startupowych.

---

# 🌌 Highlights

### 🟣 Super-fast Frontend (React + Vite + TS)
- zaawansowany kreator postów **AddPost Wizard** (3 kroki),
- automatyczne hashtagi + rozpoznawanie @mentions,
- dynamiczny preview wideo/zdjęcia,
- modalny system komentarzy z threadingiem,
- system lajków i powiadomień,
- profil użytkownika ala Instagram (grid + modal feed),
- obliczanie statystyk followers/following.

### 🟡 Secure Backend (Express + Prisma)
- JWT access/refresh + rotacja tokenów,
- blokada konta i anty-bot,
- reCAPTCHA v2,
- reset hasła + email verification,
- wykrywanie disposable email,
- HIBP + zxcvbn password strength,
- pełny system postów, komentarzy, followów.

### 🔵 Cloud-ready Architecture
- monorepo pnpm,
- Docker-ready,
- czysty podział: `apps/api`, `apps/web`, `packages/shared`,
- automatyczne migracje Prisma, seed, studio.

---

# 🧩 Systemy dostępne w projekcie

## 🔐 System Autoryzacji i Bezpieczeństwa
- rejestracja z kodem e-mail (6 cyfr),  
- logowanie + refresh token rotation,  
- blokada konta przy złych próbach,  
- reset hasła e-mail,  
- sprawdzanie haseł w wyciekach (HIBP),  
- zxcvbn analiza siły hasła,  
- reCAPTCHA v2,  
- HttpOnly Secure Cookies.

---

## 📸 System Postów (Wideo & Zdjęcia)
- upload plików (lokalnie / Cloudinary),  
- generowanie miniatur,  
- opisy, hashtagi, mentions,  
- limit rozmiaru, walidacja,  
- paginacja feedu,  
- pełny AddPost Wizard z live preview.

---

## 💬 System Komentarzy
- komentarze pierwszego poziomu,  
- odpowiedzi (threading),  
- modalny interfejs z przewijaniem,  
- polubienia komentarzy,  
- przypinanie komentarza przez autora posta.

---

## ❤️ System Lajków
- lajkowanie postów,  
- lajkowanie komentarzy,  
- synchronizacja stanu likedByMe,  
- automatyczne aktualizowanie liczników.

---

## 👤 System Profili
- slug użytkownika,  
- własny grid postów,  
- modalny podgląd posta,  
- statystyki followów,  
- własny avatar + upload + kompresja,  
- edycja profilu (planowane w kolejnych iteracjach).

---

## 🔔 System Follow
- follow / unfollow,  
- liczniki followers / following,  
- pobieranie statystyk profilu,  
- filtrowanie feedu (planowane).

---

## 🧵 System Feed
- pobieranie postów stronami,  
- sortowanie chrono,  
- stan ładowania i infinite scroll (frontend-ready),  
- lekkie API do strumieniowania postów.

---

# 🏛 Architektura Monorepo

```
dance-social/
│
├── apps/
│   ├── api/        → Backend (Express, Prisma, TS)
│   └── web/        → Frontend (React, Vite, TS)
│
├── packages/
│   └── shared/     → Common types
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

---

# ⚡ AddPost Wizard — System Tworzenia Postów

### 🧩 **Krok 1 – Upload**
- obsługa wideo i zdjęć  
- podgląd media preview  
- walidacja rozmiaru i formatu  

### ✏️ **Krok 2 – Edycja**
- opis, podpis, tagi, hashtagi  
- @mention system (autodetekcja)  
- kolorowanie tagów w czasie rzeczywistym  
- bezpieczne czyszczenie inputu  

### 🚀 **Krok 3 – Publikacja**
- upload miniatury  
- progress bar  
- obsługa błędów i retry  

---

# 🔐 Security Stack

| Feature | Status |
|--------|--------|
| Email verification (6-digit code) | ✅ |
| reCAPTCHA v2 | ✅ |
| Reset password (email link) | ✅ |
| Disposable email detection | ✅ |
| HIBP leaked password check | ✅ |
| zxcvbn password strength | ✅ |
| Account lockout | ✅ |
| HttpOnly Secure Refresh Cookies | ✅ |
| Refresh Token Rotation | ✅ |

---

# 🗄 Endpointy API Premium (2025)

## 🔑 Auth
- `POST /auth/register-start`
- `POST /auth/register-verify`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `POST /auth/forgot`
- `POST /auth/reset`
- `GET /auth/me`

## 📝 Posty
- `GET /posts`
- `POST /posts`
- `GET /posts/:id`
- `POST /posts/:id/like`
- `GET /posts/:id/comments`
- `POST /posts/:id/comments`

## 👤 Użytkownicy
- `GET /users/:slug`
- `POST /users/:id/follow`
- `GET /users/:id/stats`

---

# 🛠 Instalacja (Premium Setup)

### 1️⃣ Clone
```
git clone https://github.com/w68368/dance-social.git
cd dance-social
```

### 2️⃣ Install
```
pnpm install
```

### 3️⃣ Start Database
```
docker-compose up -d
```

### 4️⃣ ENV (API)
```
cd apps/api
```

### 5️⃣ Migracje Prisma
```
pnpm --filter @app/api prisma:generate
pnpm --filter @app/api prisma:migrate
```

### 6️⃣ Dev Servers
Backend:
```
pnpm dev:api
```

Frontend:
```
pnpm dev:web
```

---

# 🧑‍💻 Autor
**Anastasiya Bialkevich**  
GitHub: https://github.com/w68368
