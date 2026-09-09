-- ============================================================================
-- Migration 0009: Commission payout
-- Commission records were auto-created as APPROVED by the entrance/consumption
-- triggers (0002_functions.sql) but nothing ever moved them to PAID — there
-- was no payout step. This adds the columns to record a payout and a
-- security-definer RPC (admin/manager only) to mark a batch of APPROVED
-- records for one promoter as paid, mirroring the audit-log pattern used by
-- close_and_replace_commission_rule / log_commission_adjustment.
-- ============================================================================

alter table commission_records
  add column paid_at timestamptz,
  add column paid_by uuid references profiles(id),
  add column payout_method payment_method,
  add column payout_reference text;

create index idx_commission_records_status on commission_records(status);

-- ----------------------------------------------------------------------------
-- mark_commission_paid: batch-pays a set of commission_records for a single
-- promoter. Rules enforced:
--   1. caller must be admin/manager
--   2. all record_ids must belong to the SAME promoter (keeps a payout batch
--      == one payout receipt for one person; do separate calls per promoter)
--   3. only APPROVED records are payable — PENDING isn't verified yet,
--      VOIDED was refunded, and already-PAID can't be paid twice
-- Writes one audit_logs row per record (not just a summary) so each
-- commission_records row's audit trail shows its own payout event.
-- ----------------------------------------------------------------------------
create or replace function mark_commission_paid(
  p_record_ids uuid[], p_method payment_method, p_reference text default null
) returns setof commission_records language plpgsql security definer set search_path = public as $$
declare
  v_promoter_count int;
  v_bad_status_count int;
  v_rec commission_records;
begin
  if not is_admin_or_manager() then
    raise exception 'Only admin or manager can mark commissions as paid';
  end if;

  if p_record_ids is null or array_length(p_record_ids, 1) is null then
    raise exception 'No commission records selected';
  end if;

  select count(distinct promoter_id) into v_promoter_count
  from commission_records where id = any(p_record_ids);

  if v_promoter_count is null or v_promoter_count = 0 then
    raise exception 'No matching commission records found';
  elsif v_promoter_count > 1 then
    raise exception 'All selected commission records must belong to the same promoter — pay out promoters separately';
  end if;

  select count(*) into v_bad_status_count
  from commission_records where id = any(p_record_ids) and status <> 'APPROVED';

  if v_bad_status_count > 0 then
    raise exception 'Only APPROVED commission records can be marked as paid (% selected record(s) are not APPROVED)', v_bad_status_count;
  end if;

  update commission_records
    set status = 'PAID', paid_at = now(), paid_by = auth.uid(),
        payout_method = p_method, payout_reference = p_reference
    where id = any(p_record_ids);

  for v_rec in select * from commission_records where id = any(p_record_ids) loop
    perform write_audit_log('COMMISSION_PAYOUT', 'commission', 'commission_records', v_rec.id,
      jsonb_build_object('status', 'APPROVED'),
      jsonb_build_object('status', 'PAID', 'commission_amount', v_rec.commission_amount,
        'payout_method', p_method, 'payout_reference', p_reference, 'promoter_id', v_rec.promoter_id));
  end loop;

  return query select * from commission_records where id = any(p_record_ids);
end;
$$;

-- grant only lets logged-in users CALL the function; it does not bypass the
-- is_admin_or_manager() check inside — non-admins calling it just get the
-- exception above.
grant execute on function mark_commission_paid(uuid[], payment_method, text) to authenticated;
