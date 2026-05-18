/**
 * Client-side content moderation for reviews + UGC. Mirrors the server-side
 * is_offensive() Postgres function (supabase/migrations/20260424... and
 * 20260517_is_offensive_word_boundaries.sql) so the client catches the
 * obvious cases before the DB check constraint trips.
 */

// Tokens with substring false-positive risk in normal English / food context.
// Matched with word boundaries — "spicy" / "crappie" / "shiitake" / "Dickens"
// won't trigger.
const BLOCKED_WHOLE_WORDS = [
  // Short profanity / slur abbreviations
  'ass',
  'fag', 'f*g',
  'fggt',
  'fck',
  'kkk',
  'nft',
  'sex', 's*x',
  'xxx',
  // 4-letter slurs / profanity with food/English substring risk
  'spic', 'sp*c',
  'crap',
  'piss',
  'dick', 'd*ck',
  'dyke', 'd*ke',
  'kike', 'k*ke',
  'nazi',
  'nude',
  'shit', 'sh*t',
  'chink', 'ch*nk',
  'beaner',
]

// Tokens safe to substring-match because they're unlikely to appear inside
// innocent English or food words.
const BLOCKED_SUBSTRINGS = [
  // Profanity (longer forms)
  'fuck', 'fucking', 'fucked', 'fucker', 'f*ck',
  'shitty', 'bullshit',
  'asshole', 'a**hole',
  'bitch', 'b*tch',
  'bastard',
  'pissed',
  'cunt', 'c*nt',
  // Slurs (longer forms)
  'nigger', 'nigga', 'n*gger', 'n*gga',
  'faggot', 'f*ggot',
  'retard', 'retarded', 'r*tard',
  'wetback',
  'honky',
  'tranny', 'tr*nny',
  // Hate speech
  'hitler',
  // Spam / scam phrases
  'buy now', 'click here', 'free money',
  'make money fast', 'work from home',
  'bitcoin', 'crypto',
  'www.', 'http://', 'https://',
  '.com', '.net', '.org',
  // Sexual content
  'porn', 'p*rn',
]

/**
 * Check if review text contains blocked content.
 * @param {string} text
 * @returns {boolean}
 */
export function containsBlockedContent(text) {
  if (!text || typeof text !== 'string') return false
  const lower = text.toLowerCase()

  for (const word of BLOCKED_WHOLE_WORDS) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i')
    if (regex.test(lower)) return true
  }
  for (const phrase of BLOCKED_SUBSTRINGS) {
    if (lower.includes(phrase)) return true
  }
  return false
}

/**
 * Validate any user-generated text. Returns an error message if blocked,
 * or null if clean.
 * @param {string} text
 * @param {string} fieldName
 * @returns {string|null}
 */
export function validateUserContent(text, fieldName = 'Content') {
  if (!text?.trim()) return null
  if (containsBlockedContent(text)) {
    return `${fieldName} contains inappropriate content. Please revise.`
  }
  return null
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
