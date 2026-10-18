# Staging Validation Checklist — Barber POS

Status: **test plan only; not evidence that migrations have passed**.

Target branch: `feat/initial-pos-foundation`  
Migrations in scope:
- `001_initial_pos_foundation.sql` — schema
- `002_enable_rls_lockdown.sql` — RLS enabled, no client policies
- `003_initial_read_policies.sql` — initial SELECT policies

## Vercel deployment note

- The repository's `main` branch is currently only a README and does not contain `package.json`; a deployment built from `main` will fail with `NEXT_NO_VERSION`.
- The Next.js app is on `feat/initial-pos-foundation`. Use a Vercel Preview Deployment for that branch while keeping `main` as the Production Branch until the pull request is reviewed and build/security checks have passed.
- After pushing this documentation update, inspect Vercel Deployments for a new Preview deployment. Its build log must say `Branch: feat/initial-pos-foundation`. If Vercel only starts a deployment for `main`, fix the Vercel Git integration/branch deployment settings; do not merge this draft PR just to silence the build error.

## Safety gates

- [ ] Use a disposable Supabase project or isolated staging database, not the production project.
- [ ] Confirm the target project and database before running any migration.
- [ ] Apply migrations in order, as one reviewed set: 001 → 002 → 003.
- [ ] Stop on the first SQL error. Do not continue by manually skipping statements.
- [ ] Do not put a service-role key in browser code, screenshots, GitHub, or test fixtures.
- [ ] Do not enable client writes until server-side transactional endpoints/RPCs and write authorization are reviewed.

## 1. Preflight: extension and migration state

Run in the staging SQL editor:

```sql
select current_database() as database_name,
       current_user as database_role,
       current_setting('server_version') as postgres_version;

select extname, extversion
from pg_extension
where extname in ('pgcrypto', 'btree_gist')
order by extname;
```
