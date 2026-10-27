-- UID hashes are scoped to the importing owner; null remains valid for manual items.
alter table public.items add column import_uid text check(import_uid is null or import_uid ~ '^[0-9a-f]{64}$');
alter table public.items add constraint items_owner_import_uid_key unique(owner_id,import_uid);
