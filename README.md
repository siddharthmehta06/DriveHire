# DriveHire

DriveHire is a full-stack vehicle rental and ride-sharing platform featuring secure authentication, vehicle verification, carpool ride posting/searching, booking, and real-time live tracking. Built with a scalable architecture, Express, React, PostgreSQL, Prisma ORM, and Docker.

---

## Quick Start (Recommended via Docker)

### 1. Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose installed and running.
- [Node.js](https://nodejs.org/) (v20+ recommended if developing locally).

### 2. Start all services
From the project root directory:

```bash
docker compose up -d --build
```

This starts:
- **Client (Frontend)**: React + Vite app
- **API (Backend)**: Node.js Express server + Socket.io
- **Postgres**: PostgreSQL database on port `5433`
- **MailHog**: Local SMTP and email testing server

### 3. Seed Sample Data
Once the containers are up and healthy, populate the database with test vehicles and carpool rides:

```bash
docker compose exec -T api npm run db:seed
```

### 4. Access URLs
- **Web Application**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000](http://localhost:4000)
- **MailHog Inbox (Mock Emails)**: [http://localhost:8025](http://localhost:8025)

---

## Helpful Docker Commands

- **View Live Logs**:
  ```bash
  docker compose logs -f
  ```
- **View Specific Service Logs**:
  ```bash
  docker compose logs -f api
  docker compose logs -f client
  ```
- **Stop Containers**:
  ```bash
  docker compose down
  ```
- **Stop Containers and Remove Volumes (Full DB Reset)**:
  ```bash
  docker compose down -v
  ```

---

## Running Locally Without Docker

If you want to run the frontend and backend directly on your host machine:

### 1. Start the Database and MailHog
```bash
docker compose up -d postgres mailhog
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (already configured to use `localhost:5433` for PostgreSQL):
```bash
cp .env.example .env
```

### 3. Backend Setup
```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run db:seed
npm run dev
```
Backend runs on [http://localhost:4000](http://localhost:4000).

### 4. Frontend Setup
In a new terminal:
```bash
cd client
npm install
npm run dev
```
Frontend runs on [http://localhost:5173](http://localhost:5173).

---

## Running Tests

- **Run all tests (Server + Client)**:
  ```bash
  docker compose run --rm test
  ```
  *or locally:*
  ```bash
  npm test
  ```
- **Server integration tests**:
  ```bash
  npm run test:server
  ```
- **Client tests**:
  ```bash
  npm run test:client
  ```
