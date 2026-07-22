# Deployment guide — free tier (Vercel + Supabase + Hugging Face)

The platform is three parts, deployed to three free services:

| Part | Host | Free tier |
|---|---|---|
| **web** (Next.js + Payload admin) | **Vercel** | Hobby — free |
| **db** (Postgres + pgvector) | **Supabase** | Free project (500 MB, pgvector supported) |
| **ai** (Python FastAPI + torch) | **Hugging Face Spaces** (Docker) | Free CPU (2 vCPU / 16 GB) |
| media uploads | **Vercel Blob** | Free tier |

> Why Hugging Face for the AI service: it needs ~1–2 GB RAM for
> torch/sentence-transformers. Render's free tier (512 MB) is too small; HF Spaces
> gives 16 GB free with no credit card. Our AI Dockerfile already targets it
> (`ai/README.md` has the Space config; runs on CPU).

You create the three accounts and paste the secrets in each dashboard (I can't create
accounts or enter your tokens). Everything code-side is ready. Follow the order below.

---

## 0. One-time values

```bash
openssl rand -hex 32     # PAYLOAD_SECRET  (keep it)
openssl rand -hex 24     # AI_SERVICE_TOKEN (shared web ↔ ai secret; keep it)
```
Get a Gemini API key from Google AI Studio for the first free cloud provider. For
fallback, create an OpenRouter API key and use `OPENROUTER_MODEL=openrouter/free`.

---

## 1. Supabase (database)

1. Create a project at <https://supabase.com>. Note the DB password.
2. **Enable pgvector**: Dashboard → Database → Extensions → enable `vector`.
   (Or run `create extension if not exists vector;` in the SQL editor.)
3. **Load schema + the 252-publication seed** using the *direct* connection string
   (Settings → Database → Connection string → “Direct connection”, port **5432**):
   ```bash
   gunzip -c db/seed/mlkd-seed.sql.gz | psql "postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
   ```
   This creates every table and loads publications + embeddings + topic map + the
   admin user in one shot.
4. Copy two connection strings for later:
   - **Pooled** (Transaction pooler, port **6543**, `...pooler.supabase.com`) → use as
     `DATABASE_URL` for Vercel (serverless-friendly). Append `?pgbouncer=true`.
   - **Direct** (port 5432) → use as `DATABASE_URL` for the Hugging Face Space.

---

## 2. Hugging Face Space (AI service)

1. Create a **Docker** Space at <https://huggingface.co/new-space> (SDK: Docker).
2. Push the **contents of `ai/`** to the Space repo (its `README.md`, `Dockerfile`,
   `app/`, `requirements.txt`). From a clone of the Space:
   ```bash
   cp -r <repo>/ai/{README.md,Dockerfile,requirements.txt,app} .
   git add . && git commit -m "MLKD AI service" && git push
   ```
3. Space → Settings → **Variables and secrets**, add:
   | Secret | Value |
   |---|---|
   | `DATABASE_URL` | Supabase **direct** string (port 5432) |
   | `PAYLOAD_URL` | your Vercel URL (set after step 3; can start with a placeholder) |
   | `PAYLOAD_API_KEY` | service user API key (see step 4) |
   | `AI_SERVICE_TOKEN` | the value from step 0 |
   | `LLM_PROVIDER` | `auto` |
   | `LLM_FALLBACK_ENABLED` | `true` |
   | `LLM_FALLBACK_PROVIDERS` | `gemini,openrouter` |
   | `GEMINI_API_KEY` | your Gemini key |
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
   | `OPENROUTER_API_KEY` | your OpenRouter key, optional but recommended |
   | `OPENROUTER_MODEL` | `openrouter/free` |
   | `OPENALEX_MAILTO` | your email |
4. The Space builds and serves at `https://<user>-<space>.hf.space`. That is your
   `AI_SERVICE_URL`.

---

## 3. Vercel (web + admin)

1. Import the GitHub repo at <https://vercel.com/new>. **Root Directory: `web`**.
2. **Build command** (runs migrations first): `pnpm payload migrate && pnpm build`
   — (schema is already loaded from the seed, but this keeps future migrations
   applied; it is idempotent).
3. Create a **Blob store**: Vercel → Storage → Blob → Create. It sets
   `BLOB_READ_WRITE_TOKEN` automatically.
4. **Environment variables**:
   | Var | Value |
   |---|---|
   | `DATABASE_URL` | Supabase **pooled** string (port 6543, `?pgbouncer=true`) |
   | `PAYLOAD_SECRET` | from step 0 |
   | `AI_SERVICE_URL` | the Hugging Face Space URL |
   | `AI_SERVICE_TOKEN` | the value from step 0 |
   | `NEXT_PUBLIC_SERVER_URL` | your Vercel URL (after first deploy) |
   | `BLOB_READ_WRITE_TOKEN` | set automatically by the Blob store |
5. Deploy. Then copy the Vercel URL back into the Hugging Face Space's `PAYLOAD_URL`
   and redeploy the Space so the AI service can write summaries back.

---

## 4. Service API key (web ↔ ai write-back)

The AI service writes summaries/bios back through the Payload REST API as the
`service@mlkd.local` user (role `editor`). Get its key:

1. Log into `/admin` on the deployed site (admin creds below).
2. Users → `service@mlkd.local` → enable/copy the **API Key**.
3. Set it as `PAYLOAD_API_KEY` on the Hugging Face Space.

---

## 5. First login & security

The seed includes an admin user:

- Email: `admin@mlkd.local` · Password: `MlkdAdmin2026!`

**Change this password immediately on the public deployment** (Admin → Users → your
user), or set a fresh one against Supabase:

```bash
DATABASE_URL="<supabase direct string>" \
  node web/scripts/set-admin-password.mjs admin@mlkd.local '<a strong password>'
```

Consider also renaming the admin email to a real one.

---

## 6. Verify

- `https://<space>.hf.space/health` → `{"status":"ok"}`
- `https://<space>.hf.space/health/llm` → configured provider/model readiness
- Vercel site → publications load, search returns results, chatbot answers.
- Admin dashboard → the maintenance report populates.

## Notes & limits

- HF free Spaces sleep after ~48 h idle and wake on the next request (first hit is
  slow). Fine for a demo.
- Supabase free pauses a project after long inactivity — open the dashboard to wake it.
- Gemini and OpenRouter free quotas can change. The chatbot reports structured
  configuration, quota, rate-limit, timeout, and model errors instead of generic
  provider failures.
- The site works even if the AI Space is asleep/down: search falls back to keyword,
  the chatbot hides. Nothing on the public site hard-depends on the AI service.
