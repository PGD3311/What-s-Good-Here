import { describe, expect, it } from 'vitest'
import { discoverMenuCandidates, findMenuIframes, findSubMenuPages, isBlockedHostname, isKnownMenuIframeHost, scoreCandidate } from './menu-candidates.ts'

describe('scoreCandidate', () => {
  it('positive: menu in URL', () => {
    expect(scoreCandidate('https://x.com/menu.pdf').score).toBeGreaterThan(0)
  })

  it('positive: dinner in URL', () => {
    expect(scoreCandidate('https://x.com/dinner-menu.png').score).toBeGreaterThan(8)
  })

  it('negative: beverage cancels menu', () => {
    expect(scoreCandidate('https://x.com/beverage-menu.pdf').score).toBeLessThan(0)
  })

  it('negative: drinks alone is negative', () => {
    expect(scoreCandidate('https://x.com/drinks.pdf').score).toBeLessThan(0)
  })

  it('negative: gift card is strongly negative', () => {
    expect(scoreCandidate('https://x.com/gift-card.pdf').score).toBeLessThan(-5)
  })

  it('negative: logo image filtered', () => {
    expect(scoreCandidate('https://x.com/logo.png', 'site logo').score).toBeLessThan(0)
  })

  it('decodes URL-encoded paths so filename keywords still score', () => {
    const url = 'https://media-cdn.getbento.com/accounts/abc/media/CLy6aXCpTZ6Z87bGaqWr_Dinner%20Menu%20-%20Digital.png'
    expect(scoreCandidate(url).score).toBeGreaterThan(8)
  })

  it('uses anchor text context for plain URLs', () => {
    expect(scoreCandidate('https://x.com/123.png', 'Click here for our dinner menu').score).toBeGreaterThan(8)
  })

  it('returns 0 with no signal in URL or context', () => {
    expect(scoreCandidate('https://x.com/abc123.png', 'some random thing').score).toBe(0)
  })

  it('alt-text "drinks menu" stays negative', () => {
    expect(scoreCandidate('https://x.com/x.png', 'drinks menu').score).toBeLessThan(0)
  })
})

