import { r2Client } from './_r2'
import { authenticate, contractorHasItemAccess, json, UUID_RE, type Env } from './_auth'

interface Body {
  actId: string
  actItemId: string
  type: 'defect' | 'fixed' | 'signature'
  isThumb?: boolean
  uuid: string
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authenticate(request, env)
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

  const uploadUrl = await r2Client(env).presignPut(fileKey, type === 'signature' ? 'image/png' : 'image/jpeg')

  return json({ uploadUrl, fileKey })
}
