# Deployment — INESC-ID server (primary path)

Target machine: **mlkd.mlkd.tp.vps.inesc-id.pt** (Ubuntu, nginx, serves the current
MLKD site). Contacts: Prof. Arlindo Oliveira, João Marques, Vitória.

The whole platform runs on this one machine with `docker compose` (db + web + ai),
and nginx **reverse-proxies** to it. This replaces the Vercel/Supabase/HF split
(`docs/DEPLOY.md` stays as a fallback) — one server, no external services, and the
LLM keys are the only outside dependency.

> **Important difference from the professor's snippet:** his example serves a
> *static* site (`root` + `try_files`). Our site is a dynamic app (Next.js SSR +
> Payload admin + Python AI service), so the nginx server block must **proxy** to
> the app instead of serving files. Same sites-available/sites-enabled pattern,
> different `location` body. The old site keeps running untouched on its own
> server_name until we're ready to switch.

## 0. Access (once)

```bash
# locally — already configured in ~/.ssh/config as "mlkd-server":
ssh mlkd-server        # == ssh danylo@mlkd.mlkd.tp.vps.inesc-id.pt
```

## 1. Prerequisites on the server (need sudo, or ask João)

```bash
# Docker Engine + compose plugin (skip whatever is already installed)
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker danylo   # then re-login
```

## 2. Get the code + configure

```bash
git clone https://github.com/eternaki/ai-portal-inesc.git ~/mlkd-portal
cd ~/mlkd-portal
cp .env.example .env
```

Edit `.env` — the minimum for production:

```bash
PAYLOAD_SECRET=$(openssl rand -hex 32)      # generate once, keep
AI_SERVICE_TOKEN=$(openssl rand -hex 24)    # generate once, keep
POSTGRES_PASSWORD=<strong password>          # NOT the default "mlkd"
GEMINI_API_KEY=...                           # and/or OPENROUTER_API_KEY / GROQ_API_KEY
OPENALEX_MAILTO=<real team email>
```

## 3. Start everything

```bash
docker compose up -d --build
```

- First start auto-loads the **seed** (252 publications, 113 members, embeddings,
  topic map, admin user) into the fresh db volume.
- Check: `curl -s localhost:3000` (site) and `curl -s localhost:8000/health` (AI).
- Ports 3000/8000 are bound and the AI service must **not** be exposed publicly —
  nginx will only proxy the web app.

## 4. nginx server block (reverse proxy, not static root)

Assuming the new site will answer on a test hostname first (e.g.
`new.mlkd.tp.vps.inesc-id.pt` — João/DNS decide the name; the old site keeps its
current server_name):

`/etc/nginx/sites-available/mlkd-portal`:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name new.mlkd.tp.vps.inesc-id.pt;   # test name; switch later

    # Payload admin uploads media; keep request size sane
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Next.js dev/HMR and admin panel benefit from upgrades
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;      # AI-backed pages (search warmup) can be slow once
    }
}
```

Enable and reload (the professor's steps, unchanged):

```bash
sudo ln -s /etc/nginx/sites-available/mlkd-portal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 5. HTTPS

```bash
sudo certbot --nginx -d new.mlkd.tp.vps.inesc-id.pt
```

## 6. First login & hardening

- Admin: `https://<host>/admin` — `admin@mlkd.local` / `MlkdAdmin2026!` (from the
  seed). **Change the password immediately** and set a real email.
- Users → `service@mlkd.local` → copy the API key → put it in `.env` as
  `PAYLOAD_API_KEY` → `docker compose up -d` (recreates the ai container with it).

## 7. Going live on the real domain (later, when approved)

1. Edit the server block: `server_name mlkd.idss.inesc-id.pt;` (or whatever the
   official name is), reload nginx.
2. Remove/adjust the old site's symlink in `sites-enabled` only at that moment —
   nothing about the old site is touched before then.

## 8. Updates

```bash
cd ~/mlkd-portal && git pull && docker compose up -d --build
```

Migrations run via `pnpm payload migrate` inside the web image build or manually:
`docker compose exec web node ...` — simplest is: the schema is already migrated in
the db volume; after pulling code with a new migration, run
`docker compose exec web npx payload migrate`.

## Ops notes

- **Backups:** `docker compose exec db pg_dump -U mlkd mlkd | gzip > backup-$(date +%F).sql.gz`
  (cron it weekly; the content is also reproducible from OpenAlex + seed).
- **Logs:** `docker compose logs -f web` / `ai` / `db`.
- **Resources:** the AI container needs ~1.5–2 GB RAM (torch, CPU embeddings).
  If the VPS is small, ask João how much RAM we have; the site itself runs fine
  and search degrades to keyword-only if the AI container is stopped.
