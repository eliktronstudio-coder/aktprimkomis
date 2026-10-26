-- Должность сотрудника (отдельно от роли доступа admin/engineer/contractor)
alter table profiles add column if not exists position text;
