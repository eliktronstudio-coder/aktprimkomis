import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export interface AuthedUser {
  db: SupabaseClient
  userId: string
  role: 'admin' | 'engineer' | 'contractor'
}

export async function authenticate(request: Request, env: Env): Promise<AuthedUser | Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error } = await db.auth.getUser(authHeader.slice(7))
  if (error || !user) return json({ error: 'Invalid token' }, 401)

  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return json({ error: 'Profile not found' }, 403)

  return { db, userId: user.id, role: profile.role }
}

// Функции работают с service-ключом (RLS обходится), поэтому права проверяем здесь вручную.
export async function contractorHasItemAccess(
  db: SupabaseClient, userId: string, actId: string, responsible: string,
): Promise<boolean> {
  const { data } = await db
    .from('act_contractors')
    .select('act_id')
    .eq('act_id', actId)
    .eq('user_id', userId)
    .eq('responsible', responsible)
    .maybeSingle()
  return !!data
}

export const PHOTO_BUCKET = 'photos'
