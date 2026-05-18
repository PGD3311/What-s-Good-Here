-- Backfill review text on existing AI-seeded votes
-- Safe to re-run: only updates votes where review_text IS NULL
-- Run in Supabase SQL Editor

-- Step 1: Create a temp table of review templates by category group and rating tier
-- Rating tiers: high (7-10), mid (5-6.9), low (1-4.9)

WITH review_templates AS (
  -- LOBSTER / LOBSTER ROLL
  SELECT 'lobster' AS cat_group, 'high' AS tier, unnest(ARRAY[
    'Perfectly buttered and packed with fresh claw meat. This is the real deal.',
    'Best lobster roll I''ve had on the island. Generous portion, great bun.',
    'Fresh, sweet lobster with just the right amount of butter. Outstanding.',
    'The lobster is incredibly fresh. You can taste the ocean in every bite.',
    'Absolutely loaded with lobster meat. Worth every penny.',
    'Tender, sweet lobster done right. This is what you come to the Vineyard for.',
    'Perfectly cooked lobster, great seasoning. Would order this every time.',
    'Huge portion of fresh lobster. The butter sauce is perfect.',
    'This is the gold standard for lobster on MV. Don''t skip it.',
    'Buttery, fresh, and generous. Everything a lobster roll should be.',
    'Incredible quality lobster. Simply prepared and absolutely delicious.',
    'One of the best I''ve ever had. Fresh, perfectly seasoned, can''t beat it.',
    'The lobster is so fresh it practically melts in your mouth.',
    'Amazing lobster roll. Huge chunks of meat, toasted bun, perfection.',
    'This is why people come to Martha''s Vineyard. Spectacular lobster.'
  ]) AS review_text
  UNION ALL
  SELECT 'lobster', 'mid', unnest(ARRAY[
    'Decent lobster roll but nothing that blew me away. Solid option.',
    'Good lobster, fair portion. The bun could be better toasted.',
    'Pretty good but I''ve had better on the island. Still worth trying.',
    'Lobster was fresh but the portion felt a little small for the price.',
    'Solid lobster roll. Not the best on MV but definitely respectable.',
    'Good flavor, decent size. A reliable choice if you''re in the area.',
    'The lobster itself was great but the overall presentation was just okay.',
    'Fair lobster roll. Good quality meat but nothing extraordinary.',
    'Decent option for lobster. Fresh enough, reasonably priced.',
    'Good but not great. The lobster was fine, just not memorable.'
  ]) AS review_text
  UNION ALL
  SELECT 'lobster', 'low', unnest(ARRAY[
    'Disappointing portion for the price. The lobster was a bit tough.',
    'Expected more from this lobster roll. Underwhelming overall.',
    'The lobster wasn''t very fresh. Wouldn''t rush back for this one.',
    'Small portion and the bun was soggy. Not the best experience.',
    'Below average for island lobster. I''d try somewhere else next time.'
  ]) AS review_text

  -- SEAFOOD (general)
  UNION ALL
  SELECT 'seafood', 'high', unnest(ARRAY[
    'Incredibly fresh seafood. You can tell they source locally.',
    'The freshness is unreal. Best seafood I''ve had in a long time.',
    'Perfectly prepared, super fresh. This is island dining at its best.',
    'Outstanding quality. The seafood here is on another level.',
    'So fresh and flavorful. Every bite was excellent.',
    'Beautifully cooked seafood with great seasoning. Highly recommend.',
    'The freshest catch on the island. Cooked to perfection.',
    'Amazing flavor and perfectly seasoned. Would absolutely order again.',
    'Top notch seafood. Fresh, well-prepared, and generous portion.',
    'This is exactly what you want from Vineyard seafood. Incredible.',
    'Perfectly cooked, bursting with flavor. A must-try.',
    'Outstanding freshness and preparation. One of the best on MV.',
    'Super fresh and beautifully plated. Worth every dollar.',
    'The seafood here sets the standard. Exceptional quality.',
    'Fresh off the boat flavor. Absolutely delicious.'
  ]) AS review_text
  UNION ALL
  SELECT 'seafood', 'mid', unnest(ARRAY[
    'Good seafood, reasonably fresh. A solid choice for the area.',
    'Decent quality but not the freshest I''ve had on the island.',
    'Pretty good overall. The preparation was fine, nothing special.',
    'Solid seafood option. Fresh enough and well-portioned.',
    'Good but not great. Would try it again if I''m in the neighborhood.',
    'Fair preparation. The seafood was decent but could be fresher.',
    'Respectable quality. Not the best on the island but still good.',
    'Average island seafood. Gets the job done.',
    'Good flavor, reasonable portion. Nothing to complain about.',
    'Decent option. The seafood was okay, seasoning was good.'
  ]) AS review_text
  UNION ALL
  SELECT 'seafood', 'low', unnest(ARRAY[
    'Not the freshest. Expected better from an island spot.',
    'Underwhelming seafood. The preparation didn''t do it justice.',
    'Below average. There are much better seafood options on MV.',
    'Disappointing quality for the price. Wouldn''t order again.',
    'The seafood felt like it had been sitting around. Skip this one.'
  ]) AS review_text

  -- CHOWDER
  UNION ALL
  SELECT 'chowder', 'high', unnest(ARRAY[
    'Rich, creamy, and loaded with clams. Best chowder on the island.',
    'Thick and hearty with huge chunks of clam. This is the one.',
    'Perfect New England chowder. Creamy, flavorful, comforting.',
    'The chowder is legendary for a reason. Rich and absolutely delicious.',
    'Incredible depth of flavor. Generous clams, perfect consistency.',
    'This chowder is what dreams are made of. Thick, creamy perfection.',
    'Best bowl of chowder I''ve ever had. Period.',
    'Perfectly seasoned, loaded with clams. A must on a cool day.',
    'Rich, creamy, and packed with flavor. Outstanding chowder.',
    'The gold standard for island chowder. Don''t miss this.',
    'Hearty, warming, and absolutely packed with fresh clams.',
    'Incredible chowder. Thick, rich, and bursting with ocean flavor.',
    'Comfort food at its finest. This chowder is perfection.',
    'Phenomenal. Creamy, chunky, and full of fresh clam flavor.',
    'The best chowder on Martha''s Vineyard. No contest.'
  ]) AS review_text
  UNION ALL
  SELECT 'chowder', 'mid', unnest(ARRAY[
    'Good chowder, decent portion. A bit thin for my taste though.',
    'Solid bowl of chowder. Not the best on MV but pretty good.',
    'Decent chowder. Good flavor but could use more clams.',
    'Pretty good but a little watery. The clams were nice though.',
    'Respectable chowder. Nothing wrong with it, just not standout.',
    'Good comfort food option. Warm, creamy, and filling.',
    'Fair chowder. Decent clam content, standard preparation.',
    'Average but satisfying. Good for a quick bowl.',
    'Solid but unremarkable. Gets the job done on a chilly day.',
    'Good flavor but the portion was a bit small.'
  ]) AS review_text
  UNION ALL
  SELECT 'chowder', 'low', unnest(ARRAY[
    'Too thin and not enough clams. Felt like cream soup.',
    'Disappointing chowder. Bland and watery.',
    'Expected much better for the price. Underwhelming.',
    'Not great. The chowder lacked flavor and substance.',
    'Below average. I''d skip this and try elsewhere.'
  ]) AS review_text

  -- PIZZA
  UNION ALL
  SELECT 'pizza', 'high', unnest(ARRAY[
    'Incredible crust, great sauce, perfect cheese pull. Best pizza on MV.',
    'Perfectly crispy crust with quality toppings. Outstanding slice.',
    'This pizza is seriously good. Great char, fresh ingredients.',
    'Best pizza on the island hands down. The dough is perfection.',
    'Amazing flavor, perfect crust. Would order this every single time.',
    'Excellent pizza. Great balance of sauce, cheese, and toppings.',
    'The crust alone is worth the trip. Perfectly charred and chewy.',
    'Incredible quality for island pizza. Fresh, hot, and delicious.',
    'This is proper pizza. Great dough, great sauce, great everything.',
    'Outstanding pie. Crispy bottom, gooey cheese, flavorful sauce.',
    'Best slice I''ve had in a while. The dough is spectacular.',
    'Perfectly balanced pizza. Not too greasy, great flavor.',
    'The crust is crispy and airy. Toppings are fresh and generous.',
    'A+ pizza. Every element is dialed in perfectly.',
    'Seriously impressive pizza for a small island spot.'
  ]) AS review_text
  UNION ALL
  SELECT 'pizza', 'mid', unnest(ARRAY[
    'Good pizza, decent crust. A solid option when you''re craving a slice.',
    'Pretty good but nothing extraordinary. Standard island pizza.',
    'Decent slice. Good cheese, average crust.',
    'Solid pizza option. Not mind-blowing but reliably good.',
    'Good enough pizza. The toppings are fresh, crust is okay.',
    'Average pizza that hits the spot. Nothing to write home about.',
    'Fair pizza. Good sauce, decent cheese, standard crust.',
    'Respectable slice. Gets the job done.',
    'Good pizza for the island. Not the best but still enjoyable.',
    'Decent option. The pizza is consistent and fairly priced.'
  ]) AS review_text
  UNION ALL
  SELECT 'pizza', 'low', unnest(ARRAY[
    'Soggy crust and bland sauce. Not worth the price.',
    'Disappointing pizza. The dough was undercooked.',
    'Below average slice. There are better options on MV.',
    'The pizza was mediocre at best. Wouldn''t order again.',
    'Not great. Greasy and lacking in flavor.'
  ]) AS review_text

  -- BURGER
  UNION ALL
  SELECT 'burger', 'high', unnest(ARRAY[
    'Juicy, perfectly cooked, and loaded with flavor. Best burger on MV.',
    'This burger is incredible. Great meat quality, perfect bun.',
    'Cooked exactly right, amazing toppings. An outstanding burger.',
    'Best burger on the island. Juicy, flavorful, and satisfying.',
    'Perfectly seasoned patty with a great bun. Would order every time.',
    'The burger here is legit. Fresh ground beef, cooked to perfection.',
    'Amazing quality beef, great char, perfect toppings. A must-try.',
    'This is a proper burger. Juicy, messy, and absolutely delicious.',
    'Outstanding burger. The meat quality is noticeably better than most.',
    'Incredible flavor, perfect cook. This burger punches way above.',
    'One of the best burgers I''ve had anywhere. Not just on MV.',
    'Perfectly charred, juicy center, great bun. Burger perfection.',
    'The patty is thick, well-seasoned, and cooked just right.',
    'Seriously good burger. Fresh ingredients, great execution.',
    'Worth the trip just for this burger. Absolutely stellar.'
  ]) AS review_text
  UNION ALL
  SELECT 'burger', 'mid', unnest(ARRAY[
    'Good burger, well-cooked. A reliable choice.',
    'Decent burger. Good meat, standard toppings.',
    'Solid option. Not the best on the island but enjoyable.',
    'Pretty good burger. The patty was tasty, bun was fine.',
    'Good enough burger that hits the spot. Fair price too.',
    'Average island burger. Nothing wrong, nothing amazing.',
    'Decent quality meat, good toppings. A fair option.',
    'Solid burger. Cooked well, reasonably priced.',
    'Good but unremarkable. A safe choice.',
    'Fair burger with decent flavor. Would eat again if nearby.'
  ]) AS review_text
  UNION ALL
  SELECT 'burger', 'low', unnest(ARRAY[
    'Overcooked and dry. Not a great burger experience.',
    'Disappointing. The patty was bland and the bun was stale.',
    'Below average burger. Expected more for the price.',
    'Not great. The meat quality wasn''t there.',
    'Underwhelming burger. I''d look elsewhere.'
  ]) AS review_text

  -- BREAKFAST
  UNION ALL
  SELECT 'breakfast', 'high', unnest(ARRAY[
    'Perfect morning fuel. Everything was fresh and cooked beautifully.',
    'Best breakfast spot on the island. Generous portions, great coffee.',
    'Incredible breakfast. The eggs were perfect, everything was fresh.',
    'Outstanding morning plate. Crispy bacon, fluffy eggs, great toast.',
    'This is the breakfast you dream about. Everything was on point.',
    'Perfectly executed breakfast. Fresh, hot, and delicious.',
    'Amazing start to the day. Quality ingredients, generous serving.',
    'Best breakfast I''ve had on MV. Everything was done right.',
    'Incredible value and quality. The breakfast here is next level.',
    'Absolutely phenomenal. Fresh eggs, crispy hash browns, great vibe.',
    'The breakfast plate here is legendary. Don''t miss it.',
    'Every element was perfect. From the eggs to the toast to the coffee.',
    'Outstanding breakfast. Fresh, filling, and full of flavor.',
    'This is island breakfast done right. Warm, hearty, and delicious.',
    'A+ breakfast. Would wake up early just to eat here again.'
  ]) AS review_text
  UNION ALL
  SELECT 'breakfast', 'mid', unnest(ARRAY[
    'Good breakfast, decent portions. Standard island morning fare.',
    'Solid breakfast spot. Nothing fancy but gets the job done.',
    'Pretty good eggs and toast. Coffee was decent too.',
    'Good breakfast option. Fresh enough, fairly priced.',
    'Average breakfast but still satisfying. A reliable morning spot.',
    'Decent morning meal. Good basics, nothing extraordinary.',
    'Fair breakfast. The eggs were good, everything else was standard.',
    'Good enough for a quick morning bite. Consistent quality.',
    'Solid option for breakfast. Won''t blow your mind but won''t disappoint.',
    'Decent breakfast spot. Good coffee, standard plates.'
  ]) AS review_text
  UNION ALL
  SELECT 'breakfast', 'low', unnest(ARRAY[
    'Mediocre breakfast. The eggs were overcooked and cold.',
    'Disappointing morning meal. Not worth the wait.',
    'Below average. There are better breakfast spots on the island.',
    'The breakfast was bland and the portions were small.',
    'Not great. Lukewarm food and slow service.'
  ]) AS review_text

  -- ICE CREAM
  UNION ALL
  SELECT 'ice cream', 'high', unnest(ARRAY[
    'Best ice cream on the island. Rich, creamy, and unique flavors.',
    'Incredible scoops. The flavor is intense and the texture is perfect.',
    'This ice cream is dangerously good. Creamy, rich, and generous.',
    'Outstanding quality. You can taste the real ingredients.',
    'The best scoop on MV. Perfectly creamy with amazing flavors.',
    'Phenomenal ice cream. Rich, smooth, and so many great options.',
    'This is the real deal. Fresh, creamy, and packed with flavor.',
    'Absolutely delicious. Best dessert stop on the Vineyard.',
    'The flavors here are incredible. Creative and perfectly executed.',
    'World-class ice cream. Seriously. Don''t leave MV without trying it.',
    'Creamy perfection. The homemade flavors are outstanding.',
    'Best scoop I''ve had all summer. Rich, flavorful, and generous.',
    'Amazing texture and flavor. This ice cream is addictive.',
    'The quality here is unmatched. Fresh, creamy, and delicious.',
    'A must-visit. The ice cream alone is worth the trip.'
  ]) AS review_text
  UNION ALL
  SELECT 'ice cream', 'mid', unnest(ARRAY[
    'Good ice cream, decent flavors. Standard island scoop shop.',
    'Pretty good scoops. Nothing extraordinary but enjoyable.',
    'Solid ice cream. Good variety, decent quality.',
    'Good enough for a summer treat. Fair flavors.',
    'Average ice cream shop. The scoops are fine.',
    'Decent ice cream. Good texture, standard flavors.',
    'Fair scoops. Nothing wrong but nothing special either.',
    'Good option for a quick dessert. Reasonably priced.',
    'Solid ice cream spot. Reliable quality.',
    'Decent flavors, good portions. A fair choice.'
  ]) AS review_text
  UNION ALL
  SELECT 'ice cream', 'low', unnest(ARRAY[
    'The ice cream was icy and lacked flavor. Disappointing.',
    'Not great. The flavors were bland and the texture was off.',
    'Below average for the island. Expected better.',
    'Overpriced for the quality. Skip this one.',
    'Mediocre scoops. Wouldn''t go back.'
  ]) AS review_text

  -- SANDWICH
  UNION ALL
  SELECT 'sandwich', 'high', unnest(ARRAY[
    'Perfectly built sandwich. Fresh ingredients, great bread.',
    'Best sandwich on the island. Generous, fresh, and delicious.',
    'Incredible flavor combination. The bread is outstanding.',
    'This sandwich is a masterpiece. Every layer is perfect.',
    'Amazing quality ingredients on great bread. A must-try.',
    'Outstanding sandwich. Fresh, well-balanced, and satisfying.',
    'The bread alone is worth it. Perfectly toasted, great fillings.',
    'Best sandwich I''ve had on MV. Would order every time.',
    'Generous portions, quality ingredients, perfect bread. Love it.',
    'Incredible sandwich. Fresh, flavorful, and perfectly assembled.',
    'A+ sandwich. Great bread, fresh fillings, perfect ratio.',
    'This is how a sandwich should be made. Fresh and delicious.',
    'Outstanding quality and generous portion. Highly recommend.',
    'Perfectly balanced flavors. The bread is the star.',
    'One of the best sandwiches on the Vineyard. Don''t miss it.'
  ]) AS review_text
  UNION ALL
  SELECT 'sandwich', 'mid', unnest(ARRAY[
    'Good sandwich, fresh ingredients. A solid lunch option.',
    'Decent sub. Good bread, standard fillings.',
    'Pretty good sandwich. Nothing fancy but satisfying.',
    'Solid option for a quick bite. Fresh and fairly priced.',
    'Good sandwich. The bread was nice, fillings were decent.',
    'Average island sandwich. Gets the job done for lunch.',
    'Fair quality. Good bread, standard ingredients.',
    'Decent sandwich spot. Reliable and consistent.',
    'Good enough for a quick lunch. Nothing to complain about.',
    'Solid sandwich. Fresh bread, decent fillings.'
  ]) AS review_text
  UNION ALL
  SELECT 'sandwich', 'low', unnest(ARRAY[
    'Underwhelming sandwich. Stale bread and skimpy fillings.',
    'Not great. The ingredients didn''t taste very fresh.',
    'Disappointing for the price. Expected better quality.',
    'Below average sandwich. I''d try elsewhere.',
    'The bread was soggy and the fillings were sparse.'
  ]) AS review_text

  -- TACO
  UNION ALL
  SELECT 'taco', 'high', unnest(ARRAY[
    'Amazing tacos. Fresh tortillas, incredible filling, perfect salsa.',
    'Best tacos on the island. Authentic flavor, generous portions.',
    'These tacos are incredible. The meat is perfectly seasoned.',
    'Outstanding tacos. Fresh, flavorful, and perfectly assembled.',
    'The best taco I''ve had on MV. Authentic and delicious.',
    'Incredible flavor. The tortillas are fresh and the filling is perfect.',
    'These tacos punch way above. Amazing quality and taste.',
    'Perfectly seasoned, fresh ingredients, great tortillas. A winner.',
    'Best tacos I''ve had in a while. Fresh, bold, and satisfying.',
    'Outstanding quality. The salsa and toppings make these special.',
    'A must-try. These tacos are the real deal.',
    'Fresh, flavorful, and authentic. Best tacos on the Vineyard.',
    'The seasoning is perfect. Every bite is packed with flavor.',
    'Incredible tacos. Fresh tortillas and amazing protein.',
    'These are legit tacos. Fresh, bold, and absolutely delicious.'
  ]) AS review_text
  UNION ALL
  SELECT 'taco', 'mid', unnest(ARRAY[
    'Good tacos, decent filling. Solid option for a quick meal.',
    'Pretty good but nothing extraordinary. Standard island tacos.',
    'Decent tacos. Good seasoning, average tortillas.',
    'Solid taco spot. Fresh enough and fairly priced.',
    'Good enough tacos. The filling was tasty.',
    'Average tacos but still enjoyable. Would eat again.',
    'Fair tacos. Good protein, decent toppings.',
    'Decent option for tacos on MV. Nothing special.',
    'Good flavor but the portions could be bigger.',
    'Solid tacos that hit the spot.'
  ]) AS review_text
  UNION ALL
  SELECT 'taco', 'low', unnest(ARRAY[
    'Underwhelming tacos. The tortillas were dry.',
    'Not great. Bland filling and small portions.',
    'Disappointing tacos for the price.',
    'Below average. Expected more flavor.',
    'Skip these tacos. There are better options on MV.'
  ]) AS review_text

  -- SALAD
  UNION ALL
  SELECT 'salad', 'high', unnest(ARRAY[
    'Fresh, vibrant, and perfectly dressed. Best salad on the island.',
    'Incredible salad. The greens are super fresh, dressing is perfect.',
    'Outstanding quality ingredients. This salad is a full meal.',
    'Best salad I''ve had on MV. Fresh, colorful, and delicious.',
    'Amazing freshness. The dressing is house-made and fantastic.',
    'Perfectly balanced salad. Every ingredient shines.',
    'This salad is art. Fresh greens, great toppings, perfect dressing.',
    'Outstanding freshness and flavor. A must for salad lovers.',
    'Incredibly fresh with creative toppings. Love this salad.',
    'The best greens on the island. Fresh, crisp, and delicious.',
    'Beautiful presentation and even better taste. Phenomenal salad.',
    'Farm-fresh ingredients done right. An exceptional salad.',
    'Perfectly composed salad with outstanding dressing.',
    'So fresh and flavorful. The toppings are generous and creative.',
    'This salad proves healthy food can be amazing.'
  ]) AS review_text
  UNION ALL
  SELECT 'salad', 'mid', unnest(ARRAY[
    'Good salad, fresh greens. A solid healthy option.',
    'Decent salad. Fresh enough with good dressing.',
    'Pretty good but nothing special. Standard island salad.',
    'Solid salad option. Good variety of toppings.',
    'Good greens, decent dressing. A fair choice.',
    'Average salad but still fresh and filling.',
    'Fair salad. The dressing was good, greens were okay.',
    'Decent option for a lighter meal.',
    'Good salad that does the job. Nothing extraordinary.',
    'Solid and fresh. A reliable choice.'
  ]) AS review_text
  UNION ALL
  SELECT 'salad', 'low', unnest(ARRAY[
    'Wilted greens and bland dressing. Not great.',
    'Disappointing salad for the price. Skip it.',
    'Below average. The lettuce wasn''t very fresh.',
    'Underwhelming salad. Expected better quality.',
    'Not worth it. Small portion of tired-looking greens.'
  ]) AS review_text

  -- PASTA
  UNION ALL
  SELECT 'pasta', 'high', unnest(ARRAY[
    'Perfectly cooked pasta with an incredible sauce. Restaurant quality.',
    'Best pasta on the island. Al dente perfection with amazing flavor.',
    'Outstanding pasta dish. The sauce is rich and the portion generous.',
    'This pasta is phenomenal. Fresh noodles with a killer sauce.',
    'Incredible flavor and texture. Best Italian on MV.',
    'Perfectly al dente with a sauce that has real depth.',
    'Amazing pasta. You can taste the quality in every bite.',
    'The pasta here is next level. Rich, flavorful, and satisfying.',
    'Outstanding dish. Fresh pasta, great sauce, perfect seasoning.',
    'Best pasta I''ve had on the island. Beautifully executed.',
    'Incredible quality. The sauce is house-made and you can tell.',
    'Perfectly prepared pasta with fantastic flavor. Must-try.',
    'Rich, comforting, and beautifully made. This pasta is a gem.',
    'Al dente perfection. The sauce clings to every strand.',
    'A masterful pasta dish. Every element is perfect.'
  ]) AS review_text
  UNION ALL
  SELECT 'pasta', 'mid', unnest(ARRAY[
    'Good pasta, decent sauce. A solid Italian option on MV.',
    'Pretty good but a bit heavy. Standard island pasta.',
    'Decent pasta dish. Good flavors, fair portion.',
    'Solid option. The pasta was cooked well, sauce was good.',
    'Good enough pasta. Nothing special but satisfying.',
    'Average pasta dish. The sauce was decent.',
    'Fair quality. Good noodles, standard sauce.',
    'Decent option for Italian. Reasonably priced.',
    'Good pasta that gets the job done.',
    'Solid Italian option. Reliable and filling.'
  ]) AS review_text
  UNION ALL
  SELECT 'pasta', 'low', unnest(ARRAY[
    'Overcooked pasta with bland sauce. Disappointing.',
    'Not great. The sauce lacked flavor and the pasta was mushy.',
    'Below average pasta. There are better Italian options on MV.',
    'Underwhelming dish. Expected more for the price.',
    'The pasta was soggy and the sauce was too thin.'
  ]) AS review_text

  -- SUSHI
  UNION ALL
  SELECT 'sushi', 'high', unnest(ARRAY[
    'Incredibly fresh fish, perfectly seasoned rice. Best sushi on MV.',
    'Outstanding sushi. The fish quality is exceptional.',
    'This sushi is world-class. Fresh, beautiful, and delicious.',
    'Best sushi on the island. The fish is incredibly fresh.',
    'Perfectly prepared sushi with amazing quality fish.',
    'The freshness is unreal. Each piece is a little work of art.',
    'Outstanding rolls and nigiri. The fish melts in your mouth.',
    'Incredible quality sushi for an island spot. Truly impressed.',
    'Fresh, beautiful, and perfectly portioned. A sushi lover''s dream.',
    'The rice is perfect and the fish is ultra-fresh. Top tier.',
    'Amazing sushi. Clean flavors and impeccable freshness.',
    'Best fish I''ve had on MV. The chef clearly knows their craft.',
    'Exceptional sushi. Each piece is carefully crafted.',
    'The quality here rivals city sushi bars. Remarkable.',
    'Fresh, clean, and expertly prepared. Don''t miss the sushi here.'
  ]) AS review_text
  UNION ALL
  SELECT 'sushi', 'mid', unnest(ARRAY[
    'Good sushi, decent fish. A solid option on the island.',
    'Pretty good rolls. The fish was fresh enough.',
    'Decent sushi for MV. Good variety, fair quality.',
    'Solid sushi option. Nothing extraordinary but reliable.',
    'Good enough sushi. The fish was decent and the rice was fine.',
    'Average island sushi. Gets the job done.',
    'Fair sushi. Good rice, decent fish quality.',
    'Decent option if you''re craving sushi on MV.',
    'Good sushi spot. Reliable quality and fair prices.',
    'Solid rolls, decent nigiri. A respectable choice.'
  ]) AS review_text
  UNION ALL
  SELECT 'sushi', 'low', unnest(ARRAY[
    'The fish wasn''t very fresh. Disappointing sushi.',
    'Below average sushi. Expected better quality.',
    'Not great. The rice was mushy and the fish was lackluster.',
    'Underwhelming for the price. I''d skip the sushi here.',
    'Mediocre sushi. There are better options on the island.'
  ]) AS review_text

  -- DRINKS (coffee, cocktails, beer)
  UNION ALL
  SELECT 'drinks', 'high', unnest(ARRAY[
    'Perfectly crafted drink. The quality is outstanding.',
    'Best drinks on the island. Creative and perfectly made.',
    'Incredible flavor and presentation. A real treat.',
    'Outstanding quality. You can taste the care in every sip.',
    'This drink is perfection. Balanced, fresh, and delicious.',
    'Amazing craft and creativity. Best sips on MV.',
    'Perfectly balanced. The flavor profile is spot on.',
    'Exceptional quality. Creative menu with perfect execution.',
    'The best drink I''ve had on the island. Truly impressive.',
    'Outstanding. Fresh ingredients, perfect preparation.',
    'This is how it''s done. Great craft, amazing flavor.',
    'A must-try. The quality and creativity are unmatched.',
    'Perfectly made with premium ingredients. Worth every cent.',
    'Incredible drink. Fresh, balanced, and beautifully presented.',
    'Top tier quality. The best spot for drinks on MV.'
  ]) AS review_text
  UNION ALL
  SELECT 'drinks', 'mid', unnest(ARRAY[
    'Good drink, solid quality. A fair choice.',
    'Decent option. Nothing fancy but well-made.',
    'Pretty good drink. Standard quality, fair price.',
    'Solid choice. Good flavor, reliable quality.',
    'Good enough. The drink was well-made and refreshing.',
    'Average but enjoyable. A decent spot for drinks.',
    'Fair quality. Good flavor, standard preparation.',
    'Decent drink that hits the spot.',
    'Good option for the area. Consistent quality.',
    'Solid and reliable. A respectable choice.'
  ]) AS review_text
  UNION ALL
  SELECT 'drinks', 'low', unnest(ARRAY[
    'Weak and overpriced. Disappointed with the quality.',
    'Below average drink. Expected better.',
    'Not great. The flavor was off and the price was too high.',
    'Underwhelming. Wouldn''t order again.',
    'Mediocre quality. There are better spots for drinks on MV.'
  ]) AS review_text

  -- DESSERT
  UNION ALL
  SELECT 'dessert', 'high', unnest(ARRAY[
    'Best dessert on the island. Rich, indulgent, and perfectly made.',
    'Incredible sweet treat. The quality is outstanding.',
    'This dessert is pure heaven. Worth saving room for.',
    'Outstanding dessert. Fresh, creative, and absolutely delicious.',
    'The best way to end a meal on MV. Phenomenal dessert.',
    'Rich, decadent, and perfectly crafted. A must-have.',
    'Incredible flavor and presentation. Don''t skip dessert here.',
    'This is the dessert you''ll dream about. Perfectly executed.',
    'Amazing quality. Fresh ingredients and expert preparation.',
    'Best sweet bite on the island. Absolutely divine.',
    'Perfectly made dessert with incredible depth of flavor.',
    'Outstanding. Every bite is a celebration of flavor.',
    'The best ending to any meal. Rich, sweet, and perfect.',
    'Incredible dessert. Fresh, indulgent, and beautifully plated.',
    'A showstopper dessert. Don''t miss this one.'
  ]) AS review_text
  UNION ALL
  SELECT 'dessert', 'mid', unnest(ARRAY[
    'Good dessert, decent quality. A nice end to the meal.',
    'Pretty good but not mind-blowing. Standard island sweet.',
    'Decent dessert option. Good flavor, fair portion.',
    'Solid sweet treat. Nothing extraordinary but enjoyable.',
    'Good enough dessert. The flavor was decent.',
    'Average dessert but still satisfying. Good option.',
    'Fair quality dessert. Good sweetness, standard preparation.',
    'Decent option if you''re craving something sweet.',
    'Good dessert that does the job.',
    'Solid sweet option. Reliable and fairly priced.'
  ]) AS review_text
  UNION ALL
  SELECT 'dessert', 'low', unnest(ARRAY[
    'Stale and overly sweet. Not worth it.',
    'Disappointing dessert. Expected better quality.',
    'Below average. Skip this and get ice cream elsewhere.',
    'The dessert was underwhelming for the price.',
    'Not great. Bland flavor and poor execution.'
  ]) AS review_text

  -- GENERIC fallback (for categories not covered above)
  UNION ALL
  SELECT 'generic', 'high', unnest(ARRAY[
    'Absolutely delicious. One of the best things I''ve eaten on MV.',
    'Outstanding quality and flavor. Highly recommend this.',
    'This is seriously good. Would order every single time.',
    'Incredible dish. Fresh, flavorful, and perfectly prepared.',
    'Best version of this I''ve had on the island. Don''t miss it.',
    'The quality here is exceptional. Everything was perfect.',
    'Amazing flavor and generous portion. A must-try on MV.',
    'Perfectly executed dish. Fresh ingredients, great taste.',
    'Outstanding. This is why people love eating on the Vineyard.',
    'One of the best dishes on Martha''s Vineyard. Truly excellent.',
    'Incredible quality. Every bite was better than the last.',
    'This dish is a standout. Fresh, well-made, and delicious.',
    'Perfectly done. The flavor and quality are top notch.',
    'Amazing dish that exceeded my expectations. Absolutely loved it.',
    'The best I''ve had on the island. Would come back just for this.'
  ]) AS review_text
  UNION ALL
  SELECT 'generic', 'mid', unnest(ARRAY[
    'Good dish, decent quality. A solid option in the area.',
    'Pretty good but nothing extraordinary. Worth trying.',
    'Decent option. Good flavor, fair portion.',
    'Solid choice. Not the best on MV but still enjoyable.',
    'Good enough. Would eat it again if I''m nearby.',
    'Average but satisfying. A reliable option.',
    'Fair quality. Good flavor, standard preparation.',
    'Decent dish. Nothing to complain about.',
    'Good option. Consistent quality and fairly priced.',
    'Solid and reliable. Gets the job done.'
  ]) AS review_text
  UNION ALL
  SELECT 'generic', 'low', unnest(ARRAY[
    'Disappointing for the price. Expected better quality.',
    'Below average. There are better options on the island.',
    'Not great. The quality wasn''t there.',
    'Underwhelming dish. Wouldn''t rush back for this one.',
    'Mediocre quality. I''d try somewhere else next time.'
  ]) AS review_text
),