describe('discoverMenuCandidates', () => {
  it('returns empty for HTML with no asset links', () => {
    const html = '<html><body><h1>Hello</h1></body></html>'
    expect(discoverMenuCandidates(html, 'https://x.com/')).toEqual([])
  })

  it('finds <a href> PDFs and scores them', () => {
    const html = '<a href="/dinner-menu.pdf">Dinner</a>'
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('pdf')
    expect(out[0].url).toBe('https://x.com/dinner-menu.pdf')
    expect(out[0].score).toBeGreaterThan(0)
  })

  it('finds <img src> PNGs and scores by alt text', () => {
    const html = '<img src="/abc.png" alt="Dinner Menu">'
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('image')
    expect(out[0].score).toBeGreaterThan(0)
  })

  it('filters out negative-score candidates (beverage menus)', () => {
    const html = `
      <a href="/dinner.pdf">Dinner Menu</a>
      <a href="/beverages.pdf">Beverage Menu</a>
    `
    const out = discoverMenuCandidates(html, 'https://x.com/')
    const urls = out.map(c => c.url)
    expect(urls).toContain('https://x.com/dinner.pdf')
    expect(urls).not.toContain('https://x.com/beverages.pdf')
  })

  it('sorts by descending score', () => {
    const html = `
      <a href="/menu.pdf">Menu</a>
      <a href="/dinner-menu.pdf">Dinner Menu</a>
    `
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out[0].url).toBe('https://x.com/dinner-menu.pdf')
    expect(out[1].url).toBe('https://x.com/menu.pdf')
  })

  it('deduplicates URLs found by multiple selectors', () => {
    const html = `
      <a href="/menu.pdf">Menu</a>
      <link rel="prefetch" href="/menu.pdf">
    `
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out.filter(c => c.url === 'https://x.com/menu.pdf')).toHaveLength(1)
  })

  it('Shy Bird real-world: image food menus outscore beverage PDF', () => {
    const html = `
      <a href="https://media-cdn.getbento.com/accounts/abc/media/yGGY2X4eQHG1mz1l441A_Dinner%20Menu%20-%20Digital.png">Dinner</a>
      <a href="https://media-cdn.getbento.com/accounts/abc/media/0hW3PfLyTSGLoZnhYcC0_Lunch%20-%20Digital.png">Lunch</a>
      <a href="https://media-cdn.getbento.com/accounts/abc/media/8VYcmfBrThSgH1GvgO9Y_Breakfast%20-%20Digital.png">Breakfast</a>
      <a href="https://media-cdn.getbento.com/accounts/abc/media/vmoiHQlDQJak4Cn6RUXr_Brunch%20Menu%20-%20Digital.png">Brunch</a>
      <a href="https://media-cdn.getbento.com/accounts/abc/media/C1MEz39SP6vj2niFa3h3_SBSB%20Beverage%20Menu%202025.pdf">Beverage</a>
    `
    const out = discoverMenuCandidates(html, 'https://www.shybird.com/menus')
    // Beverage PDF is filtered out (negative score)
    expect(out.find(c => c.url.includes('Beverage'))).toBeUndefined()
    // Image food menus all score positive
    const images = out.filter(c => c.type === 'image')
    expect(images.length).toBe(4)
    expect(images.every(c => c.score > 0)).toBe(true)
  })

  it('absolutizes relative URLs', () => {
    const html = '<a href="files/menu.pdf">Menu</a>'
    const out = discoverMenuCandidates(html, 'https://x.com/about/')
    expect(out[0].url).toBe('https://x.com/about/files/menu.pdf')
  })

  it('ignores non-pdf/non-image links (CSS, JS, HTML pages)', () => {
    const html = `
      <link href="/menu.css">
      <script src="/menu.js"></script>
      <a href="/menu">Menu Page</a>
    `
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('handles srcset by capturing every URL with shared alt context', () => {
    const html = '<img srcset="/dinner-menu-320w.png 320w, /dinner-menu-640w.png 640w" alt="Dinner Menu">'
    const out = discoverMenuCandidates(html, 'https://x.com/')
    const urls = out.filter(c => c.type === 'image').map(c => c.url)
    expect(urls).toContain('https://x.com/dinner-menu-320w.png')
    expect(urls).toContain('https://x.com/dinner-menu-640w.png')
  })

  it('handles data-src with alt context from same img tag', () => {
    // Hash-only filename — only the alt carries the menu signal
    const html = '<img data-src="/abc123.png" src="placeholder.gif" alt="Dinner Menu">'
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out.some(c => c.url === 'https://x.com/abc123.png' && c.score > 0)).toBe(true)
  })

  it('regression: opaque PDF URLs (no keyword) still pass the filter', () => {
    // Old code took every PDF except obvious negatives — preserve that recall.
    const html = '<a href="/wp-content/uploads/abc-83fa.pdf">Download</a>'
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('pdf')
    expect(out[0].score).toBe(0)
  })

  it('opaque image URLs (no keyword) are dropped (vision cost)', () => {
    const html = '<img src="/abc123.png" alt="">'
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('preserves query strings on signed URLs', () => {
    const html = '<object data="/menu.pdf?token=abc&exp=123" type="application/pdf"></object>'
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out.some(c => c.url === 'https://x.com/menu.pdf?token=abc&exp=123')).toBe(true)
  })

  it('strongly negative PDFs are still dropped', () => {
    const html = `
      <a href="/dinner.pdf">Dinner Menu</a>
      <a href="/giftcard.pdf">Gift Card Form</a>
      <a href="/allergens.pdf">Allergens</a>
    `
    const out = discoverMenuCandidates(html, 'https://x.com/')
    const urls = out.map(c => c.url)
    expect(urls).toContain('https://x.com/dinner.pdf')
    expect(urls).not.toContain('https://x.com/giftcard.pdf')
    expect(urls).not.toContain('https://x.com/allergens.pdf')
  })

  it('legal/HR PDFs are dropped (matches old extractPdfMenuUrls reject set)', () => {
    const html = `
      <a href="/privacy-policy.pdf">Privacy</a>
      <a href="/terms-of-service.pdf">Terms</a>
      <a href="/job-application.pdf">Apply</a>
      <a href="/employment-contract.pdf">Contract</a>
      <a href="/liability-waiver.pdf">Waiver</a>
      <a href="/house-rules.pdf">Rules</a>
    `
    const out = discoverMenuCandidates(html, 'https://x.com/')
    expect(out.map(c => c.url)).toEqual([])
  })

  // Menu-context fallback for neutral-score images (Port Hunter case)
  it('promotes neutral-score image when on /menu page and no scored image exists', () => {
    const html = '<img src="https://cdn.x.com/Screen+Shot+2025-05-20.png">'
    const out = discoverMenuCandidates(html, 'https://x.com/menu')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://cdn.x.com/Screen+Shot+2025-05-20.png')
    expect(out[0].score).toBe(0)
  })

  it('does NOT promote neutral-score image when NOT on a menu page', () => {
    const html = '<img src="https://cdn.x.com/Screen+Shot+2025-05-20.png">'
    const out = discoverMenuCandidates(html, 'https://x.com/about')
    expect(out).toEqual([])
  })

  it('does NOT promote any image when one ALREADY scored above zero', () => {
    const html = `
      <img src="https://cdn.x.com/dinner-menu.png">
      <img src="https://cdn.x.com/Screen+Shot+2025-05-20.png">
    `
    const out = discoverMenuCandidates(html, 'https://x.com/menu')
    expect(out.map(c => c.url)).toEqual(['https://cdn.x.com/dinner-menu.png'])
  })

  it('promotes only the TOP neutral image, not multiples (caps vision budget)', () => {
    const html = `
      <img src="https://cdn.x.com/photo1.jpg">
      <img src="https://cdn.x.com/photo2.jpg">
      <img src="https://cdn.x.com/photo3.jpg">
    `
    const out = discoverMenuCandidates(html, 'https://x.com/menu')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://cdn.x.com/photo1.jpg')
  })

  it('negative-keyword image (logo) is NOT promoted by the fallback', () => {
    const html = '<img src="https://cdn.x.com/site-logo.png">'
    const out = discoverMenuCandidates(html, 'https://x.com/menu')
    expect(out).toEqual([])
  })

  it('cancellation-to-zero image (positive + negative) is NOT promoted', () => {
    // 'menu' (+5) + 'food' (+3) + 'giftcards' (-8) = 0 BUT a negative keyword
    // fired. Don't promote — it's a gift card menu image, not a food menu.
    const html = '<img src="https://cdn.x.com/menu-food-giftcards.png">'
    const out = discoverMenuCandidates(html, 'https://x.com/menu')
    expect(out).toEqual([])
  })

  it('does NOT fire neutral-image fallback when ANY PDF candidate exists', () => {
    // PDF is cheaper per token and more likely the actual menu. Leave the
    // image alone — extractor will fall through to text/sub-page if PDF fails.
    const html = `
      <a href="/uploads/menu-83fa.pdf">Menu</a>
      <img src="https://cdn.x.com/Screen+Shot.png">
    `
    const out = discoverMenuCandidates(html, 'https://x.com/menu')
    expect(out.map(c => c.url)).toEqual(['https://x.com/uploads/menu-83fa.pdf'])
  })
})

