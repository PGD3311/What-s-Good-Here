/**
 * Pure parsing for photo-moderate's model output. Kept separate from index.ts
 * so it can be unit-tested hermetically (no Deno.serve, no network).
 */

export type DishMatch = 'likely' | 'unclear' | 'contradicts'

export interface ModerationResult {
  is_food_photo: boolean
  is_unsafe: boolean
  reason: string
  /** How the photo relates to the dish the user is attaching it to.
   *  'contradicts' is the only value the client acts on, and it only ever
   *  prompts — it never rejects. Defaults to 'unclear' when no dish context
   *  was supplied or the model's answer is missing/invalid. */
  dish_match: DishMatch
  /** Short plain-language description of the food visible ("sushi rolls"),
   *  used in the prompt: "This looks like sushi rolls, not Whole Belly Clams." */
  seen: string
}

export function failClosed(reason: string): ModerationResult {
  return { is_food_photo: false, is_unsafe: true, reason, dish_match: 'unclear', seen: '' }
}

const DISH_MATCH_VALUES: DishMatch[] = ['likely', 'unclear', 'contradicts']

/** Parse the raw text returned by the model. Returns null when no JSON object
 *  can be found or parsed — the caller fails closed on null. */
export function parseModeration(raw: string): ModerationResult | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
  const dishMatch = DISH_MATCH_VALUES.includes(parsed.dish_match as DishMatch)
    ? (parsed.dish_match as DishMatch)
    : 'unclear'
  return {
    is_food_photo: parsed.is_food_photo === true,
    is_unsafe: parsed.is_unsafe === true,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
    dish_match: dishMatch,
    seen: typeof parsed.seen === 'string' ? parsed.seen.trim().slice(0, 60) : '',
  }
}

export interface DishContext {
  dishName: string
  category: string
  restaurantName: string
}

/** Sanitize the optional dish context from the request body. Strings only,
 *  length-capped so a caller can't stuff the prompt. */
export function readDishContext(body: Record<string, unknown>): DishContext | null {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const dishName = s(body.dish_name, 120)
  if (!dishName) return null
  return {
    dishName,
    category: s(body.category, 60),
    restaurantName: s(body.restaurant_name, 120),
  }
}
