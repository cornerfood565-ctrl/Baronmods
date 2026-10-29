# Baronmods + Supabase setup

This static site uses Supabase for the public mod catalogue, version metadata, admin sign-in, and mod-file storage.

## 1. Configure Supabase

In Supabase Dashboard, open Project Settings → API and copy the Project URL and publishable key (or legacy anon key). Put them in supabase-config.js:
- url: your Supabase project URL, usually https://YOUR_PROJECT_REF.supabase.co
- anonKey: your publishable/anon key

These values are intended for browser use. Never use the service_role or secret key in frontend code. RLS policies are the access control.

## 2. Create the database and policies

Open SQL Editor in Supabase, paste the entire supabase-setup.sql file, and run it. Review it first if your project already has tables with these names. It creates mods, mod_versions, admin_users, RLS policies, and public Storage buckets named mod-files and mod-images.

The mod-files bucket is public for player downloads, but Storage writes are limited to approved admins. Mod files have a 100 MB limit and images 10 MB; check your Supabase plan supports these limits.

## 3. Create your first admin

1. Open Supabase Authentication → Users.
2. Create a user for yourself with your email and a strong password. The site intentionally has no public sign-up form.
3. Copy the user's UUID from the Users page.
4. In SQL Editor, run the following query, replacing the placeholder with your real UUID:

    insert into public.admin_users (user_id) values ('PASTE-YOUR-AUTH-USER-UUID-HERE');

Only add trusted users. A regular account is not an admin unless its UUID is in admin_users.

## 4. Deploy with Vercel

Import cornerfood565-ctrl/Baronmods into Vercel. Use repository root ./, Framework Preset Other, and leave Build Command empty. Commit the public Supabase URL and publishable/anon key in supabase-config.js before deploying. A plain static site cannot automatically read Vercel environment variables in browser JavaScript without a build step or server endpoint.

Pages:
- index.html — homepage
- mods.html — public mod library and downloads
- admin.html — admin sign-in and upload dashboard

## 5. Upload a mod

Visit /admin.html, sign in with your approved admin account, fill in the mod details, choose a .jar or .zip file, enter the version, loader, and Minecraft versions, then publish. Published mods appear on /mods.html.

## Security and operational notes

- Never place a service-role/secret key in browser code, GitHub, or client-side environment variables.
- Keep RLS enabled. The SQL uses a security-definer helper to check membership in admin_users.
- Public download URLs can be shared by anyone. For private or paid downloads, use private Storage and a server-side signed-URL endpoint with authorization.
- File-extension and size checks in the browser are convenience checks, not malware scanning. Only distribute files you have permission to share; include accurate version and compatibility information.
- The downloads counter is not currently incremented; add a server-side endpoint if you need reliable download analytics. Do not allow visitors to update the downloads field.
- Back up the database and verify Storage policies before launch.