describe('findSubMenuPages', () => {
  it('finds /brunch /lunch /dinner /breakfast nav links', () => {
    const html = `
      <nav>
        <a href="/brunch">Brunch</a>
        <a href="/lunch">Lunch</a>
        <a href="/dinner">Dinner</a>
        <a href="/breakfast">Breakfast</a>
      </nav>
    `
    const out = findSubMenuPages(html, 'https://otwnantucket.com/menu')
    expect(out).toEqual([
      'https://otwnantucket.com/brunch',
      'https://otwnantucket.com/lunch',
      'https://otwnantucket.com/dinner',
      'https://otwnantucket.com/breakfast',
    ])
  })

  it('matches /brunch-menu and /our-dinner', () => {
    const html = `
      <a href="/brunch-menu">Brunch Menu</a>
      <a href="/our-dinner">Dinner</a>
    `
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toContain('https://x.com/brunch-menu')
    expect(out).toContain('https://x.com/our-dinner')
  })

  it('skips false positives like /brunch-recipes /lunch-club', () => {
    const html = `
      <a href="/brunch-recipes">Recipes</a>
      <a href="/lunch-club">Lunch Club</a>
    `
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('skips external links (different origin)', () => {
    const html = `
      <a href="/brunch">Internal</a>
      <a href="https://other.com/dinner">External</a>
    `
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual(['https://x.com/brunch'])
  })

  it('skips self-links (the page we are already fetching)', () => {
    const html = '<a href="/menu">Menu</a><a href="/dinner">Dinner</a>'
    const out = findSubMenuPages(html, 'https://x.com/menu')
    expect(out).toEqual(['https://x.com/dinner'])
  })

  it('skips self-links even when the link has a different query/hash', () => {
    const html = '<a href="/menu?tab=dinner">Dinner Tab</a><a href="/menu#brunch">Brunch Anchor</a><a href="/lunch">Lunch</a>'
    const out = findSubMenuPages(html, 'https://x.com/menu')
    expect(out).toEqual(['https://x.com/lunch'])
  })

  it('caps at max (default 4)', () => {
    const html = `
      <a href="/brunch">B</a>
      <a href="/lunch">L</a>
      <a href="/dinner">D</a>
      <a href="/breakfast">Bk</a>
      <a href="/menu-1">M1</a>
      <a href="/menu-2">M2</a>
    `
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toHaveLength(4)
  })

  it('dedupes URLs that differ only by query/hash', () => {
    const html = '<a href="/brunch?ref=nav">B1</a><a href="/brunch#section">B2</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual(['https://x.com/brunch'])
  })

  it('returns empty when no menu nav links exist', () => {
    const html = '<a href="/about">About</a><a href="/contact">Contact</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('matches anchor text "Menu" on non-conventional URL (Farm Neck case)', () => {
    const html = '<a href="/Default.aspx?p=dynamicmodule&pageid=164">Menu</a>'
    const out = findSubMenuPages(html, 'https://www.farmneck.net/cafe')
    expect(out).toEqual(['https://www.farmneck.net/Default.aspx?p=dynamicmodule&pageid=164'])
  })

  it('preserves query string for anchor-text-matched URLs', () => {
    const html = '<a href="/page?id=42">Lunch</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual(['https://x.com/page?id=42'])
  })

  it('still drops query string for path-matched URLs', () => {
    const html = '<a href="/lunch?ref=nav">Lunch</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual(['https://x.com/lunch'])  // path match strips query
  })

  it('anchor text "Lunch Club" does NOT match (not a menu link)', () => {
    const html = '<a href="/programs/lunch-program">Lunch Club</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('anchor text "Drinks Menu" rejected by negative-text disqualifier', () => {
    const html = '<a href="/Default.aspx?p=drinks">Drinks Menu</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('anchor text "Catering Menu" rejected by negative-text disqualifier', () => {
    const html = '<a href="/Default.aspx?p=catering">Catering Menu</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('anchor text "Lunch & Dinner" matches (multi-meal nav)', () => {
    const html = '<a href="/Default.aspx?p=all">Lunch & Dinner</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual(['https://x.com/Default.aspx?p=all'])
  })

  it('does not follow PDF/image links as sub-pages (handled by candidate discovery)', () => {
    const html = '<a href="/lunch-menu.pdf">Lunch Menu</a><a href="/menu.png">Menu</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual([])
  })

  it('treats ASPX-style URLs with different query strings as DIFFERENT pages', () => {
    // When the base URL has a non-conventional path (Default.aspx), query
    // string is treated as load-bearing — /Default.aspx?p=200 is NOT a
    // self-link to /Default.aspx?p=164.
    const html = '<a href="/Default.aspx?p=200">Lunch Menu</a>'
    const out = findSubMenuPages(html, 'https://x.com/Default.aspx?p=164')
    expect(out).toEqual(['https://x.com/Default.aspx?p=200'])
  })

  it('skips ASPX self-link when query string matches exactly', () => {
    const html = '<a href="/Default.aspx?p=164">Menu</a>'
    const out = findSubMenuPages(html, 'https://x.com/Default.aspx?p=164')
    expect(out).toEqual([])
  })

  it('decodes &amp; in anchor text so multi-meal nav still matches', () => {
    const html = '<a href="/page?type=combo">Lunch &amp; Dinner</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual(['https://x.com/page?type=combo'])
  })

  it('disqualifies "Drinks Menu" even when URL path matches /menu', () => {
    const html = '<a href="/drinks-menu">Drinks Menu</a>'
    const out = findSubMenuPages(html, 'https://x.com/')
    expect(out).toEqual([])
  })
})

describe('findMenuIframes', () => {
  it('catches the State Road / checkle.menu pattern (protocol-relative)', () => {
    const html = '<iframe id="menuFrame" src="//checkle.menu/stateroadrestaurant?embed=true"></iframe>'
    expect(findMenuIframes(html)).toEqual([
      'https://checkle.menu/stateroadrestaurant?embed=true',
    ])
  })

  it('catches iframes by known menu-service host (popmenu, singleplatform, toast)', () => {
    const html = `
      <iframe src="https://popmenu.com/restaurants/foo/menu"></iframe>
      <iframe src="https://www.singleplatform.com/bar/menu"></iframe>
      <iframe src="https://order.toasttab.com/online/baz"></iframe>
    `
    const out = findMenuIframes(html, 5)
    expect(out).toContain('https://popmenu.com/restaurants/foo/menu')
    expect(out).toContain('https://www.singleplatform.com/bar/menu')
    expect(out).toContain('https://order.toasttab.com/online/baz')
  })

  it('catches iframes by "menu" keyword in src even when host is unknown', () => {
    const html = '<iframe src="https://unknown-cms.example/restaurant/menu"></iframe>'
    expect(findMenuIframes(html)).toEqual(['https://unknown-cms.example/restaurant/menu'])
  })

  it('skips iframes that are clearly not menus (ads, maps, video)', () => {
    const html = `
      <iframe src="https://www.google.com/maps/embed?q=foo"></iframe>
      <iframe src="https://www.youtube.com/embed/abc"></iframe>
      <iframe src="https://googletagmanager.com/ns.html?id=GTM-XYZ"></iframe>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('caps results at max', () => {
    const html = `
      <iframe src="https://a.com/menu"></iframe>
      <iframe src="https://b.com/menu"></iframe>
      <iframe src="https://c.com/menu"></iframe>
    `
    expect(findMenuIframes(html, 2).length).toBe(2)
  })

  it('dedupes identical iframe srcs', () => {
    const html = `
      <iframe src="https://checkle.menu/foo"></iframe>
      <iframe src="https://checkle.menu/foo"></iframe>
    `
    expect(findMenuIframes(html)).toEqual(['https://checkle.menu/foo'])
  })

  it('ignores javascript: and other non-http schemes', () => {
    const html = `
      <iframe src="javascript:void(0)"></iframe>
      <iframe src="about:blank"></iframe>
      <iframe src="data:text/html,foo"></iframe>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('returns empty when there are no iframes at all', () => {
    expect(findMenuIframes('<p>no iframes here</p>')).toEqual([])
  })

  it('ignores iframe-shaped strings inside <script> tags (no smuggling)', () => {
    const html = `
      <script>
        const trap = '<iframe src="http://169.254.169.254/menu"></iframe>';
      </script>
      <p>nothing else</p>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('ignores iframe-shaped strings inside HTML comments', () => {
    const html = `<!-- <iframe src="https://checkle.menu/foo"></iframe> -->`
    expect(findMenuIframes(html)).toEqual([])
  })

  it('ignores iframe-shaped strings inside <style> and <noscript>', () => {
    const html = `
      <style>/* <iframe src="https://checkle.menu/foo"></iframe> */</style>
      <noscript><iframe src="https://popmenu.com/menu"></iframe></noscript>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('blocks SSRF: loopback (127.0.0.1, localhost, ::1)', () => {
    const html = `
      <iframe src="http://127.0.0.1/menu"></iframe>
      <iframe src="http://localhost/menu"></iframe>
      <iframe src="http://[::1]/menu"></iframe>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('blocks SSRF: cloud metadata (169.254.169.254)', () => {
    const html = '<iframe src="http://169.254.169.254/menu"></iframe>'
    expect(findMenuIframes(html)).toEqual([])
  })

  it('blocks SSRF: RFC1918 private ranges', () => {
    const html = `
      <iframe src="http://10.0.0.5/menu"></iframe>
      <iframe src="http://172.16.0.1/menu"></iframe>
      <iframe src="http://172.31.255.254/menu"></iframe>
      <iframe src="http://192.168.1.1/menu"></iframe>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('blocks SSRF: .local / .internal hostnames', () => {
    const html = `
      <iframe src="http://service.local/menu"></iframe>
      <iframe src="http://api.internal/menu"></iframe>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('keyword fallback matches pathname only — not query string', () => {
    const html = '<iframe src="https://cdn.example.com/siteimage.png?menu=footer"></iframe>'
    expect(findMenuIframes(html)).toEqual([])
  })

  it('keyword fallback matches pathname only — not asset extensions', () => {
    // No "menu" substring at a word boundary in the pathname here, so this
    // should be rejected (path = /assets/footer.png, no menu word).
    const html = '<iframe src="https://cdn.example.com/assets/footer.png"></iframe>'
    expect(findMenuIframes(html)).toEqual([])
  })

  it('still catches legitimate /menu in pathname', () => {
    const html = '<iframe src="https://unknown-cms.example/restaurant/menu/index.html"></iframe>'
    expect(findMenuIframes(html)).toEqual(['https://unknown-cms.example/restaurant/menu/index.html'])
  })

  it('blocks SSRF: IPv4-mapped IPv6 (::ffff:127.0.0.1 and dotted/hex variants)', () => {
    const html = `
      <iframe src="http://[::ffff:127.0.0.1]/menu"></iframe>
      <iframe src="http://[::ffff:10.0.0.1]/menu"></iframe>
      <iframe src="http://[::127.0.0.1]/menu"></iframe>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('blocks SSRF: ::ffff: hex form (no dots)', () => {
    // ::ffff:7f00:0001 is the hex IPv4-mapping of 127.0.0.1. Any ::ffff:
    // prefix is rejected since it's exclusively IPv4-mapping.
    const html = '<iframe src="http://[::ffff:7f00:0001]/menu"></iframe>'
    expect(findMenuIframes(html)).toEqual([])
  })

  it('ignores iframe-shaped strings inside <template> elements', () => {
    const html = `
      <template id="menuTpl">
        <iframe src="https://checkle.menu/foo"></iframe>
      </template>
    `
    expect(findMenuIframes(html)).toEqual([])
  })

  it('ignores iframe-shaped strings inside <textarea> elements', () => {
    const html = `
      <textarea name="example">
        <iframe src="https://checkle.menu/foo"></iframe>
      </textarea>
    `
    expect(findMenuIframes(html)).toEqual([])
  })
})

describe('isBlockedHostname', () => {
  it('blocks localhost and 0.0.0.0', () => {
    expect(isBlockedHostname('localhost')).toBe(true)
    expect(isBlockedHostname('0.0.0.0')).toBe(true)
  })

  it('blocks loopback (127/8)', () => {
    expect(isBlockedHostname('127.0.0.1')).toBe(true)
    expect(isBlockedHostname('127.255.255.254')).toBe(true)
  })

  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedHostname('10.0.0.1')).toBe(true)
    expect(isBlockedHostname('172.16.0.1')).toBe(true)
    expect(isBlockedHostname('172.31.255.254')).toBe(true)
    expect(isBlockedHostname('192.168.1.1')).toBe(true)
  })

  it('does NOT block 172.32+ (outside RFC1918)', () => {
    expect(isBlockedHostname('172.32.0.1')).toBe(false)
    expect(isBlockedHostname('172.15.0.1')).toBe(false)
  })

  it('blocks link-local + cloud metadata (169.254/16)', () => {
    expect(isBlockedHostname('169.254.169.254')).toBe(true)
    expect(isBlockedHostname('169.254.0.1')).toBe(true)
  })

  it('blocks IPv6 loopback and unspecified', () => {
    expect(isBlockedHostname('::1')).toBe(true)
    expect(isBlockedHostname('::')).toBe(true)
  })

  it('blocks IPv6 with embedded IPv4 (::ffff:x.x.x.x and ::x.x.x.x)', () => {
    expect(isBlockedHostname('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedHostname('::ffff:10.0.0.1')).toBe(true)
    expect(isBlockedHostname('::127.0.0.1')).toBe(true)
  })

  it('blocks ::ffff: hex prefix (covers ::ffff:7f00:0001 form)', () => {
    expect(isBlockedHostname('::ffff:7f00:0001')).toBe(true)
  })

  it('blocks IPv6 unique-local and link-local ranges', () => {
    expect(isBlockedHostname('fc00:0:0:0:0:0:0:1')).toBe(true)
    expect(isBlockedHostname('fd00:0:0:0:0:0:0:1')).toBe(true)
    expect(isBlockedHostname('fe80:0:0:0:0:0:0:1')).toBe(true)
  })

  it('blocks .local / .internal / .localhost suffixes', () => {
    expect(isBlockedHostname('service.local')).toBe(true)
    expect(isBlockedHostname('api.internal')).toBe(true)
    expect(isBlockedHostname('foo.localhost')).toBe(true)
  })

  it('strips IPv6 brackets (URL hostname may include them)', () => {
    expect(isBlockedHostname('[::1]')).toBe(true)
  })

  it('allows legitimate public hostnames', () => {
    expect(isBlockedHostname('checkle.menu')).toBe(false)
    expect(isBlockedHostname('www.example.com')).toBe(false)
    expect(isBlockedHostname('8.8.8.8')).toBe(false)
  })

  it('blocks trailing-dot variants (DNS-equivalent FQDN forms)', () => {
    // WHATWG URL preserves trailing dots in hostname. Without normalization,
    // 'localhost.' and 'service.local.' would slip past the blocklist.
    expect(isBlockedHostname('localhost.')).toBe(true)
    expect(isBlockedHostname('service.local.')).toBe(true)
    expect(isBlockedHostname('api.internal.')).toBe(true)
    expect(isBlockedHostname('foo.localhost.')).toBe(true)
  })

  it('does NOT block public hostnames that happen to end in a dot', () => {
    expect(isBlockedHostname('checkle.menu.')).toBe(false)
    expect(isBlockedHostname('example.com.')).toBe(false)
  })
})

describe('isKnownMenuIframeHost', () => {
  it('matches the menu-service whitelist', () => {
    expect(isKnownMenuIframeHost('checkle.menu')).toBe(true)
    expect(isKnownMenuIframeHost('www.popmenu.com')).toBe(true)
    expect(isKnownMenuIframeHost('singleplatform.com')).toBe(true)
    expect(isKnownMenuIframeHost('order.toasttab.com')).toBe(true)
    expect(isKnownMenuIframeHost('menustar.com')).toBe(true)
  })

  it('rejects hosts not on the whitelist', () => {
    expect(isKnownMenuIframeHost('attacker.com')).toBe(false)
    expect(isKnownMenuIframeHost('localhost')).toBe(false)
    expect(isKnownMenuIframeHost('example.com')).toBe(false)
    expect(isKnownMenuIframeHost('googletagmanager.com')).toBe(false)
  })

  it('rejects superdomain bypass (attacker-controlled hostname containing trusted apex)', () => {
    // The substring/regex form of this check would match these — the
    // exact-or-subdomain check must reject them.
    expect(isKnownMenuIframeHost('popmenu.com.evil')).toBe(false)
    expect(isKnownMenuIframeHost('foo.popmenu.com.evil')).toBe(false)
    expect(isKnownMenuIframeHost('toasttab.com.attacker.io')).toBe(false)
    expect(isKnownMenuIframeHost('checkle.menu.attacker.io')).toBe(false)
  })

  it('rejects prefix-match imposters (e.g. xpopmenu.com)', () => {
    expect(isKnownMenuIframeHost('xpopmenu.com')).toBe(false)
    expect(isKnownMenuIframeHost('not-popmenu.com')).toBe(false)
    expect(isKnownMenuIframeHost('checkle.menus')).toBe(false)
  })

  it('matches exact apex and proper subdomains', () => {
    expect(isKnownMenuIframeHost('popmenu.com')).toBe(true)
    expect(isKnownMenuIframeHost('order.popmenu.com')).toBe(true)
    expect(isKnownMenuIframeHost('any.deep.subdomain.popmenu.com')).toBe(true)
  })

  it('normalizes trailing dot (DNS-equivalent FQDN forms)', () => {
    expect(isKnownMenuIframeHost('popmenu.com.')).toBe(true)
    expect(isKnownMenuIframeHost('order.popmenu.com.')).toBe(true)
  })
})
