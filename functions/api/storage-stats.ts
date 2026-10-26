import { authenticate, json, type Env } from './_auth'
import { r2Client } from './_r2'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authenticate(request, env)
  if (auth instanceof Response) return auth
  if (auth.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  try {
    const { bytes, objects } = await r2Client(env).totalSize()
    return json({ used_bytes: bytes, used_gb: bytes / 1024 ** 3, objects })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
}
