-- Groomer self-service: let a groomer manage their own salon from the app.
--
-- Until now every groomers / groomer_services row was seeded via SQL, so the
-- only policies were public SELECT. That left the entire groomer-facing side of
-- the product unreachable in-app (the App Store 5.6 "hidden features" flag).
-- These policies let an authenticated groomer create/edit their own listing,
-- prices, and hours directly.

-- Services: full CRUD, scoped to salons the caller owns.
create policy "Groomers insert their own services" on groomer_services
  for insert to authenticated
  with check (
    exists (
      select 1 from groomers g
      where g.id = groomer_services.groomer_id and g.user_id = auth.uid()
    )
  );

create policy "Groomers update their own services" on groomer_services
  for update to authenticated
  using (
    exists (
      select 1 from groomers g
      where g.id = groomer_services.groomer_id and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from groomers g
      where g.id = groomer_services.groomer_id and g.user_id = auth.uid()
    )
  );

create policy "Groomers delete their own services" on groomer_services
  for delete to authenticated
  using (
    exists (
      select 1 from groomers g
      where g.id = groomer_services.groomer_id and g.user_id = auth.uid()
    )
  );

-- Salon profile: a groomer may update only their own row...
create policy "Groomers update their own salon" on groomers
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ...and only these presentation/contact columns. Plan, Stripe identifiers,
-- ratings, and deactivation stay server-managed: our edge functions write them
-- with the service-role key, which bypasses both RLS and these column grants,
-- so a client can never grant itself Pro, fake a rating, or reassign ownership.
revoke update on groomers from authenticated;
grant update (
  name, avatar_url, bio, address, zip_code, latitude, longitude,
  city, state, phone, email, hours, timezone
) on groomers to authenticated;
