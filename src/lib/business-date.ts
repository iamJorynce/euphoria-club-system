/**
 * Mirrors the database's `get_business_date()` function:
 * Asia/Manila calendar date, with anything before 06:00 local time
 * attributed to the PREVIOUS day, so a club night that runs past
 * midnight stays on one consistent business_date.
 *
 * IMPORTANT: any code that filters guestlists / commission_records by
 * "today's" business_date should use this helper instead of
 * `new Date().toISOString().slice(0, 10)` — that older pattern uses the
 * UTC calendar date (or the browser's local date on the client), which
 * does not match Asia/Manila and does not account for the 6 AM rollover,
 * causing the dashboard to reset at the wrong time / disagree with the DB.
 */
export function getBusinessDate(date: Date = new Date()): string {
  const manila = new Date(
    date.toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  );

  if (manila.getHours() < 6) {
    manila.setDate(manila.getDate() - 1);
  }

  const y = manila.getFullYear();
  const m = String(manila.getMonth() + 1).padStart(2, '0');
  const d = String(manila.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the actual start/end instants (as real UTC Dates) of "today's"
 * business day — i.e. 06:00 Asia/Manila through 05:59:59.999 the next day.
 * Use this instead of `new Date().setHours(0,0,0,0)` when filtering
 * timestamp columns (e.g. orders.paid_at) so overnight activity before
 * 6 AM still counts as part of the same night, matching business_date.
 */
export function getBusinessDateRange(date: Date = new Date()): { start: Date; end: Date } {
  const businessDate = getBusinessDate(date); // "YYYY-MM-DD", Manila calendar date
  // Explicit +08:00 offset lets JS compute the correct UTC instant regardless
  // of the server's own timezone (Manila has no DST, so the offset is fixed).
  const start = new Date(`${businessDate}T06:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
