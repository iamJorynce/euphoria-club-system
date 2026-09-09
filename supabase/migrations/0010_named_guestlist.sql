-- ============================================================================
-- Migration 0010: Named guestlist guests + per-guest entrance check-in
--
-- Previously a promoter only submitted a headcount (guestlists.pax) and
-- guestlist_guests rows were auto-generated as placeholder "Guest 1", "Guest
-- 2", ... at the door when reception charged the WHOLE group's entrance fee
-- in one shot. That assumed the whole group always arrives together, and
-- reception had no actual name to verify against.
--
-- This migration lets promoters submit real names up front, and lets
-- reception check guests in (and charge) individually as they trickle in
-- rather than all at once:
--   - promoters may insert/rename/remove guestlist_guests rows for their own
--     guestlist while it's still RESERVED (before anyone has arrived)
--   - guestlists.pax is kept in sync with the actual count of named guests
--   - a guest's paid_entrance/entrance_paid_at can still only be set by
--     staff (door), never by the promoter who submitted the name
--   - the first guest checked in flips the group RESERVED -> ARRIVED
--     automatically, same as the old manual "mark arrived" action did
-- ============================================================================

-- a reservation can transiently have 0 named guests while a promoter is
-- still building the list (e.g. removed a name before adding replacements)
alter table guestlists drop constraint if exists guestlists_pax_check;
alter table guestlists add constraint guestlists_pax_check check (pax >= 0);

-- ----------------------------------------------------------------------------
-- keep guestlists.pax equal to the number of named guests attached to it,
-- so the headcount shown everywhere (Tables, POS, reports) always matches
-- who was actually submitted, not a number that can drift from the names.
-- ----------------------------------------------------------------------------
create or replace function sync_guestlist_pax()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_guestlist_id uuid := coalesce(new.guestlist_id, old.guestlist_id);
begin
  update guestlists set pax = (select count(*) from guestlist_guests where guestlist_id = v_guestlist_id)
    where id = v_guestlist_id;
  return null;
end;
$$;

create trigger trg_sync_guestlist_pax_ins
  after insert on guestlist_guests
  for each row execute function sync_guestlist_pax();

create trigger trg_sync_guestlist_pax_del
  after delete on guestlist_guests
  for each row execute function sync_guestlist_pax();

-- ----------------------------------------------------------------------------
-- defense in depth: even though the RLS policies below only let a promoter
-- touch guestlist_guests while the parent is RESERVED, a promoter must never
-- be able to mark their own guest as having paid/arrived — that's the door's
-- job. Strip those two fields back to their prior value for any writer that
-- isn't staff, regardless of what the client sent.
-- ----------------------------------------------------------------------------
create or replace function guard_guestlist_guest_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    if TG_OP = 'INSERT' then
      new.paid_entrance := false;
      new.entrance_paid_at := null;
    elsif TG_OP = 'UPDATE' then
      new.paid_entrance := old.paid_entrance;
      new.entrance_paid_at := old.entrance_paid_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_guard_guestlist_guest_fields
  before insert or update on guestlist_guests
  for each row execute function guard_guestlist_guest_fields();

-- ----------------------------------------------------------------------------
-- first guest checked in for a still-RESERVED group flips it to ARRIVED,
-- same as the manual "mark arrived" button used to — except now it happens
-- per named guest instead of for the whole declared headcount at once.
-- ----------------------------------------------------------------------------
create or replace function auto_arrive_guestlist_on_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_guestlist guestlists;
begin
  if new.paid_entrance = true and (old.paid_entrance is distinct from true) then
    select * into v_guestlist from guestlists where id = new.guestlist_id;
    if v_guestlist.status = 'RESERVED' then
      update guestlists set status = 'ARRIVED', arrived_at = now() where id = v_guestlist.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_auto_arrive_guestlist_on_checkin
  after update of paid_entrance on guestlist_guests
  for each row execute function auto_arrive_guestlist_on_checkin();

-- ----------------------------------------------------------------------------
-- RLS: promoters manage the guest NAMES on their own still-pending groups.
-- (guestlist_guests_write_staff, added in 0003_rls.sql, already covers
-- staff for all operations including the actual check-in.)
-- ----------------------------------------------------------------------------
create policy guestlist_guests_insert_promoter on guestlist_guests for insert
  with check (
    exists (
      select 1 from guestlists g
      where g.id = guestlist_guests.guestlist_id
        and g.promoter_id = current_promoter_id()
        and g.status = 'RESERVED'
    )
  );

create policy guestlist_guests_update_promoter on guestlist_guests for update
  using (
    exists (
      select 1 from guestlists g
      where g.id = guestlist_guests.guestlist_id
        and g.promoter_id = current_promoter_id()
        and g.status = 'RESERVED'
    )
  )
  with check (
    exists (
      select 1 from guestlists g
      where g.id = guestlist_guests.guestlist_id
        and g.promoter_id = current_promoter_id()
        and g.status = 'RESERVED'
    )
  );

create policy guestlist_guests_delete_promoter on guestlist_guests for delete
  using (
    exists (
      select 1 from guestlists g
      where g.id = guestlist_guests.guestlist_id
        and g.promoter_id = current_promoter_id()
        and g.status = 'RESERVED'
    )
  );