-- Step 2: Map dish categories to our template groups
category_mapping AS (
  SELECT category, CASE
    WHEN category IN ('lobster roll', 'lobster') THEN 'lobster'
    WHEN category IN ('seafood', 'fish', 'clams', 'oysters') THEN 'seafood'
    WHEN category IN ('chowder', 'soup') THEN 'chowder'
    WHEN category = 'pizza' THEN 'pizza'
    WHEN category IN ('burger', 'chicken', 'tendys', 'wings', 'steak', 'pork', 'ribs', 'duck', 'lamb') THEN 'burger'
    WHEN category IN ('breakfast', 'breakfast sandwich') THEN 'breakfast'
    WHEN category = 'ice cream' THEN 'ice cream'
    WHEN category IN ('sandwich', 'quesadilla') THEN 'sandwich'
    WHEN category = 'taco' THEN 'taco'
    WHEN category = 'salad' THEN 'salad'
    WHEN category IN ('pasta', 'asian', 'pokebowl', 'entree') THEN 'pasta'
    WHEN category = 'sushi' THEN 'sushi'
    WHEN category IN ('coffee', 'drinks', 'beer') THEN 'drinks'
    WHEN category IN ('dessert', 'donuts') THEN 'dessert'
    ELSE 'generic'
  END AS cat_group
  FROM (SELECT DISTINCT category FROM dishes WHERE category IS NOT NULL) cats
),

