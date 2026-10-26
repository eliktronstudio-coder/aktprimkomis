-- Исправления безопасности: роли, права подрядчика, история, фото, комиссия

-- ============================================================
-- profiles: нельзя самому себе выдать роль; профили создаёт только триггер
-- ============================================================
drop policy if exists "profiles_insert_trigger" on profiles;
drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;

create policy "profiles_select" on profiles for select using (
  id = auth.uid() or get_my_role() in ('admin','engineer')
);
create policy "profiles_update_own" on profiles for update using (id = auth.uid());
create policy "profiles_update_admin" on profiles for update using (get_my_role() = 'admin');

create or replace function protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and coalesce(get_my_role(), '') <> 'admin'
     and auth.uid() is not null then
    raise exception 'Менять роль может только администратор';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_role on profiles;
create trigger profiles_protect_role before update on profiles
  for each row execute procedure protect_profile_role();

-- ============================================================
-- act_items: подрядчик меняет только статус устранения; правила статусов на сервере
-- ============================================================
create or replace function guard_act_item_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := get_my_role();
begin
  if auth.uid() is null then
    return new; -- служебные операции (service role)
  end if;

  if v_role = 'contractor' then
    if new.act_id is distinct from old.act_id
       or new.template_item_id is distinct from old.template_item_id
       or new.section_id is distinct from old.section_id
       or new.number is distinct from old.number
       or new.name is distinct from old.name
       or new.responsible is distinct from old.responsible
       or new.is_kz is distinct from old.is_kz
       or new.has_defect is distinct from old.has_defect
       or new.note is distinct from old.note
       or new.planned_fix_date is distinct from old.planned_fix_date then
      raise exception 'Подрядчик может менять только статус устранения';
    end if;
    if new.defect_status = 'no_defect' and old.defect_status <> 'no_defect' then
      raise exception 'Подрядчик не может снять замечание';
    end if;
    if new.defect_status = 'not_fixed' and old.defect_status = 'fixed' then
      raise exception 'Вернуть замечание в работу может только инженер';
    end if;
  end if;

  if new.has_defect = false then
    new.defect_status := 'no_defect';
    new.actual_fix_date := null;
    new.fixed_by := null;
    new.fixed_at := null;
  elsif new.defect_status = 'no_defect' then
    new.defect_status := 'not_fixed';
  end if;

  if new.defect_status = 'fixed' and old.defect_status is distinct from 'fixed' then
    if not exists (select 1 from photos where act_item_id = new.id and type = 'fixed') then
      raise exception 'Нельзя отметить замечание устранённым без фото устранения';
    end if;
    new.fixed_by := auth.uid();
    new.fixed_at := now();
    new.actual_fix_date := coalesce(new.actual_fix_date, current_date);
  elsif new.defect_status = 'not_fixed' and old.defect_status = 'fixed' then
    new.actual_fix_date := null;
    new.fixed_by := null;
    new.fixed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists act_items_guard on act_items;
create trigger act_items_guard before update on act_items
  for each row execute procedure guard_act_item_update();

-- ============================================================
-- photos: подрядчик грузит только «устранено» по своим пунктам
-- ============================================================
drop policy if exists "photos_select_contractor" on photos;
drop policy if exists "photos_insert" on photos;
drop policy if exists "photos_delete" on photos;

create policy "photos_select_contractor" on photos for select using (
  get_my_role() = 'contractor' and exists (select 1 from act_items ai where ai.id = photos.act_item_id)
);
create policy "photos_insert" on photos for insert with check (
  uploaded_by = auth.uid() and exists (
    select 1 from act_items ai where ai.id = photos.act_item_id and ai.act_id = photos.act_id
  ) and (
    get_my_role() in ('admin','engineer')
    or (get_my_role() = 'contractor' and photos.type = 'fixed')
  )
);
create policy "photos_delete" on photos for delete using (
  get_my_role() in ('admin','engineer')
  or (uploaded_by = auth.uid() and exists (select 1 from act_items ai where ai.id = photos.act_item_id))
);

-- ============================================================
-- status_history: писать можно только по видимым пунктам и только от своего имени
-- ============================================================
drop policy if exists "status_history_insert" on status_history;
create policy "status_history_insert" on status_history for insert with check (
  changed_by = auth.uid() and exists (select 1 from act_items ai where ai.id = status_history.act_item_id)
);

-- ============================================================
-- commission_members: читать только по доступным актам
-- ============================================================
drop policy if exists "commission_select" on commission_members;
create policy "commission_select" on commission_members for select using (
  exists (select 1 from acts a where a.id = commission_members.act_id)
);

-- ============================================================
-- Размер базы для счётчика в админке (только администратор)
-- ============================================================
create or replace function get_db_size()
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() <> 'admin' then
    raise exception 'Только для администратора';
  end if;
  return pg_database_size(current_database());
end;
$$;
