import { authenticate, contractorHasItemAccess, json, PHOTO_BUCKET, serve, UUID_RE } from '../_shared/auth.ts'

serve(async (request) => {
  const auth = await authenticate(request)
  if (auth instanceof Response) return auth
  const { db, userId, role } = auth

  let photoId: string
  try { ({ photoId } = await request.json() as { photoId: string }) } catch { return json({ error: 'Bad request' }, 400) }
  if (typeof photoId !== 'string' || !UUID_RE.test(photoId)) return json({ error: 'Bad id' }, 400)

  const { data: photo } = await db
    .from('photos').select('id, act_id, act_item_id, type, file_key, thumb_key, uploaded_by')
    .eq('id', photoId).maybeSingle()
  if (!photo) return json({ error: 'Photo not found' }, 404)

  if (role === 'contractor') {
    const { data: item } = await db.from('act_items').select('responsible').eq('id', photo.act_item_id).maybeSingle()
    const allowed = item
      && photo.uploaded_by === userId
      && photo.type === 'fixed'
      && await contractorHasItemAccess(db, userId, photo.act_id, item.responsible)
    if (!allowed) return json({ error: 'Forbidden' }, 403)
  }

  const { error: rmErr } = await db.storage.from(PHOTO_BUCKET).remove([photo.file_key, photo.thumb_key].filter(Boolean))
  if (rmErr) return json({ error: rmErr.message }, 502)

  const { error } = await db.from('photos').delete().eq('id', photoId)
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true })
})
