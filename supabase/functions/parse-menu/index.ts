import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const VALID_CATEGORIES = [
  'pizza', 'burger', 'taco', 'wings', 'sushi', 'breakfast',
  'breakfast sandwich', 'lobster roll', 'chowder', 'pasta', 'steak',
  'sandwich', 'salad', 'seafood', 'fish', 'tendys', 'fried chicken',
  'apps', 'fries', 'entree', 'dessert', 'donuts', 'pokebowl',
  'asian', 'chicken', 'quesadilla', 'soup',
  'ribs', 'sides', 'duck', 'lamb', 'pork', 'clams',
  'oysters', 'coffee', 'cocktails', 'ice cream', 'beer',
]

const MENU_EXTRACTION_PROMPT = `You are a menu data extraction assistant for a food discovery app.

Given raw menu text from a restaurant, extract every food AND drink item and return structured JSON.

## Category Vocabulary (use ONLY these exact IDs)

| Category ID | Use For |
|---|---|
| pizza | Pizza |
| burger | Burgers |
| taco | Tacos, burritos, quesadillas |
| wings | Wings |
| sushi | Sushi, sashimi, rolls |
| breakfast | Breakfast plates, waffles, pancakes, eggs |
| breakfast sandwich | Breakfast sandwiches, breakfast burritos |
| lobster roll | Lobster rolls specifically |
| chowder | Clam chowder, any chowder |
| pasta | Pasta, risotto |
| steak | Steak entrees |
| sandwich | Sandwiches, wraps, BLTs, clubs, grilled cheese, hot dogs |
| salad | Salads |
| seafood | Seafood entrees (salmon, cod, swordfish, shellfish, crab cakes). NOT lobster roll, NOT chowder |
| fish | Fish & chips, fish sandwiches, fish tacos — casual/fried fish items |
| oysters | Oysters (raw bar, oyster plates) |
| clams | Clam dishes (steamers, stuffed clams, clam strips) |
| tendys | Chicken tenders |
| fried chicken | Fried chicken sandwiches, fried chicken plates |
| apps | Appetizers, starters, shareable plates |
| fries | Fries, onion rings, tater tots |
| sides | Non-fries side dishes: vegetables, rice, beans, coleslaw |
| entree | Other entrees that don't fit a specific category |
| ribs | Ribs |
| pork | Pork entrees |
| lamb | Lamb entrees |
| duck | Duck entrees |
| chicken | Chicken entrees (not fried chicken, not tenders) |
| dessert | Cakes, pies, ice cream, brownies, sundaes |
| donuts | Donuts, fritters |
| pokebowl | Poke bowls |
| asian | Asian entrees (pad thai, curry, stir-fry) |
| soup | Soups (non-chowder) |
| cocktails | Cocktails, mixed drinks, signature drinks |
| coffee | Coffee drinks, espresso, lattes |
| ice cream | Ice cream, gelato, frozen treats, milkshakes |
| beer | Craft beer, beer flights, specialty brews |
| quesadilla | Quesadillas |

## Rules

1. **Include cocktails, coffee, beer, and specialty drinks** — these are important categories
2. **Skip generic beverages** — no soda, no plain water/juice, no wine by the glass lists
3. **Skip condiment-level items under ~$4** — extra sauce, bread roll, etc.
4. **Include substantive sides $4+**
5. **Deduplicate sizes** — keep only the larger/dinner version
6. **Use exact dish names from the menu**
7. **Prices must be numbers** (no $ sign). If range, use lower price. If no price, use null.
8. **One category per dish** — pick the most specific match

## Output Format

Return ONLY valid JSON (no markdown):
{
  "dishes": [
    { "name": "Dish Name", "category": "category_id", "price": 18.00 }
  ]
}`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const { text, restaurant_name } = await req.json()

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Menu text is too short or missing' }), {
        status: 400,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Truncate to ~8000 chars to stay within token limits
    const truncatedText = text.slice(0, 8000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `Restaurant: ${restaurant_name || 'Unknown'}\n\nMenu text:\n${truncatedText}`,
          },
        ],
        system: MENU_EXTRACTION_PROMPT,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      return new Response(JSON.stringify({ error: `AI parsing failed: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()
    const responseText = data.content?.[0]?.text || '{}'

    // Parse JSON from response, handling possible markdown wrapping
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ dishes: [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const parsed = JSON.parse(jsonMatch[0])
    const dishes = Array.isArray(parsed.dishes) ? parsed.dishes : []

    // Validate and clean each dish
    const cleanDishes = dishes
      .filter((d: { name?: string; category?: string }) => d.name && typeof d.name === 'string')
      .map((d: { name: string; category?: string; price?: number | null }) => ({
        name: d.name.trim(),
        category: VALID_CATEGORIES.includes(d.category?.toLowerCase() || '') ? d.category!.toLowerCase() : 'entree',
        price: typeof d.price === 'number' && d.price > 0 ? d.price : null,
      }))

    return new Response(JSON.stringify({ dishes: cleanDishes }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('parse-menu error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
