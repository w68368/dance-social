# StepUnity - Społecznościowa Platforma dla Tancerzy

## Opis projektu

StepUnity to aplikacja internetowa typu social media przeznaczona dla
indywidualnych tancerzy oraz zespołów tanecznych. System umożliwia
publikowanie nagrań choreografii, interakcję z innymi użytkownikami oraz
udział w wyzwaniach tanecznych i rankingach aktywności.

Celem projektu jest stworzenie środowiska online wspierającego rozwój
tancerzy, umożliwiającego prezentację umiejętności oraz budowanie
społeczności tanecznej.

Projekt został zrealizowany w ramach pracy dyplomowej.

------------------------------------------------------------------------

# Główne funkcjonalności

Platforma oferuje między innymi:

• rejestrację i logowanie użytkowników\
• profile użytkowników z awatarami i informacjami\
• publikowanie nagrań wideo choreografii\
• komentarze i reakcje pod postami\
• system obserwowania użytkowników\
• wyzwania taneczne (dance challenges)\
• ranking aktywności użytkowników\
• prywatny czat między użytkownikami\
• system powiadomień

System łączy mechanizmy typowe dla mediów społecznościowych z elementami
grywalizacji zwiększającymi zaangażowanie użytkowników.

------------------------------------------------------------------------

# Wykorzystane technologie

## Backend

-   Node.js
-   Express
-   TypeScript
-   Prisma ORM
-   PostgreSQL
-   JWT (autoryzacja użytkowników)
-   Cloudinary (przechowywanie multimediów)

## Frontend

-   React
-   Vite
-   TypeScript
-   React Router
-   Axios

## Inne narzędzia

-   Prisma Migrations
-   ESLint
-   dotenv

------------------------------------------------------------------------

# Architektura systemu

Aplikacja została zaprojektowana w architekturze **klient--serwer**.

Frontend (aplikacja SPA w React) komunikuje się z backendem za pomocą
interfejsu REST API.

Frontend (React + Vite) ↓ REST API Backend (Node.js + Express) ↓ Baza
danych PostgreSQL

------------------------------------------------------------------------

# Struktura projektu

apps

├── api \# aplikacja backendowa\
│ ├── prisma \# schemat bazy danych i migracje\
│ ├── src\
│ │ ├── routes \# trasy API\
│ │ ├── middlewares\
│ │ ├── lib \# moduły pomocnicze (auth, mailer, prisma itd.)\
│ │ └── scripts\
│ └── web \# aplikacja frontendowa\
├── public\
├── src\
│ ├── components\
│ ├── pages\
│ ├── routes\
│ ├── hooks\
│ └── styles

------------------------------------------------------------------------

# Wymagania

Przed uruchomieniem projektu należy zainstalować:

-   Node.js (wersja 18 lub nowsza)
-   npm
-   PostgreSQL
-   Git

------------------------------------------------------------------------

# Instalacja projektu

Sklonuj repozytorium:

git clone https://github.com/your-repository/stepunity.git

Przejdź do folderu projektu:

cd stepunity

------------------------------------------------------------------------

# Konfiguracja backendu

Przejdź do katalogu backendu:

cd apps/api

Zainstaluj zależności:

npm install

Utwórz plik `.env`:

DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/stepunity"
JWT_SECRET="your_secret_key"

Wykonaj migracje bazy danych:

npx prisma migrate dev

Uruchom serwer backendowy:

pnpm dev:api

Backend będzie dostępny pod adresem:

http://localhost:3000

------------------------------------------------------------------------

# Konfiguracja frontendu

W nowym terminalu przejdź do katalogu frontendu:

cd apps/web

Zainstaluj zależności:

npm install

Utwórz plik `.env`:

VITE_API_URL=http://localhost:3000

Uruchom aplikację frontendową:

pnpm dev:web

Frontend będzie dostępny pod adresem:

http://localhost:5173

------------------------------------------------------------------------

# Uruchomienie aplikacji

1.  Uruchom backend
2.  Uruchom frontend
3.  Otwórz przeglądarkę:

http://localhost:5173

Po uruchomieniu można zarejestrować użytkownika i rozpocząć korzystanie
z platformy.

------------------------------------------------------------------------

# Przykładowy scenariusz użytkowania

1.  Użytkownik tworzy konto
2.  Loguje się do systemu
3.  Uzupełnia swój profil
4.  Publikuje nagrania choreografii
5.  Komentuje i ocenia posty innych użytkowników
6.  Bierze udział w wyzwaniach tanecznych
7.  Zdobywa punkty w rankingach aktywności

------------------------------------------------------------------------

# Możliwe kierunki rozwoju

Potencjalne rozszerzenia systemu:

-   aplikacja mobilna
-   rekomendacje choreografii oparte na AI
-   bardziej zaawansowany system rankingów
-   narzędzia do edycji wideo
-   integracja ze szkołami tańca

------------------------------------------------------------------------

# Autor

Anastasia Bialkevich\
68368


