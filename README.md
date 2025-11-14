# 🩰 StepUnity — Platforma Społecznościowa dla Tancerzy

Nowoczesna pełnoprawna aplikacja webowa dla tancerzy, umożliwiająca tworzenie profili, dodawanie nagrań, udział w rankingach oraz wyzwaniach.  
Projekt wykonany jako **monorepo** z rozdzieleniem backendu i frontendu oraz pełnym systemem uwierzytelniania.

## 📁 Struktura Monorepo

```
dance-social/
│
├── apps/
│   ├── api/      → Backend (Express + TypeScript + Prisma)
│   └── web/      → Frontend (React + Vite + TypeScript)
│
├── packages/
│   └── shared/   → Wspólne typy i moduły (TS)
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## 📦 Technologie

### **Frontend**

- React + Vite + TypeScript
- Axios z interceptorami
- ReCAPTCHA v2
- Zaawansowana walidacja haseł (zxcvbn)
- Password strength overlay
- Modal weryfikacji email

### **Backend**

- Express + TypeScript
- Prisma ORM + PostgreSQL
- JWT Access Token + **Refresh Token Rotation**
- HttpOnly secure cookies
- Dwustopniowa rejestracja `/register-start` + `/register-verify`
- Weryfikacja emaili (Mailtrap/SMTP)
- Forgot/Reset password
- Pwned Passwords (HIBP)
- Limity prób logowania
- reCAPTCHA v2
- Skrypt cleanup tokenów

## 🔐 System Logowania i Rejestracji

### Dwustopniowa Rejestracja

1. `/auth/register-start` – walidacja, captcha, wysyłka kodu
2. `/auth/register-verify` – tworzenie użytkownika + tokeny

### Logowanie

- Blokady konta
- Refresh cookie + rotacja

### Reset Hasła

- `/forgot` – anonimowy komunikat
- `/reset` – walidacja + unieważnienie tokenów

### reCAPTCHA v2

- Rejestracja
- Resend
- Forgot password

## 🧹 Maintenance (Cleanup)

Skrypt:

```
apps/api/src/scripts/cleanupTokens.ts
```

Uruchamianie:

```
pnpm --filter @app/api cleanup:tokens
```

## ⚙️ Wymagania

Node 18+, pnpm 8+, PostgreSQL 14+

## 🚀 Instalacja

```bash
git clone https://github.com/w68368/dance-social.git
pnpm install
```

Dotenv w `apps/api/.env` (skrócone):

```
DATABASE_URL=...
JWT_SECRET=...
RECAPTCHA_SECRET=...
SMTP_HOST=...
```

## 🧰 Komendy

| Komenda        | Opis                |
| -------------- | ------------------- |
| pnpm dev:web   | frontend            |
| pnpm dev:api   | backend             |
| prisma:studio  | GUI bazy            |
| cleanup:tokens | czyszczenie tokenów |

## 🔌 API Endpoints

| Endpoint              | Metoda | Opis          |
| --------------------- | ------ | ------------- |
| /auth/register-start  | POST   | wysłanie kodu |
| /auth/register-verify | POST   | finalizacja   |
| /auth/login           | POST   | logowanie     |
| /auth/refresh         | POST   | refresh       |
| /auth/forgot          | POST   | reset link    |
| /auth/reset           | POST   | zmiana hasła  |
| /auth/me              | GET    | profil        |

## 👤 Autor

Anastasiya Bialkevich  
https://github.com/w68368
