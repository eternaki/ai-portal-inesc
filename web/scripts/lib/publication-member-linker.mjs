export function repairMojibake(value = '') {
  if (!/[ÃÂ]/.test(value)) return value
  try {
    return Buffer.from(value, 'latin1').toString('utf8')
  } catch {
    return value
  }
}

export function normalizeName(value = '') {
  return repairMojibake(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parts(value = '') {
  return normalizeName(value).split(/\s+/).filter(Boolean)
}

function initial(value = '') {
  return value ? value[0] : ''
}

export function authorAliases(member) {
  const aliases = new Set()
  const names = [member.name, member.fullName, ...(member.aliases ?? [])].filter(Boolean)
  for (const name of names) {
    const repaired = repairMojibake(name)
    aliases.add(normalizeName(repaired))
    const tokens = parts(repaired)
    if (tokens.length >= 2) {
      const first = tokens[0]
      const last = tokens[tokens.length - 1]
      aliases.add(`${first} ${last}`)
      if (tokens.length >= 3) {
        aliases.add(`${first} ${tokens[1]} ${last}`)
        aliases.add(`${first} ${initial(tokens[1])} ${last}`)
      }
      if (tokens.length >= 4) {
        aliases.add(`${first} ${tokens[1]} ${tokens[2]} ${last}`)
        aliases.add(`${first} ${initial(tokens[1])} ${initial(tokens[2])} ${last}`)
      }
    }
  }
  return [...aliases].filter(Boolean)
}

export function buildMemberAliasIndex(members, datasetMembers = []) {
  const fullNameByMemberName = new Map()
  for (const item of datasetMembers) {
    fullNameByMemberName.set(normalizeName(item.name), item)
  }

  const aliasToMembers = new Map()
  for (const member of members) {
    const dataset = fullNameByMemberName.get(normalizeName(member.name))
    const merged = {
      ...member,
      fullName: dataset?.fullName,
      aliases: dataset?.aliases ?? [],
    }
    for (const alias of authorAliases(merged)) {
      if (!aliasToMembers.has(alias)) aliasToMembers.set(alias, [])
      aliasToMembers.get(alias).push(member)
    }
  }
  return aliasToMembers
}

export function matchAuthorToMember(authorName, aliasToMembers) {
  const normalized = normalizeName(authorName)
  const candidates = aliasToMembers.get(normalized) ?? []
  if (candidates.length === 1) {
    return { status: 'matched', member: candidates[0], reason: 'unique alias' }
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      reason: 'multiple members share this author alias',
      candidates: candidates.map((member) => ({ id: member.id, name: member.name })),
    }
  }
  return { status: 'unmatched', reason: 'no unique member alias' }
}

export function summarizeUnmatched(unmatchedRows, limit = 50) {
  const counts = new Map()
  for (const row of unmatchedRows) {
    const name = row.name || '(unknown)'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}
