import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  detectBentoBox,
  parseSchemaOrgMenuItems,
  findBentoMenuTabUrls,
  dedupeBentoItems,
  serializeBentoItems,
  buildBentoBoxMenuText,
  classifyMenuGroups,
  type BentoMenuItem,
} from './bentobox.ts'

const menu = (name: string, itemCount: number) => ({ name, itemCount })

const item = (o: Partial<BentoMenuItem> & { name: string; section: string }): BentoMenuItem => ({
  price: null, description: null, sourceMenu: '', ...o,
})

const MENU_LD = (sections: string) =>
  `<html><head>
   <script type="application/ld+json">
   {"@context":"https://schema.org","@type":"Menu","hasMenuSection":[${sections}]}
   </script></head><body>shell</body></html>`

Deno.test('detectBentoBox matches getbento hosts', () => {
  assertEquals(detectBentoBox('<script src="https://theme-assets.getbento.com/x/bentobox.min.js"></script>'), true)
  assertEquals(detectBentoBox('<img src="https://images.getbento.com/accounts/abc.png">'), true)
  assertEquals(detectBentoBox('<html>plain squarespace site</html>'), false)
})

Deno.test('parseSchemaOrgMenuItems pulls name + price + description', () => {
  const html = MENU_LD(`
    {"@type":"MenuSection","name":"Starters","hasMenuItem":[
      {"@type":"MenuItem","name":"Clam Chowder","description":"potato, bacon","offers":{"@type":"Offer","price":"14.00"}},
      {"@type":"MenuItem","name":"Crispy Clams","offers":{"price":"MKT"}}
    ]}
  `)
  const items = parseSchemaOrgMenuItems(html)
  assertEquals(items.length, 2)
  assertEquals(items[0], { section: 'Starters', name: 'Clam Chowder', price: 14, description: 'potato, bacon', sourceMenu: '' })
  // "MKT" coerces to null price; no description -> null
  assertEquals(items[1], { section: 'Starters', name: 'Crispy Clams', price: null, description: null, sourceMenu: '' })
})

Deno.test('parseSchemaOrgMenuItems handles offers array + nested sections', () => {
  const html = MENU_LD(`
    {"@type":"MenuSection","name":"Raw Bar","hasMenuSection":[
      {"@type":"MenuSection","name":"Oysters","hasMenuItem":[
        {"@type":"MenuItem","name":"Wellfleet","offers":[{"price":"3.50"},{"price":"4.00"}]}
      ]}
    ]}
  `)
  const items = parseSchemaOrgMenuItems(html)
  assertEquals(items.length, 1)
  assertEquals(items[0].section, 'Oysters') // nearest named section wins
  assertEquals(items[0].price, 3.5) // first usable offer price
})

Deno.test('parseSchemaOrgMenuItems finds Menu nested under Restaurant -> hasMenu', () => {
  // Common schema.org shape: the Menu is not top-level, it hangs off a
  // Restaurant (or @graph / mainEntity). The walker must recurse to find it.
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Restaurant","name":"X","hasMenu":{
      "@type":"Menu","hasMenuSection":[
        {"@type":"MenuSection","name":"Mains","hasMenuItem":[
          {"@type":"MenuItem","name":"Steak","offers":{"price":"42.00"}}
        ]}
      ]}}
  </script>`
  const items = parseSchemaOrgMenuItems(html)
  assertEquals(items.length, 1)
  assertEquals(items[0], { section: 'Mains', name: 'Steak', price: 42, description: null, sourceMenu: '' })
})

Deno.test('parseSchemaOrgMenuItems finds Menu inside @graph', () => {
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"Organization","name":"X"},
      {"@type":"Menu","hasMenuSection":[
        {"@type":"MenuSection","name":"S","hasMenuItem":[{"@type":"MenuItem","name":"Foo","offers":{"price":"5"}}]}
      ]}
    ]}
  </script>`
  const items = parseSchemaOrgMenuItems(html)
  assertEquals(items.map(i => i.name), ['Foo'])
})

Deno.test('parseSchemaOrgMenuItems matches ld+json type with charset suffix', () => {
  const html = `<script type="application/ld+json; charset=utf-8">
    {"@type":"Menu","hasMenuSection":[
      {"@type":"MenuSection","name":"S","hasMenuItem":[{"@type":"MenuItem","name":"Bar","offers":{"price":"7"}}]}
    ]}
  </script>`
  assertEquals(parseSchemaOrgMenuItems(html).map(i => i.name), ['Bar'])
})

