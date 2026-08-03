// Shared data — stored in the GitHub repo as JSON files:
//   - data/participants.json  (the participant list)
//   - data/winners.json       (the winner history)
// Every visitor READS them (raw CDN, no auth needed). Only the OWNER can WRITE
// them, using a personal access token entered in the browser and never
// committed to the repo or bundled into the app.

export const OWNER_REPO = 'whispermmepub/lucky-draw'
const PARTICIPANTS_PATH = 'data/participants.json'
const WINNERS_PATH = 'data/winners.json'

export interface SharedWinner {
  name: string
  timestamp: string
  date: string
}

// jsDelivr (Cloudflare) first — usually the most reachable CDN — then GitHub raw.
const READ_BASES = [
  `https://cdn.jsdelivr.net/gh/${OWNER_REPO}@main`,
  `https://raw.githubusercontent.com/${OWNER_REPO}/main`,
]

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

// Cache of the last-known file sha per path, so consecutive saves can skip the
// read-before-write round trip (faster on slow networks).
const shaCache = new Map<string, string>()

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const query = `?t=${Date.now()}`
  let lastErr: unknown = null
  for (const base of READ_BASES) {
    try {
      const res = await fetchWithTimeout(`${base}/${path}${query}`, {}, 6000)
      if (!res.ok) throw new Error(`http-${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('load-failed')
}

export async function fetchSharedParticipants(): Promise<string[]> {
  const data = await fetchJson(PARTICIPANTS_PATH)
  if (!Array.isArray(data)) throw new Error('bad-data')
  return data.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
}

export async function fetchSharedWinners(): Promise<SharedWinner[]> {
  const data = await fetchJson(WINNERS_PATH)
  if (!Array.isArray(data)) throw new Error('bad-data')
  return data.filter(
    (w): w is SharedWinner =>
      typeof w === 'object' &&
      w !== null &&
      typeof (w as SharedWinner).name === 'string' &&
      typeof (w as SharedWinner).timestamp === 'string' &&
      typeof (w as SharedWinner).date === 'string',
  )
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Verify a token with the GitHub API and return the owner's username. */
export async function validateOwnerToken(token: string): Promise<string> {
  const res = await fetchWithTimeout(
    'https://api.github.com/user',
    { headers: { Authorization: `Bearer ${token}`, ...API_HEADERS } },
    10000,
  )
  if (!res.ok) throw new Error('invalid-token')
  const data: unknown = await res.json()
  const login = (data as { login?: string }).login
  if (!login) throw new Error('invalid-token')
  return login
}

/**
 * Overwrite a JSON file in the repo via the GitHub Contents API.
 * Requires the owner's personal access token (never stored in the repo).
 * Retries on write conflicts (another tab saved at the same time).
 */
async function writeRepoFile(path: string, contentStr: string, token: string): Promise<void> {
  const api = `https://api.github.com/repos/${OWNER_REPO}/contents/${path}`
  const authHeaders = { Authorization: `Bearer ${token}`, ...API_HEADERS }
  const content = toBase64(contentStr)

  let sha: string | null = shaCache.get(path) ?? null
  for (let attempt = 0; attempt < 4; attempt++) {
    // Read the current sha only when we don't have a cached one.
    if (sha === null) {
      const getRes = await fetchWithTimeout(api, { headers: authHeaders }, 10000)
      if (getRes.status === 404) {
        sha = null // file doesn't exist yet — create it
      } else if (getRes.ok) {
        const meta = (await getRes.json()) as { sha?: string }
        sha = meta.sha ?? null
      } else if (getRes.status === 401 || getRes.status === 403) {
        throw new Error('auth-failed')
      } else {
        throw new Error('read-failed')
      }
    }

    const body: Record<string, string> = {
      message: `Update ${path.split('/').pop()}`,
      content,
    }
    if (sha) body.sha = sha
    const putRes = await fetchWithTimeout(
      api,
      {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      10000,
    )
    if (putRes.ok) {
      try {
        const meta = (await putRes.json()) as { content?: { sha?: string } }
        if (meta.content?.sha) shaCache.set(path, meta.content.sha)
      } catch {
        // response parsing failed — keep old cache, next write will just retry
      }
      return
    }
    if (putRes.status === 409 || putRes.status === 422) {
      sha = null // conflict — force re-read on next attempt
      continue
    }
    if (putRes.status === 401 || putRes.status === 403) throw new Error('auth-failed')
    throw new Error('save-failed')
  }
  throw new Error('save-failed')
}

export function saveSharedParticipants(names: string[], token: string): Promise<void> {
  return writeRepoFile(PARTICIPANTS_PATH, `${JSON.stringify(names, null, 2)}\n`, token)
}

export function saveSharedWinners(winners: SharedWinner[], token: string): Promise<void> {
  return writeRepoFile(WINNERS_PATH, `${JSON.stringify(winners, null, 2)}\n`, token)
}
