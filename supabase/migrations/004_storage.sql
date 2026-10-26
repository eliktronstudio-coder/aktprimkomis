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
