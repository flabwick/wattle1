/**
 * The single place any ModelProvider should read API keys from — no other file should
 * call process.env directly for model credentials.
 */
export function getCredential(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required credential: ${key}`);
  }
  return value;
}
