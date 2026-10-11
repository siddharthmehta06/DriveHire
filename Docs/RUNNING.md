# Running DriveHire

The React website is available on port 5173. The API and PostgreSQL run on ports 4000 and 5433.

## Run with Docker Compose

Requirements: Docker Desktop (with Compose v2) running.

From the repository root:

```powershell
docker compose up --build -d
```

Compose starts the React website, API and PostgreSQL. The API waits for PostgreSQL and applies the Prisma schema. Open the website at [http://localhost:5173](http://localhost:5173). Check the API health:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

To create the two sample vehicles:

```powershell
docker compose exec api npm run db:seed
```

Local seeded sign-in accounts use the password `DriveHire2026!`:

| Account type | Email |
|---|---|
| Owner | `owner@example.com` |
| Driver | `driver@example.com` |
| Admin | `admin@example.com` |

These accounts are for local development only. The API issues expiring JWT sessions and never accepts client-supplied role or owner ID headers. Replace the development credentials and JWT secret before any non-local deployment. Vehicle photo uploads are persisted in the `vehicle-uploads` Docker volume.

Stop services with:

```powershell
docker compose down
```

To remove the database and uploaded-photo data as well, run `docker compose down --volumes`. This permanently deletes those local Docker volumes.

## Run tests in Docker

```powershell
docker compose --profile test run --build --rm test
```

The test profile uses a separate PostgreSQL database on an isolated container, so tests do not alter the development database.

## Run without Docker

1. Start PostgreSQL and create a database and user matching the `DATABASE_URL` in `.env.example` (or edit that URL for your local PostgreSQL configuration).
2. Copy `.env.example` to `.env`.
3. From the repository root, run:

```powershell
npm ci
npm run prisma:generate
npm run prisma:push
npm run db:seed
npm start
```

In a second terminal, install and run the React client:

```powershell
npm ci --prefix client
npm run dev --prefix client
```

Open [http://localhost:5173](http://localhost:5173). The client proxies API requests to `http://localhost:4000`. Use `npm test` to run both the API integration suite and frontend smoke test. The legal pages at `/terms` and `/privacy` are launch-ready drafts but require the platform operator's legal/contact details and legal review before public use.

## Development security

The API requires password-checked JWT login. The credentials above are local demo accounts only; replace them and the development JWT secret before any public deployment. Do not expose this development configuration to an untrusted network.
