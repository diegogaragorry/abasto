# Deploy

## GitHub

Create the repository under `diegogaragorry/abasto` and push this workspace:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/diegogaragorry/abasto.git
git push -u origin main
```

## Railway

Deploy the backend from `apps/api`.

Recommended setup in Railway:

1. Create a new service from the GitHub repository.
2. Set the service Root Directory to `apps/api`.
3. Railway will detect the `Dockerfile` in that directory and use it for builds.
4. Add a PostgreSQL service and copy its `DATABASE_URL` into the backend service variables.
5. Add these backend variables:

```text
ADMIN_PASSWORD=...
PORT=3000
CORS_ORIGIN=https://<your-vercel-domain>
```

Optional variables for PedidosYa:

```text
PEDIDOSYA_COOKIE=
PEDIDOSYA_USER_AGENT=
```

After the first deploy, generate a public domain in Railway and use that URL as the frontend API URL.

## Vercel

Deploy the frontend from `apps/web`.

Recommended setup in Vercel:

1. Import the same GitHub repository.
2. Set the Project Root Directory to `apps/web`.
3. Keep the framework preset as `Vite`.
4. Add:

```text
VITE_API_URL=https://<your-railway-domain>
```

The SPA rewrite config already lives in `apps/web/vercel.json`.

## Monorepo notes

- Backend service root: `apps/api`
- Frontend project root: `apps/web`
- Shared package is resolved through npm workspaces from the repository root
