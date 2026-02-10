
Inspectra v1 – Local Starter Repo (Windows Compatible)

This is a starter scaffold to run Inspectra locally.

Requirements:
- Windows
- Docker Desktop
- Node.js LTS

Quick start:
cd server
copy .env.example .env
docker compose up -d
npm install
npm run migrate
npm run seed
npm run dev

Open http://localhost:3000
