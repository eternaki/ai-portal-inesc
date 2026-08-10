import crypto from 'node:crypto'
import config from '../src/payload.config.ts'
import { getPayload } from 'payload'

const payload = await getPayload({ config })
const apiKey = crypto.randomBytes(32).toString('hex')

await payload.update({
  collection: 'users',
  id: 2,
  overrideAccess: true,
  data: { enableAPIKey: true, apiKey },
})

console.log('SERVICE_API_KEY=' + apiKey)
process.exit(0)
