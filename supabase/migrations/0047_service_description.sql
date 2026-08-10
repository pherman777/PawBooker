-- Optional description of what a service includes, shown to customers when they
-- browse a salon's services. Handy for a full-service groom; unnecessary for
-- something self-explanatory like a nail trim.
alter table groomer_services add column if not exists description text;