Deno.test('parseSchemaOrgMenuItems handles @type array containing Menu', () => {
  const html = MENU_LD(`{"@type":"MenuSection","name":"S","hasMenuItem":[{"@type":"MenuItem","name":"Z"}]}`)
    .replace('"@type":"Menu"', '"@type":["Menu","CreativeWork"]')
  assertEquals(parseSchemaOrgMenuItems(html).map(i => i.name), ['Z'])
})

Deno.test('findBentoMenuTabUrls tolerates uppercase + underscore slugs', () => {
  const html = `<a href="/menu/All_Day/">A</a><a href="/menu/late-night/">B</a>`
  const urls = findBentoMenuTabUrls(html, 'https://x.com/menus/', 8)
  assertEquals(urls.sort(), ['https://x.com/menu/All_Day/', 'https://x.com/menu/late-night/'])
})

Deno.test('parseSchemaOrgMenuItems is resilient to junk', () => {
  // String items, missing names, malformed JSON-LD blocks must not throw.
  const html = `<html>
    <script type="application/ld+json">{ not valid json </script>
    <script type="application/ld+json">{"@type":"Menu","hasMenuSection":[
      {"@type":"MenuSection","name":"X","hasMenuItem":["a string item",{"@type":"MenuItem"},{"@type":"MenuItem","name":"Real"}]}
    ]}</script>
    <script type="application/ld+json">{"@type":"Organization","name":"Not a menu"}</script>
  </html>`
  const items = parseSchemaOrgMenuItems(html)
  assertEquals(items.map(i => i.name), ['Real'])
})

Deno.test('parseSchemaOrgMenuItems decodes entities + strips html in descriptions', () => {
  const html = MENU_LD(`{"@type":"MenuSection","name":"S","hasMenuItem":[
    {"@type":"MenuItem","name":"Mac &amp; Cheese","description":"<b>aged</b> cheddar&nbsp;/ panko"}
  ]}`)
  const items = parseSchemaOrgMenuItems(html)
  assertEquals(items[0].name, 'Mac & Cheese')
  assertEquals(items[0].description, 'aged cheddar / panko')
})

Deno.test('findBentoMenuTabUrls returns same-origin /menu/<slug>/ links, deduped + capped', () => {
  const html = `
    <a href="/menu/all-day/">All Day</a>
    <a href="https://x.com/menu/brunch/">Brunch</a>
    <a href="https://evil.com/menu/steal/">offsite</a>
    <a href="/menu/all-day/">dupe</a>
    <a href="/about/">not a menu</a>`
  const urls = findBentoMenuTabUrls(html, 'https://x.com/boston-menus/', 8)
  assertEquals(urls.sort(), ['https://x.com/menu/all-day/', 'https://x.com/menu/brunch/'])
})

Deno.test('dedupeBentoItems keeps first by (section|name), case-insensitive', () => {
  const deduped = dedupeBentoItems([
    item({ section: 'S', name: 'Foo', price: 1 }),
    item({ section: 's', name: 'foo', price: 2, description: 'later' }),
    item({ section: 'S', name: 'Bar', price: 3 }),
  ])
  assertEquals(deduped.length, 2)
  assertEquals(deduped[0].price, 1) // first wins
})

Deno.test('serializeBentoItems groups by section with prices + descriptions', () => {
  const text = serializeBentoItems([
    item({ section: 'Starters', name: 'Chowder', price: 14, description: 'potato, bacon' }),
    item({ section: 'Starters', name: 'Clams' }),
  ])
  assertEquals(
    text,
    'SECTION: Starters\n- Chowder — $14.00 — potato, bacon\n- Clams',
  )
})

Deno.test('parseSchemaOrgMenuItems: unnamed section falls back to the tab name', () => {
  // BentoBox course-tab pattern: an "Appetizers" Menu with one UNNAMED section.
  // The items should get section "Appetizers" (the tab name), not "Menu".
  const html = `<script type="application/ld+json">{"@type":"Menu","name":"Appetizers","hasMenuSection":[
    {"@type":"MenuSection","hasMenuItem":[{"@type":"MenuItem","name":"Mozzarella Sticks","offers":{"price":"12"}}]}
  ]}</script>`
  const items = parseSchemaOrgMenuItems(html)
  assertEquals(items[0].section, 'Appetizers')
  assertEquals(items[0].sourceMenu, 'Appetizers')
})

