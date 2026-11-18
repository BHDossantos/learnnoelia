#!/usr/bin/env bash
# One-shot boot of the local dev stack: brings up postgres/gotrue/postgrest/storage,
# applies migrations, starts the gateway, then seeds a test user + sample content.
# Idempotent — safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV="$ROOT/devstack"

cd "$DEV"
docker compose up -d postgres

# Wait for postgres to accept TCP connections over 127.0.0.1 (the image
# restarts a few times during init, so the unix-socket healthcheck can pass
# before the TCP listener is actually ready — poll the real connection).
until docker exec -e PGPASSWORD=any lf_pg psql -h 127.0.0.1 -U supabase_admin -d postgres \
        -c "SELECT 1" >/dev/null 2>&1; do sleep 1; done

# Set service-role passwords. These ship blank in the supabase/postgres image;
# connect over 127.0.0.1 (trust auth) as the superuser supabase_admin to set them.
docker exec -e PGPASSWORD=any lf_pg psql -h 127.0.0.1 -U supabase_admin -d postgres \
  -c "ALTER USER supabase_auth_admin WITH PASSWORD 'postgres';
      ALTER USER authenticator WITH PASSWORD 'postgres';
      ALTER USER supabase_storage_admin WITH PASSWORD 'postgres';" >/dev/null

# Storage: prefer the real supabase/storage-api container; if its image can't
# be pulled (e.g. Docker Hub rate limit), fall back to devstack/storage-stub.mjs.
STORAGE_MODE=stub
if docker image inspect supabase/storage-api:v1.19.3 >/dev/null 2>&1; then
  STORAGE_MODE=container
fi

if [[ "$STORAGE_MODE" == "container" ]]; then
  # storage-api runs its own migrations that create storage.buckets /
  # storage.objects, which our migration 0004 depends on.
  docker compose up -d storage
  until curl -s -o /dev/null http://localhost:5000/status; do sleep 1; done
else
  # No storage-api image — create the minimal storage tables ourselves so
  # migration 0004_storage.sql applies; the stub serves the HTTP API.
  docker exec -i -e PGPASSWORD=any lf_pg psql -h 127.0.0.1 -U supabase_admin -d postgres \
    -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now());
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/'); $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role, postgres;
grant all on storage.buckets to postgres, service_role;
grant all on storage.objects to postgres, service_role;
SQL
fi

# Apply our migrations
for f in "$ROOT"/supabase/migrations/*.sql; do
  docker exec -i lf_pg psql -U postgres -v ON_ERROR_STOP=1 < "$f" >/dev/null 2>&1 || \
    echo "warn: migration $(basename "$f") had errors (likely idempotent reruns)"
done

# Boot auth + REST
docker compose up -d gotrue postgrest
until docker logs lf_gotrue 2>&1 | grep -q "GoTrue\|listening"; do sleep 1; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ | grep -qE "200|400"; do sleep 1; done

# Start the storage stub (only when not using the real container).
if [[ "$STORAGE_MODE" == "stub" ]] && ! curl -s -o /dev/null http://localhost:5000/ 2>/dev/null; then
  nohup node "$DEV/storage-stub.mjs" >/tmp/lf_storage_stub.log 2>&1 &
  until curl -s -o /dev/null http://localhost:5000/ 2>/dev/null; do sleep 1; done
fi

# Start the host gateway. Must be up BEFORE seeding — the seed step below
# talks to gotrue's admin API through the gateway URL (:54321).
if ! curl -s http://localhost:54321/auth/v1/health >/dev/null 2>&1; then
  nohup node "$DEV/gateway.mjs" >/tmp/lf_gateway.log 2>&1 &
  until curl -s http://localhost:54321/auth/v1/health >/dev/null 2>&1; do sleep 1; done
fi

# Sample content (idempotent — uses fixed UUIDs)
docker exec -i lf_pg psql -U postgres < "$ROOT/supabase/seed/seed_es_a1.sql" >/dev/null 2>&1 || true
docker exec -i lf_pg psql -U postgres < "$ROOT/supabase/seed/seed_academic.sql" >/dev/null 2>&1 || true
docker exec -i lf_pg psql -U postgres < "$ROOT/supabase/seed/seed_starter_pack.sql" >/dev/null 2>&1 || true

# Biology fixture for subject-specific guided-reading regression tests.
docker exec -i lf_pg psql -U postgres -v ON_ERROR_STOP=1 < "$ROOT/supabase/seed/curriculum/sci_biology.sql" >/dev/null

# Seed test user + per-user data (idempotent)
SRK="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$SRK" ]]; then
  echo "warn: SUPABASE_SERVICE_ROLE_KEY not set; skipping test-user creation"
else
  curl -s -X POST http://localhost:54321/auth/v1/admin/users \
    -H "Authorization: Bearer $SRK" -H "apikey: $SRK" \
    -H "Content-Type: application/json" \
    -d '{"email":"learner@test.local","password":"test-password-123","email_confirm":true}' >/dev/null || true

  USER_ID=$(curl -s "http://localhost:54321/auth/v1/admin/users" \
    -H "Authorization: Bearer $SRK" -H "apikey: $SRK" \
    | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
  if [[ -n "$USER_ID" ]]; then
    docker exec -i lf_pg psql -U postgres -v ON_ERROR_STOP=1 <<SQL >/dev/null
      update public.profiles set display_name='Test Learner', ui_language='en' where id='$USER_ID';
      insert into public.target_languages (user_id, language, dialect, cefr_level, active)
        values ('$USER_ID', 'es', 'latam', 'A1', true) on conflict do nothing;
      insert into public.enrollments (user_id, course_id)
        values ('$USER_ID', '11111111-1111-1111-1111-111111111111') on conflict do nothing;
      insert into public.assignments (id, course_id, title, instructions_md, max_score, kind, language, published)
        values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
          'Describe your morning routine',
          'Write 4-6 sentences in Spanish about your morning routine. You may also attach a photo or audio.',
          100, 'project', 'es', true) on conflict (id) do nothing;
SQL
  fi
fi

echo "ready: http://localhost:54321  (gotrue + postgrest + storage[$STORAGE_MODE] behind gateway)"
echo "seeded user: learner@test.local / test-password-123"
