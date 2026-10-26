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