Deno.test('parseSchemaOrgMenuItems captures the source Menu name', () => {
  const html = `<script type="application/ld+json">{"@type":"Menu","name":"Brunch","hasMenuSection":[
    {"@type":"MenuSection","name":"Eggs","hasMenuItem":[{"@type":"MenuItem","name":"Benedict","offers":{"price":"18"}}]}
  ]}</script>`
  assertEquals(parseSchemaOrgMenuItems(html)[0].sourceMenu, 'Brunch')
})

Deno.test('classifyMenuGroups: Saltie — All Day main + Brunch pill, drinks/courses fold', () => {
  const res = classifyMenuGroups([
    menu('All Day', 40), menu('Brunch', 36),
    menu('Caviar', 11), menu('Cocktails', 10), menu('Dessert', 4),
  ])!
  assertEquals(res.order, ['All Day', 'Brunch'])
  assertEquals(res.groupOf.get('Caviar'), 'All Day')    // course-ish food → fold
  assertEquals(res.groupOf.get('Cocktails'), 'All Day')  // drink → fold
  assertEquals(res.groupOf.get('Dessert'), 'All Day')    // course → fold
  assertEquals(res.groupOf.get('Brunch'), 'Brunch')      // meal service → pill
})

Deno.test('classifyMenuGroups: main = largest FOOD menu by items', () => {
  const res = classifyMenuGroups([menu('Brunch', 12), menu('Menu', 40)])!
  assertEquals(res.order, ['Menu', 'Brunch']) // Menu bigger → main, listed first
})

Deno.test('classifyMenuGroups: drink menus never pill (Landfall: Wines/Dinner → flat)', () => {
  assertEquals(classifyMenuGroups([menu('Wines', 60), menu('Dinner', 40)]), null)
})

Deno.test('classifyMenuGroups: course-tabs fold into one flat menu (Capo-style)', () => {
  assertEquals(classifyMenuGroups([menu('Antipasti', 10), menu('Entrees', 40), menu('Dessert', 5)]), null)
})

Deno.test('classifyMenuGroups: multi-meal restaurant pills each meal (Loco/Lincoln-style)', () => {
  const res = classifyMenuGroups([
    menu('Drinks', 40), menu('Lunch', 20), menu('Dinner', 30),
    menu('Brunch', 15), menu('Wine', 25), menu('Happy Hour', 10),
  ])!
  assertEquals(res.order, ['Dinner', 'Lunch', 'Brunch', 'Happy Hour']) // Dinner largest → main
  assertEquals(res.groupOf.get('Drinks'), 'Dinner') // drink → fold
  assertEquals(res.groupOf.get('Wine'), 'Dinner')   // drink → fold
})

Deno.test('classifyMenuGroups: <2 groups → null (single flat menu)', () => {
  assertEquals(classifyMenuGroups([menu('Menu', 50), menu('Cocktails', 10), menu('Dessert', 4)]), null)
  assertEquals(classifyMenuGroups([menu('Menu', 40)]), null)
})

Deno.test('classifyMenuGroups: unnamed menu never pills (no blank GROUP label)', () => {
  const res = classifyMenuGroups([menu('All Day', 40), menu('Brunch', 36), menu('', 20)])!
  assertEquals(res.order, ['All Day', 'Brunch']) // no '' entry
  assertEquals(res.groupOf.get(''), 'All Day')
})

Deno.test('serializeBentoItems emits GROUP markers when grouped', () => {
  const text = serializeBentoItems([
    item({ section: 'Starters', name: 'Chowder', price: 14, group: 'All Day' }),
    item({ section: 'Brunch Specials', name: 'Benedict', price: 18, group: 'Brunch' }),
  ], ['All Day', 'Brunch'])
  assertEquals(text,
    'GROUP: All Day\nSECTION: Starters\n- Chowder — $14.00\n\nGROUP: Brunch\nSECTION: Brunch Specials\n- Benedict — $18.00')
})

