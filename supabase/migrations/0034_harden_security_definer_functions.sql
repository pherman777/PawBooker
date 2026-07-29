-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Hardens SECURITY DEFINER functions flagged by Supabase's Security Advisor:
-- pins search_path (prevents search_path-hijacking attacks) and restricts
-- EXECUTE to only the roles that actually need to call each function
-- directly. The four trigger-only functions should never be callable
-- directly by any client role - Postgres invokes triggers internally
-- regardless of these grants, so this doesn't affect their normal behavior.

alter function refresh_groomer_rating() set search_path = public, pg_temp;
revoke execute on function refresh_groomer_rating() from public;
revoke execute on function refresh_groomer_rating() from authenticated;

alter function insert_chat_welcome_message() set search_path = public, pg_temp;
revoke execute on function insert_chat_welcome_message() from public;
revoke execute on function insert_chat_welcome_message() from authenticated;

alter function sync_default_payment_method() set search_path = public, pg_temp;
revoke execute on function sync_default_payment_method() from public;
revoke execute on function sync_default_payment_method() from authenticated;

alter function handle_payment_method_delete() set search_path = public, pg_temp;
revoke execute on function handle_payment_method_delete() from public;
revoke execute on function handle_payment_method_delete() from authenticated;

-- This one IS meant to be called directly (via supabase.rpc) by a signed-in
-- user, so only anon/public access is removed - authenticated keeps it.
alter function register_push_token(text) set search_path = public, pg_temp;
revoke execute on function register_push_token(text) from public;
