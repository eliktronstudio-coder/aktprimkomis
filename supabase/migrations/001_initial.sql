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
