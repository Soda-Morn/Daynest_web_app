-- =============================================================================
-- Daynest — initial schema
--
-- Multi-user by design: every row belongs to exactly one auth user and Row
-- Level Security (RLS) restricts every table to its owner. Ownership is also
-- enforced *between* tables: composite foreign keys (id, user_id) make it
-- impossible to attach a task to someone else's list or calendar.
--
-- Sync-friendly: client-generated UUIDs (idempotent retries, no duplicates),
-- `updated_at` maintained by the database, `rev` for optimistic concurrency,
-- and soft deletes (`deleted_at`) so offline devices learn about deletions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rows can never be handed to another user.
create or replace function public.prevent_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Revisions only move forward, so every device can tell a newer version.
create or replace function public.bump_rev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.rev <= old.rev then
    new.rev := old.rev + 1;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 80),
  avatar_url  text check (char_length(avatar_url) <= 500), -- storage path in the private "avatars" bucket
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_settings (1:1 with users)
-- ---------------------------------------------------------------------------

create table public.user_settings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  theme        text not null default 'system' check (theme in ('system', 'light', 'dark')),
  week_start   smallint not null default 0 check (week_start in (0, 1)),
  date_format  text not null default 'auto' check (char_length(date_format) <= 20),
  time_format  text not null default '12h' check (time_format in ('12h', '24h')),
  timezone     text not null default 'UTC' check (char_length(timezone) <= 64),
  -- App preferences that don't need their own column (default calendar,
  -- calendar views, reminder defaults, sidebar state…).
  preferences  jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories (shown in the app as "My calendars")
-- ---------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  color       text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_visible  boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, user_id)
);
-- No two live calendars with the same name for one user.
create unique index categories_user_name_uniq on public.categories (user_id, lower(name)) where deleted_at is null;
create index categories_user_updated_idx on public.categories (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- lists (task lists)
-- ---------------------------------------------------------------------------

create table public.lists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  description  text not null default '' check (char_length(description) <= 500),
  color        text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon         text check (char_length(icon) <= 40),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (id, user_id)
);
create unique index lists_user_name_uniq on public.lists (user_id, lower(name)) where deleted_at is null;
create index lists_user_updated_idx on public.lists (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- tasks — also the calendar items (a task with a date/time shows on the calendar)
-- ---------------------------------------------------------------------------

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id           uuid,
  category_id       uuid,
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  description       text not null default '' check (char_length(description) <= 10000),
  start_date        date,
  due_date          date,
  start_time        time,
  end_time          time,
  priority          text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status            text not null default 'todo' check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  is_completed      boolean generated always as (status = 'completed') stored,
  completed_at      timestamptz,
  position          double precision not null default 0,
  subtasks          jsonb not null default '[]'::jsonb check (jsonb_typeof(subtasks) = 'array'),
  recurrence        jsonb check (recurrence is null or jsonb_typeof(recurrence) = 'object'),
  overrides         jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  reminder_offsets  integer[] not null default '{}', -- minutes before start
  rev               integer not null default 1 check (rev > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  check (due_date is null or start_date is null or due_date >= start_date),
  check (start_time is null or start_date is not null or due_date is not null),
  -- Ownership-safe references: the list/calendar must belong to the same user.
  foreign key (list_id, user_id) references public.lists (id, user_id) on delete set null (list_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  unique (id, user_id)
);
create index tasks_user_updated_idx on public.tasks (user_id, updated_at);
create index tasks_user_start_idx on public.tasks (user_id, start_date) where deleted_at is null;
create index tasks_user_due_open_idx on public.tasks (user_id, due_date) where deleted_at is null and status in ('todo', 'in_progress');
create index tasks_list_idx on public.tasks (list_id) where list_id is not null;
create index tasks_category_idx on public.tasks (category_id) where category_id is not null;

-- ---------------------------------------------------------------------------
-- events — standalone calendar events (reserved; the app currently uses
-- timed tasks). Ready for imports / shared calendars.
-- ---------------------------------------------------------------------------

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 10000),
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  all_day      boolean not null default false,
  location     text not null default '' check (char_length(location) <= 300),
  color        text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  rev          integer not null default 1 check (rev > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (end_time >= start_time),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  unique (id, user_id)
);
create index events_user_start_idx on public.events (user_id, start_time) where deleted_at is null;
create index events_user_updated_idx on public.events (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- habits + habit_logs (schema ready; UI comes later)
-- ---------------------------------------------------------------------------

create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 1000),
  frequency    text not null default 'daily' check (frequency in ('daily', 'weekly', 'monthly')),
  target       integer not null default 1 check (target between 1 and 100),
  color        text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (id, user_id)
);
create index habits_user_idx on public.habits (user_id) where deleted_at is null;

create table public.habit_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id        uuid not null,
  completed_date  date not null,
  completed       boolean not null default true,
  created_at      timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  unique (habit_id, completed_date) -- one log per habit per day
);
create index habit_logs_user_date_idx on public.habit_logs (user_id, completed_date);

-- ---------------------------------------------------------------------------
-- reminders — scheduled notifications (for future server-side delivery:
-- email / push). In-app reminders use tasks.reminder_offsets today.
-- ---------------------------------------------------------------------------

create table public.reminders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id            uuid,
  event_id           uuid,
  reminder_time      timestamptz not null,
  notification_type  text not null default 'in_app' check (notification_type in ('in_app', 'push', 'email')),
  is_sent            boolean not null default false,
  created_at         timestamptz not null default now(),
  check ((task_id is not null)::int + (event_id is not null)::int = 1),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade
);
create index reminders_due_idx on public.reminders (reminder_time) where not is_sent;
create index reminders_user_idx on public.reminders (user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger user_settings_updated_at before update on public.user_settings for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger lists_updated_at before update on public.lists for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger habits_updated_at before update on public.habits for each row execute function public.set_updated_at();

create trigger tasks_rev before update on public.tasks for each row execute function public.bump_rev();
create trigger events_rev before update on public.events for each row execute function public.bump_rev();

create trigger user_settings_owner before update on public.user_settings for each row execute function public.prevent_owner_change();
create trigger categories_owner before update on public.categories for each row execute function public.prevent_owner_change();
create trigger lists_owner before update on public.lists for each row execute function public.prevent_owner_change();
create trigger tasks_owner before update on public.tasks for each row execute function public.prevent_owner_change();
create trigger events_owner before update on public.events for each row execute function public.prevent_owner_change();
create trigger habits_owner before update on public.habits for each row execute function public.prevent_owner_change();
create trigger habit_logs_owner before update on public.habit_logs for each row execute function public.prevent_owner_change();
create trigger reminders_owner before update on public.reminders for each row execute function public.prevent_owner_change();

-- ---------------------------------------------------------------------------
-- New users: profile, settings and editable starter calendars/lists
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''));

  insert into public.user_settings (user_id) values (new.id);

  insert into public.categories (user_id, name, color, position) values
    (new.id, 'Personal', '#8b72a8', 0),
    (new.id, 'Work', '#91b5d3', 1),
    (new.id, 'Fitness', '#8baf91', 2),
    (new.id, 'Family', '#d68c91', 3),
    (new.id, 'Study', '#e6c477', 4);

  insert into public.lists (user_id, name, color, position) values
    (new.id, 'Home', '#8baf91', 0),
    (new.id, 'Shopping', '#d68c91', 1),
    (new.id, 'Work Projects', '#91b5d3', 2),
    (new.id, 'Learning', '#e6c477', 3),
    (new.id, 'Personal Goals', '#b9a3d1', 4);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
