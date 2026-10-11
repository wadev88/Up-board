-- Supabase Auth "Before User Created" hook (ADR-003, defence in depth).
--
-- The UP Board API already refuses any Google identity that is not a verified, exactly-@up.ac.th
-- account before it issues a session. This hook additionally stops Supabase Auth from even
-- creating a user record for other domains.
--
-- Install (Supabase dashboard → SQL editor), then enable it under
-- Authentication → Hooks → "Before User Created" → Postgres function public.hook_up_ac_th_only.
-- This file is NOT an Alembic migration: the `auth` schema and these roles exist only on Supabase.

create or replace function public.hook_up_ac_th_only(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  -- exact domain after the last '@' (rejects up.ac.th.evil.com, sub.up.ac.th, …)
  if split_part(email, '@', 2) = 'up.ac.th' and email ~ '^[a-z0-9._%+-]+@up\.ac\.th$' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Only @up.ac.th Google accounts can use UP Board'
    )
  );
end;
$$;

grant execute on function public.hook_up_ac_th_only(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_up_ac_th_only(jsonb) from authenticated, anon, public;
