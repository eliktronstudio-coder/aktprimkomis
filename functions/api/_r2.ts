import { AwsClient } from 'aws4fetch'
import type { Env } from './_auth'

export function r2Client(env: Env) {
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  })
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}`
  const objectUrl = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`

  return {
    async presignPut(key: string, contentType: string, expiresSec = 900): Promise<string> {
      const url = new URL(objectUrl(key))
      url.searchParams.set('X-Amz-Expires', String(expiresSec))
      const signed = await aws.sign(
        new Request(url, { method: 'PUT', headers: { 'Content-Type': contentType } }),
        { aws: { signQuery: true } },
      )
      return signed.url
    },
    async remove(key: string): Promise<void> {
      const res = await aws.fetch(objectUrl(key), { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`R2 delete ${res.status}`)
    },
    async totalSize(): Promise<{ bytes: number; objects: number }> {
      let bytes = 0, objects = 0, token: string | null = null
      do {
        const url = new URL(base)
        url.searchParams.set('list-type', '2')
        if (token) url.searchParams.set('continuation-token', token)
        const res = await aws.fetch(url.toString())
        if (!res.ok) throw new Error(`R2 list ${res.status}`)
        const xml = await res.text()
        for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) { bytes += Number(m[1]); objects++ }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? null
          : null
      } while (token)
      return { bytes, objects }
    },
  }
}
