// One-off local-dev helper: creates an admin user + a service API-key user via
// Payload's Local API (overrideAccess bypasses the adminOnly create rule, which
// is correct here since no user exists yet to grant that access).
// Usage: pnpm payload run scripts/create-service-user.mjs
import config from '../src/payload.config.ts'
import { getPayload } from 'payload'

const payload = await getPayload({ config })

const admin = await payload.create({
  collection: 'users',
  overrideAccess: true,
  data: {
    email: 'admin@mlkd.local',
    password: 'ChangeMe123!',
    role: 'admin',
    name: 'Local Admin',
  },
})
console.log('Created admin user:', admin.email)

const service = await payload.create({
  collection: 'users',
  overrideAccess: true,
  data: {
    email: 'service@mlkd.local',
    password: 'ChangeMe123!',
    role: 'editor',
    name: 'AI Service',
    enableAPIKey: true,
  },
})
console.log('Service user id:', service.id)
console.log('SERVICE_API_KEY=' + service.apiKey)

process.exit(0)
