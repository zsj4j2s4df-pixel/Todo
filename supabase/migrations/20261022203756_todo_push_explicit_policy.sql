-- Explicit client deny, in addition to revoked privileges and an unexposed schema.
create policy push_jobs_no_client_access on private.push_jobs for all to anon,authenticated using(false) with check(false);
