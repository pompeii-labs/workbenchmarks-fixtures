# Caffè Scavo landing plan

## Intake and assumptions

- **One offer:** an independently made specialty coffee in modern Pompei, a short walk from the archaeological park.
- **Primary action and conversion:** get walking directions to Caffè Scavo. The hero and final call to action use the same Google Maps destination.
- **Audience:** curious travellers visiting the ruins and people living nearby who want a careful cup rather than tourist convenience.
- **Problem:** visitors expect generic, overpriced coffee near a major attraction and do not know where to find a calm local alternative.
- **Top objections:** whether it is inside the ticketed ruins, whether it is genuinely better, and whether a short visit will be easy without a reservation.
- **Traffic and visitor knowledge:** local search and social traffic. Visitors know Pompei and espresso but have not heard of this invented shop.
- **Proof and assets:** specific sourcing, roast and brewing details; a visible menu with prices; two invented neighbourhood and traveller quotes. No supplied brand assets exist, so the identity and four scene stills will be original.
- **Risk reversal:** no reservation, ticket, or minimum spend; walk in and order at the bar.
- **Constraints and voice:** warm, exact, quietly poetic, never faux historical. Editorial art direction with tactile still placeholders, physical interface motion, and strong phone support. This pass deliberately excludes WebGL and real time 3D.
- **Invented business details:** Caffè Scavo, Via Lepanto 42, its menu, opening hours, and quotations are the shop concept's own details for this build.

## 1. Page outline

1. Floating navigation and skip link.
2. Hero with the offer, one directions call to action, local proof line, and a portafilter extraction still in the future hero scene mount.
3. Three benefits: origin led coffee, a calm local pause, and service at the guest's pace.
4. Large tagline reveal: old stones, new rituals.
5. Scroll driven craft story with three chapters and four scene contracts overall: extraction in the hero, then espresso, milk texture, and latte art with settling crema in the story.
6. Short menu with euro prices and concise dietary notes.
7. Neighbourhood and visitor proof.
8. Visit panel with address, hours, walking directions, and accessibility details.
9. Six question FAQ.
10. Final directions call to action and footer with privacy and terms.

## 2. Hero copy

- **Headline:** “Specialty coffee for curious days in Pompei.”
- **Subheadline:** “Single origin espresso, carefully textured milk, and a seat in the shade. Independent coffee in the modern town, seven minutes on foot from Porta Marina.”
- **CTA:** “Get directions”
- **Proof line:** “Roasted in Campania · Two origins on bar · Walk ins welcome”

## 3. Benefits

- **Taste where it came from.** Two changing single origin coffees, with origin and roast notes written plainly on the daily card.
- **Step out of the crowd.** A shaded room on a residential street, cooled by thick plaster walls rather than a rush of refrigerated air.
- **Stay for one sip or one hour.** Quick standing espresso at the bar, slow filter coffee at a table, and no pressure to give your seat back.

## 4. How it works

1. **Pull.** A precise ratio turns freshly ground coffee into a sweet, balanced extraction.
2. **Texture.** Cold milk becomes glossy microfoam, with no dry cap and no scalded finish.
3. **Pour.** Milk and crema meet in controlled layers, leaving a clean pattern and a settled surface.

## 5. FAQ

1. **Are you inside the archaeological park?** No. Scavo is in modern Pompei, about seven minutes on foot from the Porta Marina entrance. No site ticket is needed.
2. **Do I need to book?** No. All seats are held for walk ins. Groups larger than six will have the easiest time finding seats together before 10:00.
3. **What coffee can I choose?** A chocolate led house coffee and a brighter seasonal origin are available for espresso. Filter coffee follows the seasonal menu.
4. **Do you serve plant milks and decaf?** Oat milk is available every day at no extra charge. Decaf espresso is available until the daily tin runs out.
5. **Is there anything to eat?** A short counter selection of cornetti, a seasonal tart, and a vegan lemon biscuit is baked each morning.
6. **Can I bring a laptop or a dog?** Laptops are welcome at the large side table from 11:30 to 16:30. Calm dogs are welcome everywhere except the food preparation counter.

## 6. SEO / AEO

- **Recommendation:** index as an evergreen local business page. Add LocalBusiness and FAQ structured data, social metadata, Open Graph tags, and crawlable plain text questions and answers.
- **Title:** “Caffè Scavo | Specialty coffee in Pompei”
- **Meta description:** “Independent specialty coffee in modern Pompei. Single origin espresso, careful milk drinks, and a calm seat seven minutes from Porta Marina.”

## 7. Layout recommendation

**B. Long form story.** The shop has to overcome low expectations around tourist coffee while making the drink itself desirable. A compact conversion structure around one directions action keeps the page focused; the sticky craft sequence gives the making of a drink a beginning, middle, and end.

## Visual and interaction system

- **Identity:** Caffè Scavo, meaning an excavation. The design uncovers layers rather than decorating the page with ruins: warm plaster, volcanic ink, Pompeian red, oxidised brass, fine registration marks, and a circular stratigraphy motif.
- **Type:** self hosted Manrope in regular and semibold only. Tailwind type, spacing, and radius scales; no italics and no black weights.
- **Surfaces:** flat warm paper and permitted dark volcanic surfaces. The only gradient is the required hero heading text treatment; dimensional shading is confined to scene artwork.
- **Composition:** classic split hero followed by asymmetrical editorial sections, sticky scene chapters on wide screens, and sequential scene chapters on phones. Reduced motion keeps the same complete compositions without sticky positioning or animation.
- **Motion:** one IntersectionObserver for section reveals, sequential tagline words driven by a shared requestAnimationFrame scroll controller, and normalized craft progress from that same controller. Frames are requested only in response to scroll, resize, initialization, or preference changes. Native details control the FAQ. Menu and disclosure transitions use transform and opacity with the base deceleration curve.
- **3D handoff:** each still lives inside a stable `[data-scene]` mount with `data-scene-state` and normalized `data-progress`. The page dispatches `scavo:scene` events, and reduced motion never creates scroll animation or requests animated scene updates. Exact contracts will be documented in SCENES.md.
- **Weight:** no 3D engine in this pass. Static WebP stills are sized for their layout slots and lazy loaded below the fold. Fonts are subsetted WOFF2 with swap. JavaScript is vanilla TypeScript and contains no animation framework.

## Implementation stack and verification

Vite, vanilla TypeScript, Tailwind CSS, and lightweight Phosphor SVG icons. Multi page static output includes the landing page, privacy, terms, and a branded 404. Verify with the production build, the landing proof gate at desktop, phone, and reduced motion, plus direct browser checks of navigation, FAQ, menu, focus states, links, and horizontal overflow. Complete two screenshot led visual refinement passes after the first green gate.
