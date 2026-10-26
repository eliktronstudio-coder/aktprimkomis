-- Единый файл установки: 001 + 002 + 003 + 004. Вставьте целиком в Supabase -> SQL Editor и нажмите Run.

-- ===== 001_initial =====
-- ============================================================
-- Приёмочная комиссия — начальная миграция
-- ============================================================

-- Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'engineer' check (role in ('admin','engineer','contractor')),
  organization text,
  created_at timestamptz default now()
);

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email) values (new.id, new.email);
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Template sections (zones and subsections)
create table template_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('zone','subsection')),
  parent_id uuid references template_sections(id),
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Template items (~238 checklist items)
create table template_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references template_sections(id) on delete cascade,
  number int not null,
  name text not null,
  responsible text not null default 'Ген.подрядчик по СМР',
  is_kz boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Acts (acceptance records)
create table acts (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  store_name text not null,
  acceptance_date date,
  opening_date date,
  last_fix_date date,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Act items (copy of template items per act)
create table act_items (
  id uuid primary key default gen_random_uuid(),
  act_id uuid references acts(id) on delete cascade,
  template_item_id uuid references template_items(id),
  section_id uuid references template_sections(id),
  number int not null,
  name text not null,
  responsible text not null,
  is_kz boolean not null default false,
  sort_order int not null default 0,
  has_defect boolean not null default false,
  defect_status text not null default 'no_defect' check (defect_status in ('no_defect','not_fixed','fixed')),
  note text,
  planned_fix_date date,
  actual_fix_date date,
  fixed_by uuid references profiles(id),
  fixed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Photos
create table photos (
  id uuid primary key default gen_random_uuid(),
  act_id uuid references acts(id) on delete cascade,
  act_item_id uuid references act_items(id) on delete cascade,
  type text not null check (type in ('defect','fixed')),
  file_key text not null,
  thumb_key text not null,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Status history
create table status_history (
  id uuid primary key default gen_random_uuid(),
  act_item_id uuid references act_items(id) on delete cascade,
  from_status text,
  to_status text not null,
  comment text,
  changed_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Commission members
create table commission_members (
  id uuid primary key default gen_random_uuid(),
  act_id uuid references acts(id) on delete cascade,
  role_type text not null check (role_type in ('chairman','member')),
  position text not null,
  full_name text,
  organization text,
  signature_key text,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Act contractors (access control for contractors)
create table act_contractors (
  act_id uuid references acts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  responsible text not null,
  primary key (act_id, user_id)
);

-- ============================================================
-- Helper function: get current user role
-- ============================================================
create or replace function get_my_role()
returns text language sql security definer set search_path = public stable as $$
  select role from profiles where id = auth.uid();
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table profiles enable row level security;
alter table template_sections enable row level security;
alter table template_items enable row level security;
alter table acts enable row level security;
alter table act_items enable row level security;
alter table photos enable row level security;
alter table status_history enable row level security;
alter table commission_members enable row level security;
alter table act_contractors enable row level security;

-- profiles
create policy "profiles_select_own" on profiles for select using (id = auth.uid() or get_my_role() = 'admin');
create policy "profiles_update_own" on profiles for update using (id = auth.uid());
create policy "profiles_insert_trigger" on profiles for insert with check (id = auth.uid());

-- template_sections
create policy "template_sections_select" on template_sections for select using (auth.role() = 'authenticated');
create policy "template_sections_write" on template_sections for all using (get_my_role() = 'admin');

-- template_items
create policy "template_items_select" on template_items for select using (auth.role() = 'authenticated');
create policy "template_items_write" on template_items for all using (get_my_role() = 'admin');

-- acts
create policy "acts_select_admin_engineer" on acts for select using (
  get_my_role() in ('admin','engineer')
);
create policy "acts_select_contractor" on acts for select using (
  get_my_role() = 'contractor' and exists (
    select 1 from act_contractors where act_id = acts.id and user_id = auth.uid()
  )
);
create policy "acts_insert" on acts for insert with check (get_my_role() in ('admin','engineer'));
create policy "acts_update" on acts for update using (get_my_role() in ('admin','engineer'));
create policy "acts_delete" on acts for delete using (get_my_role() = 'admin');

-- act_items
create policy "act_items_select_admin_engineer" on act_items for select using (
  get_my_role() in ('admin','engineer')
);
create policy "act_items_select_contractor" on act_items for select using (
  get_my_role() = 'contractor' and exists (
    select 1 from act_contractors
    where act_id = act_items.act_id and user_id = auth.uid()
    and responsible = act_items.responsible
  )
);
create policy "act_items_insert" on act_items for insert with check (get_my_role() in ('admin','engineer'));
create policy "act_items_update_engineer" on act_items for update using (get_my_role() in ('admin','engineer'));
create policy "act_items_update_contractor" on act_items for update using (
  get_my_role() = 'contractor' and exists (
    select 1 from act_contractors
    where act_id = act_items.act_id and user_id = auth.uid()
    and responsible = act_items.responsible
  )
);

-- photos
create policy "photos_select_admin_engineer" on photos for select using (get_my_role() in ('admin','engineer'));
create policy "photos_select_contractor" on photos for select using (
  get_my_role() = 'contractor' and exists (
    select 1 from act_contractors
    where act_id = photos.act_id and user_id = auth.uid()
  )
);
create policy "photos_insert" on photos for insert with check (
  get_my_role() in ('admin','engineer') or (
    get_my_role() = 'contractor' and exists (
      select 1 from act_contractors where act_id = photos.act_id and user_id = auth.uid()
    )
  )
);
create policy "photos_delete" on photos for delete using (
  get_my_role() in ('admin','engineer') or uploaded_by = auth.uid()
);

-- status_history
create policy "status_history_select_admin_engineer" on status_history for select using (get_my_role() in ('admin','engineer'));
create policy "status_history_select_contractor" on status_history for select using (
  get_my_role() = 'contractor' and exists (
    select 1 from act_items ai
    join act_contractors ac on ac.act_id = ai.act_id and ac.user_id = auth.uid()
    where ai.id = status_history.act_item_id and ac.responsible = ai.responsible
  )
);
create policy "status_history_insert" on status_history for insert with check (auth.role() = 'authenticated');

-- commission_members
create policy "commission_select" on commission_members for select using (auth.role() = 'authenticated');
create policy "commission_write" on commission_members for all using (get_my_role() in ('admin','engineer'));

-- act_contractors
create policy "act_contractors_select" on act_contractors for select using (get_my_role() in ('admin','engineer') or user_id = auth.uid());
create policy "act_contractors_write" on act_contractors for all using (get_my_role() in ('admin','engineer'));

-- ============================================================
-- Auto-update act.status and last_fix_date
-- ============================================================
create or replace function update_act_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_act_id uuid;
  v_all_fixed boolean;
  v_max_date date;
begin
  v_act_id := coalesce(new.act_id, old.act_id);

  select
    bool_and(defect_status = 'fixed' or not has_defect),
    max(case when has_defect then actual_fix_date end)
  into v_all_fixed, v_max_date
  from act_items
  where act_id = v_act_id;

  update acts set
    status = case when v_all_fixed then 'completed' else 'in_progress' end,
    last_fix_date = case when v_all_fixed then v_max_date else null end,
    updated_at = now()
  where id = v_act_id;

  return coalesce(new, old);
end;
$$;

create trigger act_items_status_trigger
  after insert or update or delete on act_items
  for each row execute procedure update_act_status();

-- ============================================================
-- Indexes
-- ============================================================
create index act_items_act_id_idx on act_items(act_id);
create index photos_act_item_id_idx on photos(act_item_id);
create index status_history_act_item_id_idx on status_history(act_item_id);
create index act_contractors_user_id_idx on act_contractors(user_id);

-- ===== 002_security_fixes =====
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

-- ===== 003_act_snapshot =====
-- Акт — самодостаточная копия шаблона: названия зоны/подраздела хранятся в строке акта,
-- поэтому правки и удаления в шаблоне не ломают уже созданные акты.
alter table act_items add column if not exists zone_name text;
alter table act_items add column if not exists subsection_name text;

alter table act_items drop constraint if exists act_items_template_item_id_fkey;
alter table act_items add constraint act_items_template_item_id_fkey
  foreign key (template_item_id) references template_items(id) on delete set null;

alter table act_items drop constraint if exists act_items_section_id_fkey;
alter table act_items add constraint act_items_section_id_fkey
  foreign key (section_id) references template_sections(id) on delete set null;

-- Данные итоговых заключений акта
alter table acts add column if not exists gen_contractor_name text;
alter table acts add column if not exists payment_date date;
alter table acts add column if not exists commissioning_date date;

-- Акт считается завершённым, только если замечания были и все устранены
create or replace function update_act_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_act_id uuid;
  v_defects int;
  v_open int;
  v_max_date date;
begin
  v_act_id := coalesce(new.act_id, old.act_id);

  select
    count(*) filter (where has_defect),
    count(*) filter (where has_defect and defect_status <> 'fixed'),
    max(actual_fix_date) filter (where has_defect and defect_status = 'fixed')
  into v_defects, v_open, v_max_date
  from act_items
  where act_id = v_act_id;

  update acts set
    status = case when v_defects > 0 and v_open = 0 then 'completed' else 'in_progress' end,
    last_fix_date = case when v_defects > 0 and v_open = 0 then v_max_date else null end,
    updated_at = now()
  where id = v_act_id;

  return coalesce(new, old);
end;
$$;

-- ===== 004_storage =====
-- Хранилище фото: публичный бакет (чтение по ссылке), запись только через функцию Cloudflare
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png'];

-- Занятое место в бакете для счётчика в админке (только администратор)
create or replace function get_storage_size()
returns bigint language plpgsql security definer set search_path = public, storage as $$
begin
  if get_my_role() <> 'admin' then
    raise exception 'Только для администратора';
  end if;
  return coalesce((select sum((metadata->>'size')::bigint) from storage.objects where bucket_id = 'photos'), 0);
end;
$$;
