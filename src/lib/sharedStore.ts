// Shared participant list — stored in the GitHub repo as data/participants.json.
// Every visitor READS it (raw CDN, no auth needed). Only the OWNER can WRITE it,
// using a personal access token that is entered in the browser and never
// committed to the repo or bundled into the app.

export const OWNER_REPO = 'whispermmepub/lucky-draw'
const FILE_PATH = 'data/participants.json'

const READ_SOURCES = [
  `https://raw.githubusercontent.com/${OWNER_REPO}/main/${FILE_PATH}`,
  `https://cdn.jsdelivr.net/gh/${OWNER_REPO}@main/${FILE_PATH}`,
]

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

function sanitize(data: unknown): string[] {
  if (!Array.isArray(data)) throw new Error('bad-data')
  return data.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
}

export async function fetchSharedParticipants(): Promise<string[]> {
  const query = `?t=${Date.now()}`
  let lastErr: unknown = null
  for (const base of READ_SOURCES) {
    try {
      const res = await fetch(`${base}${query}`)
      if (!res.ok) throw new Error(`http-${res.status}`)
      return sanitize(await res.json())
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('load-failed')
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Verify a token with the GitHub API and return the owner's username. */
export async function validateOwnerToken(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, ...API_HEADERS },
  })
  if (!res.ok) throw new Error('invalid-token')
  const data: unknown = await res.json()
  const login = (data as { login?: string }).login
  if (!login) throw new Error('invalid-token')
  return login
}

/**
 * Overwrite data/participants.json via the GitHub Contents API.
 * Requires the owner's personal access token (never stored in the repo).
 * Retries on write conflicts (another tab saved at the same time).
 */
export async function saveSharedParticipants(names: string[], token: string): Promise<void> {
  const api = `https://api.github.com/repos/${OWNER_REPO}/contents/${FILE_PATH}`
  const authHeaders = { Authorization: `Bearer ${token}`, ...API_HEADERS }
  const content = toBase64(`${JSON.stringify(names, null, 2)}\n`)

  for (let attempt = 0; attempt < 4; attempt++) {
    // 1) Read the current file so we can get its sha (GitHub requires it for updates).
    const getRes = await fetch(api, { headers: authHeaders })
    let sha: string | null = null
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

    // 2) Write the new content.
    const body: Record<string, string> = {
      message: 'Update lucky draw participants',
      content,
    }
    if (sha) body.sha = sha
    const putRes = await fetch(api, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (putRes.ok) return
    if (putRes.status === 409 || putRes.status === 422) continue // conflict — re-read and retry
    if (putRes.status === 401 || putRes.status === 403) throw new Error('auth-failed')
    throw new Error('save-failed')
  }
  throw new Error('save-failed')
}
