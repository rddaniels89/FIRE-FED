# Brand Kit

**The Art of Finance** and **FireFed** — identity system, revised September 2026.

Interactive version: https://claude.ai/code/artifact/f1f0988a-7fa2-4de3-a801-55b8e1a5cfd8

Colour and type values in this document are the ones already shipping in
`tailwind.config.js` and `src/index.css`. They are a record, not a proposal. If
you change a token in code, change it here in the same commit.

---

## Contents

| Plate | Subject |
| --- | --- |
| 01 | [Brand architecture](#plate-01--brand-architecture) |
| 02 | [Naming and handles](#plate-02--naming-and-handles) |
| 03 | [Colour](#plate-03--colour) |
| 04 | [Typography](#plate-04--typography) |
| 05 | [Marks and lockups](#plate-05--marks-and-lockups) |
| 06 | [Voice](#plate-06--voice) |
| 07 | [Applications](#plate-07--applications) |
| 08 | [Data and iconography](#plate-08--data-and-iconography) |

---

## The premise

**The argument.** Finance is taught as arithmetic and practised as judgment. The
sums are the easy half. Knowing which rule applies, and to whom, is the craft,
and that is what the name claims.

**The author.** This is a person's brand, not a publication's. Rod writes it and
appears in it. The system has to work with a face on camera, which is why the
parent is a masthead and a byline rather than a logo.

**The proof.** FireFed is the house product. Its hard problem was never the
multiplication; it was that the federal minimum retirement age runs from 55 to
57 by year of birth, and almost every tool states a flat 57.

---

## Plate 01 — Brand architecture

An endorsing parent, not a badge. The Art of Finance publishes; FireFed
calculates. The parent lends credibility and never competes for the product's
attention. A reader arrives at an essay and leaves with a tool.

```
                  The Art of Finance
          Masthead · essays, video, courses
            Written and presented by Rod
      ┌───────────────────┬───────────────────┐
      │  FireFed          │  Product two      │
      │  (navy)           │  (unassigned)     │
      │  Federal          │  Inherits ink,    │
      │  retirement       │  paper, brass;    │
      │  planner.         │  adds exactly one │
      │  Shipping.        │  colour of its    │
      │                   │  own.             │
      └───────────────────┴───────────────────┘
```

### Which brand leads

| Context | Leads | Endorsement |
| --- | --- | --- |
| Newsletter, video, course | The Art of Finance | None. The parent is the author. |
| Product marketing site | FireFed | Footer line, parent set small. |
| Inside the product | FireFed alone | None. Never in the app chrome. |
| An essay about the product | The Art of Finance | FireFed named in body copy, not as a logo. |
| Conference slide, press | Both | Stacked lockup, Plate 05. |

---

## Plate 02 — Naming and handles

The name is a claim. The handle is an address.

The channel currently answers to `@rod-theartoffinance3884`. Those four digits
are YouTube's collision suffix, not a choice, and they ride along in every share
link, every end card, and every attempt to type the name from memory. Claiming
one handle everywhere is the cheapest brand work available.

### Canonical strings

| Surface | Canonical | Note |
| --- | --- | --- |
| Video, social | `@theartoffinance` | One string on every platform, even where a shorter one is free. |
| Newsletter, web | `theartoffinance.com` | The parent owns the root. Products sit beneath it or on their own domain. |
| Product | `FireFed` | One word, capital F twice. Never *Fire Fed*, never *FIREfed*. |
| Byline | `Rod · The Art of Finance` | Middot, not an em dash, so it survives plain-text fields. |

### Rules

- The article is part of the name. It is *The Art of Finance* in every headline.
  Never *Art of Finance*, and never *AoF* outside internal notes.
- Rod's name leads on camera and in the byline. The brand name leads on the
  masthead and the thumbnail. They never both lead in the same frame.
- The product is not a sub-name of the parent. It is FireFed, endorsed by
  The Art of Finance, set as the lockup in Plate 05.
- A handle that differs by platform is a handle nobody can recall. If the
  canonical string is taken somewhere, take the nearest variant everywhere, not
  a better one in one place.

---

## Plate 03 — Colour

Brass is the family; navy belongs to one product. The palette carries the
architecture. Ink, paper and brass are shared by everything under the masthead.
A product earns exactly one colour of its own, which is how you tell products
apart at a glance.

| Name | Hex | Use |
| --- | --- | --- |
| Ink | `#13151A` | Parent ground and body text. A near-black pulled very slightly blue so it never reads as printer black. |
| Paper | `#F7F6F3` | Light ground. Warm by a hair, not cream. It should read as stock, not as a colour choice. |
| Brass | `#B3923F` | The family accent, shared by every brand in the house. Rules, marks, one figure per view. Never a fill behind body text. |
| Navy | `#2E4A96` | FireFed only. Interactive elements and the active state. No other product may use it. |
| Graphite | `#5F5B52` | Parent neutral, biased warm to sit under brass. FireFed keeps a cool slate instead, and the two neutrals are how the brands differ before you notice the accent. |

### Product ramps, as shipped

These are the values in `tailwind.config.js` today. The brass ramp replaced an
orange-leaning amber whose 500 was `#e99c47`, because it read as a warning
colour beside navy.

**Navy**

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#f0f4f8` | `#d9e4f0` | `#b6cde6` | `#85a8d8` | `#5b7fc7` | `#3b5eb5` | `#2e4a96` | `#253d7a` | `#1f3266` | `#1a2b55` |

**Brass** (named `gold` in the Tailwind config)

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#fbf9f2` | `#f5eeda` | `#e9dcb4` | `#d8c486` | `#c5a95c` | `#b3923f` | `#977932` | `#79612a` | `#634e27` | `#524123` |

---

## Plate 04 — Typography

A didone against a ledger. The parent sets its display in Bodoni Moda, the face
of exhibition catalogues and fashion plates, deliberately at odds with a subject
people expect in a spreadsheet. That collision is the brand's whole argument in
one typeface.

| Face | Role | Weights |
| --- | --- | --- |
| Bodoni Moda | Display, parent only | 400, 400 italic |
| Archivo | Body, parent | 400, 500, 600 |
| IBM Plex Mono | Figures, labels, plate numbers | 400, 500 |
| Inter | FireFed interface, product only | 400, 500, 600, 700 |

All four are on Google Fonts. FireFed already loads Inter with
`font-feature-settings: 'cv11', 'ss01'`; Open Sans was dropped as unused.

### Rules

- Bodoni never appears inside the product, and Inter never appears on the
  masthead. Type alone should tell a reader which brand they are looking at.
- Set Bodoni tight, `-0.025em` at display sizes, and never below 20px. A didone
  at caption size loses its hairlines and turns to mud.
- Every figure is tabular. Columns of numbers that shift as they update read as
  unreliable, which is the one thing a finance brand cannot afford.
- Italic Bodoni is reserved for the word *Art* in the wordmark and for emphasis
  in pull quotes. It is not a general-purpose emphasis style.

---

## Plate 05 — Marks and lockups

The parent mark is a hairline frame cut by a single rule: a picture frame and a
ledger line drawn as one figure. It is built from two strokes so it survives at
16px and in one colour.

```svg
<svg width="48" height="48" viewBox="0 0 48 48">
  <rect x="4.5" y="4.5" width="39" height="39" fill="none"
        stroke="currentColor" stroke-width="1.25" />
  <line x1="4.5" y1="30" x2="43.5" y2="30"
        stroke="#B3923F" stroke-width="2.5" />
</svg>
```

At sizes below 24px, thicken to `1.25 → 2` and `2.5 → 4` so the rule holds.

| Lockup | Composition |
| --- | --- |
| Primary mark | Frame 1.25pt, brass rule 2.5pt at the lower third. |
| Horizontal | Mark, then wordmark in Bodoni. Clear space equals the frame width on all sides. |
| Product mark | Flame plus `FireFed` in Inter semibold, `-0.02em`, with `Fed` in navy. |
| Endorsed | `FireFed` over `AN ART OF FINANCE PRODUCT` in mono. |

The FireFed flame is `src/components/AnimatedFlame.jsx`. Its gradient stops:

| Layer | Stops |
| --- | --- |
| Outer | `#ffdd7a` → `#ff8a2a` → `#ff3d5a` → `#6d28d9` |
| Inner | `#fff2b5` → `#ffd166` → `#fb923c` |
| Core | `#ffffff` → `#ffe9a8` → `#ff9a3c` |

### Lockup rules

- The two marks never sit side by side at equal weight. Either the parent leads
  and FireFed is named in text, or FireFed leads and the parent appears as the
  small endorsement line.
- The endorsement line is IBM Plex Mono, uppercase, tracked `0.16em`, at most
  60% of the product wordmark's cap height. It is a credit, not a second logo.
- The brass rule in the parent mark is the only place brass is allowed to touch
  the frame. On a brass ground the rule becomes ink.
- Neither mark is ever placed on a photograph without a solid ink or paper panel
  behind it.

---

## Plate 06 — Voice

**The parent may argue. The product may not.** This is the sharpest split in the
system, and it is a legal one as much as an editorial one. An essay can hold an
opinion. A retirement projection that holds an opinion is unlicensed financial
advice.

### The Art of Finance — write

- "Most tools tell you the minimum retirement age is 57. For anyone born before
  1970, that is wrong."
- "The supplement is the most valuable benefit most federal employees have never
  heard of."
- Take a position. Name what other people get wrong. Show the arithmetic that
  proves it.
- First person singular. Rod says "I ran the numbers", never "we". A house voice
  on a one-person channel reads as a costume.
- Address the reader as *you*, use active voice, and put a number in the first
  two sentences.

### FireFed — never write

| Never | Instead |
| --- | --- |
| "You should retire at 57." | "Projected sustainable separation age: 57." |
| "We recommend the Roth." | "At your marginal rate, Roth contributions cost $2,140 more this year." |
| "You're on track!" | "Under these assumptions the balance does not run short before age 95." |

- No *should*, no *recommend*, no *best*. Every figure carries "projected" or
  "under these assumptions".
- No exclamation marks, no congratulation, no verdicts on someone's numbers.

### Shared across both

- Cite the primary source, never a summary of it. Every rule in the product
  links to OPM, the IRS or SSA with the year it applies to and the date it was
  last checked. See `docs/DIFFERENTIAL-TESTING.md`.
- Say the specific federal thing. *Separation age* and *annuity start age* are
  two different dates and are never both called "retirement age".
- Where the model simplifies, say so in the same breath as the number.
  Undisclosed approximation is the failure mode the whole brand is positioned
  against.

---

## Plate 07 — Applications

Three surfaces, one system. The masthead is editorial and set in Bodoni. The
product is an instrument and set in Inter. Both are ruled, both are tabular, and
brass appears once per view in each.

**Newsletter header.** Issue number left, masthead right, hairline under. The
headline is the argument, never a topic label.

> No. 41 ——————————————— The Art of Finance
> **The retirement age that isn't 57**
> Five tools, one table, and a rule almost everyone states wrong.

**Video end card.** Ink ground, brass kicker in mono, Bodoni claim. One idea,
set large enough to read at thumbnail size. The byline sits bottom-left.

**Product navigation.** Inter, Lucide icons at 1.75 stroke, active state as a
soft navy wash. No parent mark in app chrome.

---

## Plate 08 — Data and iconography

Figures are the house style. Both brands live on tables. The rule is the same in
an essay and in the product: hairline rules, uppercase heads, tabular figures,
and no fill behind a row unless it means something.

Specimen — FERS minimum retirement age by year of birth, the table the product
was built around:

| Year of birth | Minimum retirement age | Note |
| --- | --- | --- |
| 1953–1964 | 56 | Flat |
| 1965 | 56 y 2 m | Transition band |
| 1966 | 56 y 4 m | Transition band |
| 1969 | 56 y 10 m | Transition band |
| 1970 and later | 57 | Flat |

Implemented in `src/lib/calculations/mra.js`.

### Icons

- Drawn icons only, from Lucide, at `1.75` stroke weight. **No emoji anywhere in
  either brand.** Emoji render differently on every platform and carry colours
  that fight the palette.
- Icons sit in muted graphite by default and take brass or navy only when the
  thing they mark is itself active.
- An icon never carries meaning alone. If it is the only label, it is a bug.

### Surfaces

The shadow scale in `tailwind.config.js`:

| Token | Value |
| --- | --- |
| `soft` | `0 1px 2px 0 rgb(15 23 42 / 0.04)` |
| `card` | `0 1px 2px 0 rgb(15 23 42 / 0.03), 0 4px 12px -4px rgb(15 23 42 / 0.06)` |
| `lift` | `0 2px 4px -1px rgb(15 23 42 / 0.05), 0 12px 28px -8px rgb(15 23 42 / 0.12)` |
| `inset` | `inset 0 1px 0 0 rgb(255 255 255 / 0.06)` |

- One hairline border and a soft shadow. Border plus a heavy shadow on every
  card flattens the hierarchy.
- A panel inside a panel gets a tinted ground, never a second border. Boxes
  inside boxes read as a spreadsheet.
- Lift exactly one surface per view. If everything is raised, nothing is.

---

## Colophon

Bodoni Moda · Archivo · IBM Plex Mono · Inter.
Product values as shipped, September 2026.
