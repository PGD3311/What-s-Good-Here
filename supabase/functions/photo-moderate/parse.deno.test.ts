import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { parseModeration, readDishContext, failClosed } from './parse.ts'

Deno.test('parseModeration: full answer with dish match', () => {
  const r = parseModeration('{"is_food_photo":true,"is_unsafe":false,"reason":"Looks good!","dish_match":"contradicts","seen":"sushi rolls with tuna sashimi"}')
  assertEquals(r?.is_food_photo, true)
  assertEquals(r?.is_unsafe, false)
  assertEquals(r?.dish_match, 'contradicts')
  assertEquals(r?.seen, 'sushi rolls with tuna sashimi')
})

Deno.test('parseModeration: missing or invalid dish_match falls back to unclear (never blocks)', () => {
  assertEquals(parseModeration('{"is_food_photo":true,"is_unsafe":false,"reason":"ok"}')?.dish_match, 'unclear')
  assertEquals(parseModeration('{"is_food_photo":true,"is_unsafe":false,"reason":"ok","dish_match":"nope"}')?.dish_match, 'unclear')
  assertEquals(parseModeration('{"is_food_photo":true,"is_unsafe":false,"reason":"ok","seen":42}')?.seen, '')
})

Deno.test('parseModeration: tolerates prose around the JSON, returns null on garbage', () => {
  assertEquals(parseModeration('Sure! {"is_food_photo":true,"is_unsafe":false,"reason":"ok"} done')?.is_food_photo, true)
  assertEquals(parseModeration('no json here'), null)
  assertEquals(parseModeration('{"broken":'), null)
})

Deno.test('parseModeration: caps seen at 60 chars and reason at 200', () => {
  const r = parseModeration(JSON.stringify({ is_food_photo: true, is_unsafe: false, reason: 'x'.repeat(300), seen: 'y'.repeat(100) }))
  assertEquals(r?.reason.length, 200)
  assertEquals(r?.seen.length, 60)
})

Deno.test('failClosed: unsafe, and dish_match is unclear so an outage never prompts about the dish', () => {
  const r = failClosed('down')
  assertEquals(r.is_unsafe, true)
  assertEquals(r.dish_match, 'unclear')
})

Deno.test('readDishContext: requires dish_name, caps lengths, ignores non-strings', () => {
  assertEquals(readDishContext({}), null)
  assertEquals(readDishContext({ dish_name: 42 }), null)
  const c = readDishContext({ dish_name: '  Whole Belly Clams ', category: 'seafood', restaurant_name: "Nancy's" })
  assertEquals(c, { dishName: 'Whole Belly Clams', category: 'seafood', restaurantName: "Nancy's" })
  assertEquals(readDishContext({ dish_name: 'a'.repeat(500) })?.dishName.length, 120)
})
