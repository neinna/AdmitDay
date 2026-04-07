/**
 * Parses a Telegram message text for the /issue command.
 * Returns the issue title if the message starts with "/issue <title>",
 * or null if it does not match.
 */
export function parseIssueCommand(text: string): string | null {
  const match = text.match(/^\/issue\s+(.+)/)
  return match ? match[1].trim() : null
}
