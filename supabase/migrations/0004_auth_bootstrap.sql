-- ============================================================================
-- Migration 0004: Auth bootstrap
-- Automatically create a profile row when a new auth.users row is created.
-- Default role is PROMOTER (least privilege); admin must promote via Users module.
-- ============================================================================

create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'PROMOTER')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function handle_new_auth_user();
