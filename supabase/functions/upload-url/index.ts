import { authenticate, contractorHasItemAccess, json, PHOTO_BUCKET, serve, UUID_RE } from '../_shared/auth.ts'

interface Body {
  actId: string
  actItemId: string
  type: 'defect' | 'fixed' | 'signature'
  isThumb?: boolean
  uuid: string
}

serve(async (request) => {
  const auth = await authenticate(request)
  if (auth instanceof Response) return auth
  const { db, userId, role } = auth

  let body: Body
  try { body = await request.json() } catch { return json({ error: 'Bad request' }, 400) }
  const { actId, actItemId, type, isThumb, uuid } = body

  if (![actId, actItemId, uuid].every(v => typeof v === 'string' && UUID_RE.test(v))) {
    return json({ error: 'Bad ids' }, 400)
  }
  if (!['defect', 'fixed', 'signature'].includes(type)) return json({ error: 'Bad type' }, 400)

  let fileKey: string

  if (type === 'signature') {
    if (role === 'contractor') return json({ error: 'Forbidden' }, 403)
    const { data: member } = await db
      .from('commission_members').select('id').eq('id', actItemId).eq('act_id', actId).maybeSingle()
    if (!member) return json({ error: 'Member not found in act' }, 404)
    fileKey = `acts/${actId}/signatures/${actItemId}_${uuid}.png`
  } else {
    const { data: item } = await db
      .from('act_items').select('id, responsible').eq('id', actItemId).eq('act_id', actId).maybeSingle()
    if (!item) return json({ error: 'Item not found in act' }, 404)

    if (role === 'contractor') {
      if (type !== 'fixed') return json({ error: 'Подрядчик может загружать только фото устранения' }, 403)
      if (!(await contractorHasItemAccess(db, userId, actId, item.responsible))) {
        return json({ error: 'No access to this item' }, 403)
      }
    }
    fileKey = `acts/${actId}/${actItemId}/${type}/${uuid}${isThumb ? '_thumb' : ''}.jpg`
  }

  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUploadUrl(fileKey)
  if (error || !data) return json({ error: error?.message ?? 'Не удалось создать ссылку загрузки' }, 502)

  return json({ fileKey, token: data.token })
})
