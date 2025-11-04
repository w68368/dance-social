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
