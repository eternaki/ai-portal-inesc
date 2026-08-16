import assert from 'node:assert/strict'
import test from 'node:test'

// The lib is TypeScript; node:test runs the compiled-free subset we care about by
// importing through the same path alias the app uses. Keep these tests to pure
// functions so no transpile step or network is needed.
const { authorizationUrl, profilePatch, SCOPES } = await import('../../src/lib/linkedin.ts')

test('authorization URL carries the scopes that return a picture and email', () => {
  const url = new URL(
    authorizationUrl({ clientId: 'abc', redirectUri: 'https://site/cb', state: 'n1' }),
  )
  assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/oauth/v2/authorization')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_id'), 'abc')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://site/cb')
  assert.equal(url.searchParams.get('state'), 'n1')
  // `profile` is what makes LinkedIn return the photo at all.
  assert.deepEqual(url.searchParams.get('scope').split(' '), [...SCOPES])
})

test('only fills fields the member profile is missing', () => {
  const profile = { sub: '1', name: 'Ana Casimiro', email: 'ana@example.com' }
  assert.deepEqual(profilePatch(profile, { name: null, email: null }), {
    name: 'Ana Casimiro',
    email: 'ana@example.com',
  })
})

test('never overwrites a name or email an editor already set', () => {
  const profile = { sub: '1', name: 'Ana C.', email: 'personal@gmail.com' }
  const patch = profilePatch(profile, { name: 'Ana Casimiro', email: 'ana@tecnico.pt' })
  assert.deepEqual(patch, {})
})

test('imports an email when the profile has a name but no address', () => {
  const profile = { sub: '1', name: 'Ana C.', email: 'ana@example.com' }
  const patch = profilePatch(profile, { name: 'Ana Casimiro', email: null })
  assert.deepEqual(patch, { email: 'ana@example.com' })
})

test('tolerates a LinkedIn response with no email or name', () => {
  assert.deepEqual(profilePatch({ sub: '1' }, { name: null, email: null }), {})
})
