-- ============================================================================
-- Migration 0006: Centralized "business date" logic
--
-- Problem this fixes:
-- `business_date` columns previously defaulted to plain `current_date`, which
-- follows the DATABASE SESSION timezone (UTC on Supabase), not the club's
-- local timezone (Asia/Manila). Separately, `credit_consumption_commission()`
-- computed its own business_date using Asia/Manila WITHOUT accounting for the
-- fact that a club night runs past midnight — so a guest who arrived and was
-- guest-listed at 10 PM (business_date = that day) but paid their bill at
-- 2 AM the next Manila calendar day would get ENTRANCE commission on one date
-- and CONSUMPTION commission on the next date, splitting one night's earnings
-- across two reporting days.
--
-- Fix: a single get_business_date() function used everywhere. A "business
-- night" runs from 06:00 Asia/Manila to 05:59:59 Asia/Manila the next day —
-- i.e. anything before 6 AM local time is still attributed to the PREVIOUS
-- calendar date. Adjust the 06:00 cutoff below if the club's actual last-call
-- / closing time differs.
-- ============================================================================

create or replace function get_business_date(p_ts timestamptz default now())
returns date
language sql
stable
as $$
  select case
    when (p_ts at time zone 'Asia/Manila')::time < time '06:00'
      then ((p_ts at time zone 'Asia/Manila')::date - interval '1 day')::date
    else (p_ts at time zone 'Asia/Manila')::date
  end;
$$;

comment on function get_business_date(timestamptz) is
  'Converts a timestamp to the club''s "business date": Asia/Manila calendar date, '
  'with anything before 06:00 local time attributed to the previous day so a night '
  'that runs past midnight stays on one consistent date.';

-- ----------------------------------------------------------------------------
-- Point existing business_date columns at the new function instead of
-- plain current_date. Existing rows are NOT rewritten (their business_date
-- was already fixed at insert time under the old logic) — this only changes
-- behavior for NEW rows going forward. See the backfill note at the bottom
-- if you want to correct historical rows too.
-- ----------------------------------------------------------------------------
alter table guestlists alter column business_date set default get_business_date();
alter table commission_records alter column business_date set default get_business_date();
alter table commission_adjustments alter column business_date set default get_business_date();

-- ----------------------------------------------------------------------------
-- Consumption commission previously computed Asia/Manila date manually
-- without the 6 AM rollover. Route it through get_business_date() so it
-- matches guestlists/entrance commission for orders paid overnight.
-- ----------------------------------------------------------------------------
create or replace function credit_consumption_commission()
returns trigger language plpgsql security definer as $$
declare
  v_rule commission_rules;
  v_promoter uuid;
begin
  if new.status = 'PAID' and (old.status is distinct from 'PAID') then
    v_promoter := new.promoter_id;

    -- no commission if no promoter attribution (e.g. walk-in / no guestlist link)
    if v_promoter is null then
      return new;
    end if;

    select * into v_rule from get_active_commission_rule(new.room_id, now());
    if v_rule.id is null then
      return new;
    end if;

    insert into commission_records(
      promoter_id, guestlist_id, order_id, commission_rule_id, component,
      base_amount, rate, commission_amount, status, business_date
    ) values (
      v_promoter, new.guestlist_id, new.id, v_rule.id, 'CONSUMPTION',
      new.grand_total, v_rule.consumption_commission_pct,
      round(new.grand_total * v_rule.consumption_commission_pct / 100.0, 2),
      'APPROVED', get_business_date(new.paid_at)
    );
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- The guestlist cutoff trigger checked "is it >= 11 PM" using its own
-- Asia/Manila conversion, which is unaffected by the change above (11 PM
-- walk-in cutoff and the 6 AM business-date rollover are separate concerns:
-- the former decides commission eligibility, the latter decides which report
-- a row shows up in). Left as-is, included here only for clarity — no change
-- needed to apply_guestlist_cutoff().
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- OPTIONAL BACKFILL — uncomment and run manually if you want historical rows
-- corrected too (safe to run repeatedly; only touches rows where the stored
-- business_date disagrees with what get_business_date(created_at) would give).
-- Review the affected row counts first before uncommenting in production.
-- ----------------------------------------------------------------------------
-- update guestlists set business_date = get_business_date(created_at)
--   where business_date <> get_business_date(created_at);
-- update commission_records set business_date = get_business_date(created_at)
--   where business_date <> get_business_date(created_at);
