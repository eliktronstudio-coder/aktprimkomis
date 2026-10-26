import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PHOTO_BUCKET = 'photos'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export interface AuthedUser {
  db: SupabaseClient
  userId: string
  role: 'admin' | 'engineer' | 'contractor'
}

export async function authenticate(request: Request): Promise<AuthedUser | Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
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

export function serve(handler: (request: Request) => Promise<Response>) {
  Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    return handler(request)
  })
}
