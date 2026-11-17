-- ===========================================================================
-- Daynest: server-owned change timestamps
--
-- Devices pull changes by `updated_at`, so it must come from the database,
-- never from a device clock:
--  * inserts now also get `updated_at` from the server (a device whose clock
--    runs ahead could otherwise push every other device's cursor into the
--    future, so they would skip real changes);
--  * clock_timestamp() instead of now(): now() is the transaction start, so a
--    long transaction could commit a row "in the past", behind a cursor that
--    another device already stored.
-- ===========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger profiles_updated_at_insert before insert on public.profiles for each row execute function public.set_updated_at();
create trigger user_settings_updated_at_insert before insert on public.user_settings for each row execute function public.set_updated_at();
create trigger categories_updated_at_insert before insert on public.categories for each row execute function public.set_updated_at();
create trigger lists_updated_at_insert before insert on public.lists for each row execute function public.set_updated_at();
create trigger tasks_updated_at_insert before insert on public.tasks for each row execute function public.set_updated_at();
create trigger events_updated_at_insert before insert on public.events for each row execute function public.set_updated_at();
create trigger habits_updated_at_insert before insert on public.habits for each row execute function public.set_updated_at();