-- Step 3: Number the templates within each group+tier for random selection
numbered_templates AS (
  SELECT cat_group, tier, review_text,
    ROW_NUMBER() OVER (PARTITION BY cat_group, tier ORDER BY random()) AS rn,
    COUNT(*) OVER (PARTITION BY cat_group, tier) AS total
  FROM review_templates
),

-- Step 4: Assign a rating tier and random template index to each vote
votes_to_update AS (
  SELECT
    v.id AS vote_id,
    COALESCE(cm.cat_group, 'generic') AS cat_group,
    CASE
      WHEN v.rating_10 >= 7.0 THEN 'high'
      WHEN v.rating_10 >= 5.0 THEN 'mid'
      ELSE 'low'
    END AS tier,
    -- Use a hash of vote ID for deterministic-but-varied selection
    ABS(hashtext(v.id::text)) AS hash_val
  FROM votes v
  JOIN dishes d ON d.id = v.dish_id
  LEFT JOIN category_mapping cm ON cm.category = d.category
  WHERE v.source = 'ai_estimated'
    AND v.review_text IS NULL
)

-- Step 5: Perform the update
UPDATE votes
SET
  review_text = nt.review_text,
  review_created_at = NOW() - (random() * INTERVAL '90 days')
FROM votes_to_update vtu
JOIN numbered_templates nt
  ON nt.cat_group = vtu.cat_group
  AND nt.tier = vtu.tier
  AND nt.rn = (vtu.hash_val % nt.total) + 1
WHERE votes.id = vtu.vote_id;
