-- =============================================================================
-- Daynest — Row Level Security, grants, storage and realtime
--
-- Every user-owned table: RLS on, owner-only SELECT / INSERT / UPDATE /
-- DELETE via auth.uid(). `(select auth.uid())` is evaluated once per query
-- (Supabase performance guidance). The anonymous role gets no table access.
-- =============================================================================

alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.categories    enable row level security;
alter table public.lists         enable row level security;
alter table public.tasks         enable row level security;
alter table public.events        enable row level security;
alter table public.habits        enable row level security;
alter table public.habit_logs    enable row level security;
alter table public.reminders     enable row level security;

-- Defence in depth: signed-out visitors cannot touch any table.
revoke all on public.profiles, public.user_settings, public.categories, public.lists, public.tasks,
  public.events, public.habits, public.habit_logs, public.reminders from anon;

-- ---------------------------------------------------------------------------
-- profiles: id is the user id
-- ---------------------------------------------------------------------------
create policy "profiles: read own"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- No delete policy: a profile is removed only with its auth user (cascade).

-- ---------------------------------------------------------------------------
-- Owner policies for every table with a user_id column
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['user_settings', 'categories', 'lists', 'tasks', 'events', 'habits', 'habit_logs', 'reminders']
  loop
    execute format('create policy "%1$s: read own" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: insert own" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: update own" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: delete own" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- user_settings rows are created by the signup trigger; users may not delete them.
drop policy "user_settings: delete own" on public.user_settings;

-- ---------------------------------------------------------------------------
-- Storage: private "avatars" bucket. Files live under "<user id>/…" and only
-- their owner can read or write them (the app shows them via signed URLs).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "avatars: read own"   on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes for the synced tables. Realtime applies
-- the same RLS policies, so each client only receives its own rows.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.tasks, public.categories, public.lists, public.user_settings, public.profiles;
