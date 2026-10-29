create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 100),
  summary text not null default '' check (char_length(summary) <= 240),
  description text not null default '',
  category text not null default 'Utility',
  icon_path text,
  featured boolean not null default false,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.mod_versions (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  version text not null check (char_length(version) between 1 and 50),
  minecraft_versions text[] not null default '{}',
  loader text not null default 'Fabric' check (loader in ('Fabric','Forge','NeoForge','Quilt','Vanilla','Other')),
  changelog text not null default '',
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0 check (file_size >= 0),
  published boolean not null default false,
  downloads bigint not null default 0 check (downloads >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (mod_id, version, loader)
);
create index if not exists mods_published_created_idx on public.mods (published, created_at desc);
create index if not exists mod_versions_mod_created_idx on public.mod_versions (mod_id, created_at desc);

create or replace function public.is_baronmods_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())); $$;
revoke all on function public.is_baronmods_admin() from public;
grant execute on function public.is_baronmods_admin() to authenticated;

alter table public.admin_users enable row level security;
alter table public.mods enable row level security;
alter table public.mod_versions enable row level security;

drop policy if exists "Admins can read admin list" on public.admin_users;
create policy "Admins can read admin list" on public.admin_users for select to authenticated using (public.is_baronmods_admin());

drop policy if exists "Public can read published mods" on public.mods;
create policy "Public can read published mods" on public.mods for select to anon, authenticated using (published = true or public.is_baronmods_admin());
drop policy if exists "Admins can insert mods" on public.mods;
create policy "Admins can insert mods" on public.mods for insert to authenticated with check (public.is_baronmods_admin());
drop policy if exists "Admins can update mods" on public.mods;
create policy "Admins can update mods" on public.mods for update to authenticated using (public.is_baronmods_admin()) with check (public.is_baronmods_admin());
drop policy if exists "Admins can delete mods" on public.mods;
create policy "Admins can delete mods" on public.mods for delete to authenticated using (public.is_baronmods_admin());

drop policy if exists "Public can read published versions" on public.mod_versions;
create policy "Public can read published versions" on public.mod_versions for select to anon, authenticated using (
 (published = true and exists (select 1 from public.mods m where m.id = mod_id and m.published = true))
 or public.is_baronmods_admin()
);
drop policy if exists "Admins can insert versions" on public.mod_versions;
create policy "Admins can insert versions" on public.mod_versions for insert to authenticated with check (public.is_baronmods_admin());
drop policy if exists "Admins can update versions" on public.mod_versions;
create policy "Admins can update versions" on public.mod_versions for update to authenticated using (public.is_baronmods_admin()) with check (public.is_baronmods_admin());
drop policy if exists "Admins can delete versions" on public.mod_versions;
create policy "Admins can delete versions" on public.mod_versions for delete to authenticated using (public.is_baronmods_admin());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('mod-files','mod-files',true,104857600,array['application/java-archive','application/octet-stream','application/zip'])
on conflict (id) do update set public=true,file_size_limit=104857600,allowed_mime_types=array['application/java-archive','application/octet-stream','application/zip'];
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('mod-images','mod-images',true,10485760,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists "Admins upload mod files" on storage.objects;
create policy "Admins upload mod files" on storage.objects for insert to authenticated with check (bucket_id in ('mod-files','mod-images') and public.is_baronmods_admin());
drop policy if exists "Admins update mod files" on storage.objects;
create policy "Admins update mod files" on storage.objects for update to authenticated using (bucket_id in ('mod-files','mod-images') and public.is_baronmods_admin()) with check (bucket_id in ('mod-files','mod-images') and public.is_baronmods_admin());
drop policy if exists "Admins delete mod files" on storage.objects;
create policy "Admins delete mod files" on storage.objects for delete to authenticated using (bucket_id in ('mod-files','mod-images') and public.is_baronmods_admin());

-- Public buckets serve downloads, but RLS limits writes to approved admins.
-- Never put a service_role/secret key in browser JavaScript.
