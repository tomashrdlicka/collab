import keytar from 'keytar'

const SERVICE_NAME = 'collab-md'
const ACCOUNT_TOKEN = 'github-token'
const ACCOUNT_USER = 'user-info'

export interface StoredUser {
  id: string
  username: string
}

/**
 * Store the GitHub token in the macOS Keychain
 */
export async function storeToken(token: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_TOKEN, token)
}

/**
 * Get the GitHub token from the Keychain
 */
export async function getToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, ACCOUNT_TOKEN)
}

/**
 * Remove the token from the Keychain
 */
export async function removeToken(): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, ACCOUNT_TOKEN)
}

/**
 * Store user info
 */
export async function storeUser(user: StoredUser): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_USER, JSON.stringify(user))
}

/**
 * Get stored user info
 */
export async function getUser(): Promise<StoredUser | null> {
  const data = await keytar.getPassword(SERVICE_NAME, ACCOUNT_USER)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

/**
 * Remove user info
 */
export async function removeUser(): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, ACCOUNT_USER)
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken()
  return token !== null
}
