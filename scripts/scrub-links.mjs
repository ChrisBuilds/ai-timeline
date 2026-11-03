// Finds and removes links to private Claude sessions, project threads and
// conversations. Used by .github/workflows/scrub-links.yml. Plain links to
// https://claude.ai/code (the product page) are left alone.

const PRIVATE_PATH = String.raw`(?:code/session_[A-Za-z0-9_-]+|code/project/[^\s)\]>"']+|project/[^\s)\]>"']+|chat/[^\s)\]>"']+|share/[^\s)\]>"']+)`
const URL = String.raw`https?://(?:www\.)?claude\.ai/${PRIVATE_PATH}`

const has = new RegExp(URL, 'i')

/** True if the text contains a private Claude link. */
export function hasPrivateLink(text) {
  return has.test(text ?? '')
}

const SAFE = 'https://claude.ai/code'

/** Returns the text with private Claude links removed. */
export function scrub(text) {
  if (!text) return text
  let out = text
  // Whole lines that are only a link, or a trailer such as "Claude-Session: <link>".
  out = out.replace(new RegExp(String.raw`^[ \t]*(?:[\w-]+:[ \t]*)?<?${URL}>?[ \t]*\r?\n?`, 'gim'), '')
  // Markdown links that name a thread, session or conversation are dropped along
  // with a leading " · " separator. Other markdown links keep their text and point
  // to the product page instead.
  out = out.replace(new RegExp(String.raw`([ \t]*·[ \t]*)?\[([^\]]*)\]\(${URL}\)`, 'gi'), (_m, sep, label) =>
    /thread|session|conversation|chat/i.test(label) ? '' : `${sep ?? ''}[${label}](${SAFE})`,
  )
  // Anything left, such as a link in the middle of a sentence.
  out = out.replace(new RegExp(URL, 'gi'), SAFE)
  return out
}
