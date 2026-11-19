# THOUGHTSEEDS PWA — COMPLETE FIGMA UI DESIGN SPEC
**Version:** CLI-Compatible (for Gemini CLI / Claude Opus / OpenClaw)
**Product:** ThoughtSeeds
**Tagline:** Plant the thoughts that usually disappear
**Design Philosophy:** Extremely spacious, encouraging, smooth, and joyful. Massive whitespace everywhere. Nothing compact or stressful. Soft organic aesthetic that feels alive and calming. Every screen must feel like a gentle garden.

## GLOBAL STYLE GUIDE (Apply to Every Screen)
**Color Palette (use as CSS variables):**
- Primary Sage: #A8B5A2
- Accent Warm Beige: #F5EDE3
- Deep Navy: #1E2A44
- Soft Glow: #E8F0E5 (30% opacity for shadows/glows)
- Text Dark: #1E2A44
- Text Light: #F5EDE3

**Typography (free Google Fonts):**
- Headings: Playfair Display (serif, 48–72px, light tracking)
- Body / Insights: Inter (400–500 weight, 18–24px, line-height 1.6)
- Buttons / Labels: Inter Medium (18px)

**Design Rules (enforced everywhere):**
- Minimum 48px padding on mobile screens
- All cards and buttons have 32–48px border-radius
- Soft drop shadows: 0 20px 40px rgba(30,42,68,0.12)
- Gentle tap/hover states: scale 1.03 + soft glow
- Encouraging micro-copy only (e.g., “What just floated by…”, “Plant it gently”)
- Animations: 300ms ease-out (smooth, never abrupt)
- Mobile-first: iPhone 16 Pro size (393×852 px)
- PWA feel: large touch targets (minimum 64px tall buttons)

## SCREEN 1 — LANDING PAGE
- Background: vertical gradient from #F5EDE3 to #E8F0E5
- Very faint floating seed particles (soft ellipses + leaf shapes, low opacity)
- Top: 80px empty space
- Centered small green seed icon + “ThoughtSeeds” in Playfair 36px
- Main headline (Playfair 56px, line-height 1.1, centered): “Plant the thoughts that usually disappear”
- Subheadline (Inter 22px, centered): “Your mind’s quiet genius, finally captured.”
- Huge primary button (full width, 72px tall, border-radius 48px, sage background, white text): “Open My Garden”
- Tiny encouraging link at bottom: “Already have seeds? Sign in”
- Footer text (tiny navy): “Made with wu wei”

**Flow:** Tap button → goes to Auth Screen

## SCREEN 2 — AUTH SCREEN
- Same soft gradient background
- Large centered headline: “Welcome back to your garden”
- Two massive spaced buttons (40px apart, 64px tall):
  1. Dark navy button: “Continue with Magic Link”
  2. Warm beige button with sage border: “Try without account (local)”
- Optional email input field below (64px tall, rounded)
- Massive padding (80px top and bottom) — everything feels open and inviting

**Flow:** Success → directly to Garden Canvas

## SCREEN 3 — MAIN GARDEN CANVAS SCREEN
- Full-bleed canvas area (feels like an infinite gentle garden)
- Background: very light #F5EDE3 with subtle low-opacity soil/leaf texture
- Persistent FAB (floating action button): 72px circle in bottom-right, sage fill, white seed icon, continuous gentle pulse animation (scale 1.05 ↔ 1.0)
- Seed cards on canvas: soft beige rounded rectangles (minimum 180×140px), soft shadows, gentle glow on hover
  - Inside each card: poetic title (Playfair 22px) + short insight snippet (Inter 16px, max 2 lines)
  - Tiny connection dot handles on edges for manual linking
- Top bar: minimal — just today’s date + “My Garden” title (24px padding)
- Empty state (if no seeds yet): huge centered single seed illustration + encouraging text “Your first thought is waiting…” + big “Capture now” button

## SCREEN 4 — CAPTURE MODAL (opens over Garden)
- Semi-transparent navy overlay (20% opacity)
- Modal card: 90% width, ~520px tall, massive 48px border-radius
- Top: two soft pill tabs — “Voice” and “Text” (120px wide each)
- Voice mode:
  - Enormous centered microphone icon (120px)
  - Animated pulsing green ring around it
- Text mode:
  - Huge focused textarea (full width, 240px tall)
  - Placeholder text: “What just floated by…”
- Bottom: large encouraging button (72px tall, full width, sage): “Plant This Thought”

## SCREEN 5 — SEED CARD DETAIL MODAL
- Full-screen slide-up modal
- Large header with poetic title
- Scrollable deep insight paragraph (spacious line height)
- Soft beige box for visual metaphor description
- Bottom action bar: three large soft buttons spaced out — “Edit” • “Connect to another seed” • “Close”

## SCREEN 6 — DAILY BLOOM SCREEN (full-screen takeover on first open of day)
- Centered bloom card (340×420px) with soft outer glow and subtle particle sparkles
- Tiny animated bloom icon at top
- Headline (Playfair): “Today’s Bloom”
- One beautiful synthesized insight paragraph (spacious typography)
- Two large buttons at bottom:
  - “Back to Garden”
  - “Capture another thought”

## COMPONENT LIBRARY (Create as separate frames)
- FAB Button (with pulse animation)
- Seed Card (variants: default, connected, selected)
- Capture Modal Tabs (Voice/Text)
- Organic Button (primary + secondary)
- Daily Bloom Card

## PROTOTYPE FLOWS TO BUILD
1. Landing → Auth → Garden
2. Garden → Tap FAB → Capture Modal → Plant → new card animates gently onto canvas
3. Tap any card on canvas → Detail Modal
4. First open of day automatically shows Daily Bloom overlay

## IMPLEMENTATION NOTES FOR DEVELOPER / AI CODE GEN
- Use Auto Layout everywhere in Figma
- All measurements in px
- Export frames at 1x for iPhone 16 Pro (393×852)
- Ready for 1:1 handoff to Vite + React + Tailwind code
- Keep the feeling: joyful, spacious, encouraging — like stepping into a real peaceful garden

This entire spec is now pure, clean Markdown. Copy and paste directly into Gemini CLI, Claude Opus, or OpenClaw. No images, no special formatting that breaks CLI parsers. It contains everything needed to recreate the full Figma file or generate matching code.

Ready for next step — tell me when you want the exact Tailwind + React code that matches this 1:1.