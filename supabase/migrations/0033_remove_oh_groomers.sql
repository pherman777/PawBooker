-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Removes the original Ohio seed groomers entirely. This cascades (via
-- existing "on delete cascade" foreign keys) to their groomer_services,
-- bookings, booking_line_items, salon_reviews, chat_threads/chat_messages,
-- and groomer_notifications. Confirmed before running: 21 bookings and 2
-- reviews attached to these three groomers will be permanently deleted.

delete from groomers where state = 'OH';