Deno.test('buildBentoBoxMenuText: tags items with groups + main-first dedup', async () => {
  // Two substantial menus (3 sections each → pills). Both list "Crudo / Tuna"
  // (shared) → it lands in All Day (main) only; Brunch shows its exclusives.
  const sec = (name: string, dish: string, price: string) =>
    `{"@type":"MenuSection","name":"${name}","hasMenuItem":[{"@type":"MenuItem","name":"${dish}","offers":{"price":"${price}"}}]}`
  const hub = `<script type="application/ld+json">[
    {"@type":"Menu","name":"All Day","hasMenuSection":[
      ${sec('Crudo', 'Tuna', '24')}, ${sec('Starters', 'Chowder', '14')}, ${sec('Mains', 'Lobster Roll', '34')}
    ]},
    {"@type":"Menu","name":"Brunch","hasMenuSection":[
      ${sec('Crudo', 'Tuna', '24')}, ${sec('Brunch Specials', 'Benedict', '18')}, ${sec('Eggs', 'Omelette', '19')}
    ]}
  ]</script>`
  const res = await buildBentoBoxMenuText({ rawHtml: hub, menuUrl: 'https://x.com/menus/', fetchHtml: async () => '' })
  assertEquals(res!.groupOrder, ['All Day', 'Brunch'])
  assertEquals(res!.itemCount, 5) // 3 All Day + 2 Brunch-exclusive (Tuna deduped)
  assertEquals(res!.sectionGroups['Brunch Specials'], 'Brunch')
  assertEquals(res!.sectionGroups['Crudo'], 'All Day') // shared → main
  // Tuna appears once, under All Day's GROUP (before the Brunch GROUP marker)
  assertEquals(res!.text.indexOf('GROUP: Brunch') > res!.text.indexOf('Tuna'), true)
})

Deno.test('buildBentoBoxMenuText uses hub JSON-LD without crawling tabs', async () => {
  const hub = MENU_LD(`{"@type":"MenuSection","name":"Big","hasMenuItem":[
    ${Array.from({ length: 12 }, (_, i) => `{"@type":"MenuItem","name":"D${i}","offers":{"price":"${i + 1}.00"}}`).join(',')}
  ]}`)
  let fetched = 0
  const res = await buildBentoBoxMenuText({
    rawHtml: hub,
    menuUrl: 'https://x.com/boston-menus/',
    fetchHtml: async () => { fetched++; return '' },
  })
  assertEquals(res?.itemCount, 12)
  assertEquals(res?.pagesUsed, 1)
  assertEquals(fetched, 0) // 12 > threshold(10), so no tab crawl
})

Deno.test('buildBentoBoxMenuText augments a thin single-tab page from siblings', async () => {
  const tabPage = `<a href="/menu/desserts/">Desserts</a>` + MENU_LD(`{"@type":"MenuSection","name":"All Day","hasMenuItem":[
    {"@type":"MenuItem","name":"Only One","offers":{"price":"9.00"}}
  ]}`)
  const sibling = MENU_LD(`{"@type":"MenuSection","name":"Desserts","hasMenuItem":[
    {"@type":"MenuItem","name":"Cookie","offers":{"price":"8.00"}},
    {"@type":"MenuItem","name":"Tiramisu","offers":{"price":"16.00"}}
  ]}`)
  const res = await buildBentoBoxMenuText({
    rawHtml: tabPage,
    menuUrl: 'https://x.com/menu/all-day/',
    fetchHtml: async (url) => (url === 'https://x.com/menu/desserts/' ? sibling : ''),
  })
  assertEquals(res?.itemCount, 3) // 1 from tab + 2 from sibling
  assertEquals(res?.pagesUsed, 2)
})

Deno.test('buildBentoBoxMenuText with crawlTabs:false never fetches siblings (generic JSON-LD)', async () => {
  const tabPage = `<a href="/menu/desserts/">Desserts</a>` + MENU_LD(`{"@type":"MenuSection","name":"All Day","hasMenuItem":[
    {"@type":"MenuItem","name":"Only One","offers":{"price":"9.00"}}
  ]}`)
  let fetched = 0
  const res = await buildBentoBoxMenuText({
    rawHtml: tabPage,
    menuUrl: 'https://x.com/menu/all-day/',
    fetchHtml: async () => { fetched++; return '' },
    crawlTabs: false,
  })
  assertEquals(res?.itemCount, 1) // only the page's own JSON-LD
  assertEquals(fetched, 0) // no sibling crawl for non-BentoBox sites
})

Deno.test('buildBentoBoxMenuText returns null when no menu JSON-LD exists', async () => {
  const res = await buildBentoBoxMenuText({
    rawHtml: '<html><script type="application/ld+json">{"@type":"Organization"}</script></html>',
    menuUrl: 'https://x.com/menu/',
    fetchHtml: async () => '',
  })
  assertEquals(res, null)
})
