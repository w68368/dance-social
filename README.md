# 🩰 StepUnity — Platforma Społecznościowa dla Tancerzy

**StepUnity** to nowoczesna aplikacja webowa stworzona dla tancerzy z różnych miast, pozwalająca tworzyć profile, dodawać nagrania, brać udział w rankingach oraz wyzwaniach tanecznych.

Projekt został wykonany jako **monorepo** z wykorzystaniem pnpm workspaces, React, Express, Prisma oraz PostgreSQL.

---

## 📦 Struktura Monorepo

dance-social/
│
├── apps/
│ ├── api/ → Backend (Express + TypeScript)
│ └── web/ → Frontend (React + Vite + TypeScript)
│
├── packages/
│ └── shared/ → Wspólne typy oraz moduły
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json

---

## ✅ Wymagania

Przed instalacją upewnij się, że zainstalowano:

| Narzędzie | Wersja | Sprawdzenie |
|----------|--------|-------------|
| **Node.js** | 18+ | `node -v` |
| **pnpm** | 8+ | `pnpm -v` |
| **PostgreSQL** | 14+ | `psql --version` |
| **Git** | 2.4+ | `git --version` |

Rekomendowany edytor: **Visual Studio Code**

---

# 🚀 Instalacja na nowym komputerze

## 1️⃣ Sklonuj repozytorium

git clone https://github.com/w68368/dance-social.git
cd dance-social

## 2️⃣ Zainstaluj zależności

pnpm install

## 3️⃣ Skonfiguruj zmienne środowiskowe

cd apps/api

Utwórz plik .env:

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dance_social?schema=public"
PORT=3000
JWT_SECRET="stepunity_secret_key"

## 4️⃣ Uruchom bazę danych PostgreSQL

✅ Wariant A — Docker (zalecany)
W katalogu głównym projektu:
docker-compose up -d

✅ Wariant B — lokalna instalacja PostgreSQL
psql -U postgres
CREATE DATABASE dance_social;

## 5️⃣ Migracje Prisma

pnpm --filter @app/api prisma:generate
pnpm --filter @app/api prisma:migrate

## 6️⃣ Otwórz bazę graficznie (Prisma Studio)

pnpm --filter @app/api prisma:studio

Dostępne pod adresem:
👉 http://localhost:5555

## 7️⃣ Uruchamianie aplikacji

▶️ Backend (API)
pnpm dev:api

API będzie dostępne pod:
👉 http://localhost:3000

💻 Frontend (React)
pnpm dev:web

Frontend otworzy się pod:
👉 http://localhost:5173

## ⚙️ Najważniejsze komendy

| Komenda                                | Działanie                     |
| -------------------------------------- | ----------------------------- |
| `pnpm install`                         | Instalacja zależności         |
| `pnpm dev:web`                         | Uruchomienie frontendu        |
| `pnpm dev:api`                         | Uruchomienie backendu         |
| `pnpm build`                           | Budowanie wszystkich pakietów |
| `pnpm lint`                            | Sprawdzanie błędów w kodzie   |
| `pnpm --filter @app/api prisma:studio` | Podgląd bazy danych           |
| `docker-compose up -d`                 | Uruchomienie PostgreSQL       |

## 🗂 Struktura danych (Prisma)

Przykładowy model użytkownika:
model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  username     String   @unique
  passwordHash String
  gender       String?
  avatarUrl    String?
  createdAt    DateTime @default(now())
}

## 🔌 API Endpoints

| Endpoint             | Metoda | Opis                        |
| -------------------- | ------ | --------------------------- |
| `/api/auth/register` | POST   | Rejestracja                 |
| `/api/auth/login`    | POST   | Logowanie (JWT)             |
| `/api/auth/me`       | GET    | Pobranie danych użytkownika |
| `/api/users`         | GET    | Lista użytkowników          |

## 🔒 Autoryzacja (JWT)

Po poprawnym logowaniu token JWT jest zapisywany w localStorage.
Każde zapytanie API automatycznie dodaje nagłówek:

Authorization: Bearer <token>

## 🧰 Komendy Git do wysyłania zmian

git status
git add .
git commit -m "Aktualizacja stylów, dropdown, konfiguracji i dokumentacji README"
git push

## 👨‍💻 Autor
Anastasiya Bialkevich
GitHub: https://github.com/w68368
