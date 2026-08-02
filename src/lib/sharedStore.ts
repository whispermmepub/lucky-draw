// Shared participant list — stored in a public JSON blob that every visitor
// reads, and the owner (PIN-gated UI) updates. Live-synced by polling.

const BLOB_URL = 'https://jsonblob.com/api/jsonBlob/019fc49c-059d-7a5f-bfa3-16b7293366ab'

export async function fetchSharedParticipants(): Promise<string[]> {
  const res = await fetch(`${BLOB_URL}?t=${Date.now()}`)
  if (!res.ok) throw new Error('load-failed')
  const data: unknown = await res.json()
  if (!Array.isArray(data)) throw new Error('bad-data')
  return data.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
}

export async function saveSharedParticipants(names: string[]): Promise<void> {
  const res = await fetch(BLOB_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(names),
  })
  if (!res.ok) throw new Error('save-failed')
}
