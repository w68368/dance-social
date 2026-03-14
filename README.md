# StepUnity -- Social Platform for Dancers

## Project Description

StepUnity is a social web platform designed for individual dancers and
dance teams. The application allows users to publish choreography
videos, interact with other dancers, participate in challenges and track
activity through rankings.

The goal of the system is to create an online environment that supports
the development of dancers, promotes creativity and enables interaction
between members of the dance community.

The project was developed as part of a diploma thesis.

------------------------------------------------------------------------

# Main Features

The platform provides the following functionalities:

• User registration and authentication\
• User profiles with avatars and personal information\
• Publishing choreography videos\
• Comments and reactions under posts\
• Follow system between users\
• Dance challenges\
• Activity ranking\
• Private chats between users\
• Notifications system

The system combines social media mechanisms with elements of
gamification to increase user engagement.

------------------------------------------------------------------------

# Technologies Used

## Backend

-   Node.js
-   Express
-   TypeScript
-   Prisma ORM
-   PostgreSQL
-   JWT Authentication
-   Cloudinary (media storage)

## Frontend

-   React
-   Vite
-   TypeScript
-   React Router
-   Axios

## Other Tools

-   Prisma Migrations
-   ESLint
-   dotenv

------------------------------------------------------------------------

# Project Architecture

The application uses a **client--server architecture**.

Frontend (React SPA) communicates with the backend through a REST API.

Frontend (React + Vite)\
↓ REST API\
Backend (Node.js + Express)\
↓\
PostgreSQL Database

------------------------------------------------------------------------

# Project Structure

apps\
│\
├── api \# Backend application\
│ ├── prisma \# Prisma schema and migrations\
│ ├── src\
│ │ ├── routes \# API routes\
│ │ ├── middlewares\
│ │ ├── lib \# helper modules (auth, mailer, prisma etc.)\
│ │ └── scripts\
│\
└── web \# Frontend application\
├── public\
├── src\
│ ├── components\
│ ├── pages\
│ ├── routes\
│ ├── hooks\
│ └── styles

------------------------------------------------------------------------

# Requirements

Before running the project make sure the following software is
installed:

-   Node.js (version 18 or newer)
-   npm
-   PostgreSQL
-   Git

------------------------------------------------------------------------

# Installation

Clone the repository:

git clone https://github.com/your-repository/stepunity.git

Go to the project folder:

cd stepunity

------------------------------------------------------------------------

# Backend Setup

Navigate to backend directory:

cd apps/api

Install dependencies:

npm install

Create `.env` file:

DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/stepunity"
JWT_SECRET="your_secret_key"

Run database migrations:

npx prisma migrate dev

Start the backend server:

npm run dev

Backend server:

http://localhost:3000

------------------------------------------------------------------------

# Frontend Setup

Open a new terminal and go to frontend folder:

cd apps/web

Install dependencies:

npm install

Create `.env` file:

VITE_API_URL=http://localhost:3000

Start the frontend:

npm run dev

Frontend:

http://localhost:5173

------------------------------------------------------------------------

# Running the Application

1.  Start the backend server
2.  Start the frontend application
3.  Open the browser:

http://localhost:5173

You can now register a new user and start using the platform.

------------------------------------------------------------------------

# Example User Flow

Typical user interaction:

1.  User registers an account
2.  Logs into the platform
3.  Creates a profile
4.  Publishes choreography videos
5.  Interacts with other users through comments and reactions
6.  Participates in dance challenges
7.  Earns points in the ranking system

------------------------------------------------------------------------

# Future Improvements

Possible directions for future development:

-   Mobile application
-   AI-based choreography recommendations
-   Advanced ranking algorithms
-   Video editing tools
-   Integration with dance schools and instructors

------------------------------------------------------------------------

# Author

Mykhailo Mamin\
Computer Science -- Software Engineering

Diploma Project\
WSIiZ University
