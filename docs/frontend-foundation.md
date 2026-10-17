# Next.js frontend foundation

## Included in this commit

- Next.js App Router with TypeScript.
- Responsive Indonesian-language operations dashboard placeholder.
- PWA manifest metadata and browser install display mode.
- Supabase browser-client helper using `@supabase/ssr`.
- `.env.example` with public Supabase URL and anon/publishable key placeholders.

## Current limitations

- The dashboard uses placeholder values only. It does not represent actual sales or commission data.
- Authentication, server-side authorization, RLS policies, and route protection are not implemented.
- Offline transaction capture, IndexedDB outbox, conflict handling, and acknowledged sync are not implemented.
- QRIS payment creation and provider webhook verification are not implemented.
- A manifest alone does not make this a complete offline-capable PWA; service-worker caching and offline transaction behavior require separate implementation and tests.
- Supabase configuration has not been supplied, and no database migration has been executed against a real project.

## Local setup

1. Install Node.js LTS and npm.
2. Copy `.env.example` to `.env.local`.
3. Fill in the Supabase project URL and public anon/publishable key.
4. Run `npm install`, then `npm run dev`.
5. Run `npm run typecheck` and `npm run build` before deployment.

Never expose a Supabase service-role key to the browser or commit secrets to Git.
