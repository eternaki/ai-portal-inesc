// Safely set (or reset) an admin password WITHOUT initializing Payload.
//
// We deliberately avoid `payload run` here: booting Payload triggers dev schema
// push, which would try to DROP the AI-owned tables (publication_embeddings,
// topic_map). This script only computes Payload's PBKDF2 hash and writes it via
// plain SQL — no schema introspection, no data loss.
//
// Usage: node scripts/set-admin-password.mjs <email> <password>
// Env:   DATABASE_URL
import { randomBytes, pbkdf2Sync } from 'crypto'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
// pg lives under the Postgres adapter in a pnpm store; resolve it from there.
const pgPath = require.resolve('pg', { paths: [require.resolve('@payloadcms/db-postgres')] })
const { Client } = require(pgPath)

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/set-admin-password.mjs <email> <password>')
  process.exit(1)
}

// Payload's default local auth: PBKDF2(password, salt, 25000, 512, 'sha256').
const salt = randomBytes(32).toString('hex')
const hash = pbkdf2Sync(password, salt, 25000, 512, 'sha256').toString('hex')

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const res = await client.query(
  'UPDATE users SET salt=$1, hash=$2, login_attempts=0, lock_until=NULL WHERE email=$3',
  [salt, hash, email],
)
console.log(res.rowCount ? `Password set for ${email}` : `No user with email ${email}`)
await client.end()
