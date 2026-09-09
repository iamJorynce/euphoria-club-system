-- ============================================================================
-- Migration 0007: Add RECEPTIONIST role
-- Receptionist handles the door: checks guests in on the Guestlist, collects
-- the entrance fee (a lightweight POS-only flow, no product cart), and
-- assigns tables. Kept as its own migration because a new enum value cannot
-- be referenced by other statements in the same transaction it is added in.
-- ============================================================================

alter type user_role add value 'RECEPTIONIST';
