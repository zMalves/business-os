# Executive SaaS — Style Reference
> Architectural intelligence on Cyprus & Sand

**Theme:** light (warm editorial & high-density SaaS)

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML/CSS examples are production-ready architectural design tokens.

The system reads as a luxury, high-conversion B2B/Executive SaaS platform: a warm **Sand (`#F0EDE5`)** canvas anchored by authoritative, deep **Cyprus (`#004643`)** structural blocks and typography, punctuated by surgical status accents — a vibrant mint for active states, a warm amber for priorities, and crisp white card elevations. The system rejects both the sterile, hospital-white default of generic SaaS and the muddy dark-mode fatigue of developer tools: corners balance surgical 6–8px precision on data-dense cards with extreme 9999px pill rounding on interactive controls and status chips. Typography pairs tight, authoritative display cuts with an ultra-legible geometric sans workhorse for high-speed scanning of metrics, chats, and tables. Density is compact, executive-led, and built for complex workflows.

---

## Tokens — Colors

### Primary Palette: Cyprus & Sand Combo

| Name | Value | Token | Role |
|------|-------|-------|------|
| **Sand Canvas** | `#F0EDE5` | `--color-sand` | Primary page canvas, workspace backdrop, foundation tone |
| **Sand Light** | `#F8F6F1` | `--color-sand-light` | Elevated card surfaces, dashboard modules, modal backdrops |
| **Sand Surface** | `#FFFFFF` | `--color-surface-pure` | Data table rows, active input fields, floating popovers |
| **Sand Muted** | `#E4DFC8` | `--color-sand-muted` | Secondary card fills, sidebar hover states, list dividers |
| **Sand Border** | `#D8D2C5` | `--color-sand-border` | Subtle dividers, grid lines, default input strokes |
| **Cyprus** | `#004643` | `--color-cyprus` | Primary brand anchor — main CTA fills, active navigation, brand headers |
| **Cyprus Deep** | `#003330` | `--color-cyprus-deep` | Primary button hover, active sidebar items, header accents |
| **Cyprus Dark** | `#002220` | `--color-cyprus-dark` | Inverse high-contrast surfaces, dark executive cards, code blocks |
| **Cyprus Ink** | `#091B1A` | `--color-ink` | Primary body text, table headers, maximum readability near-black |
| **Cyprus Slate** | `#3B5855` | `--color-slate` | Secondary body text, field labels, metadata, inactive icons |
| **Cyprus Muted** | `#708A87` | `--color-muted` | Placeholder text, disabled labels, subtle timestamps |
| **Mint Active** | `#2EC4B6` | `--color-mint` | Success indicators, online status dots, completed tags, positive ROAS |
| **Amber Priority** | `#E09F3E` | `--color-amber` | Pending reminders, warnings, medium-priority tags, attention pills |
| **Coral Alert** | `#E76F51` | `--color-coral` | High-priority tasks, error states, disconnect warnings, critical badges |

---

## Tokens — Typography

### Primary Display — Headline & Authority (`--font-display`)
- **Primary:** `Outfit` (or `Plus Jakarta Sans`, `Haffer XH`, `Inter Display`)
- **Weights:** 600 (SemiBold), 700 (Bold), 800 (ExtraBold)
- **Sizes:** 32px, 40px, 48px, 64px, 80px, 112px
- **Line height:** 0.95–1.15
- **Letter spacing:** -0.04em at 64px+ down to -0.02em at 32px
- **Role:** Executive SaaS hero headings, modal titles, KPI giant metrics, landing page value propositions

### UI & Body Workhorse — High Legibility (`--font-sans`)
- **Primary:** `Outfit` / `Inter` / `Plus Jakarta Sans`
- **Weights:** 400 (Regular), 500 (Medium), 600 (SemiBold)
- **Sizes:** 11px, 12px, 13px, 14px, 15px, 16px, 18px, 20px
- **Line height:** 1.30–1.60
- **Letter spacing:** -0.01em at 16px down to normal at 11px
- **Role:** Paragraphs, form inputs, button labels, data tables, chat message bubbles, sidebar menu items

### Technical Mono — Data & System Metadata (`--font-mono`)
- **Primary:** `JetBrains Mono` / `IBM Plex Mono` / `SF Mono`
- **Weights:** 400 (Regular), 500 (Medium)
- **Sizes:** 10px, 11px, 12px, 13px
- **Line height:** 1.20–1.40
- **Role:** Timestamps, token usage, API keys, currency metrics, CRON schedules, system logs, code blocks

---

### Type Scale

| Role | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|------|-------------|----------------|-------|
| `mono-badge` | 500 | 10px | 1.00 | +0.02em | `--text-mono-badge` |
| `mono-data` | 400 | 12px | 1.25 | 0 | `--text-mono-data` |
| `caption` | 500 | 12px | 1.40 | 0 | `--text-caption` |
| `body-sm` | 400 | 13px | 1.45 | -0.005em | `--text-body-sm` |
| `body` | 400 | 15px | 1.50 | -0.01em | `--text-body` |
| `body-emphasis` | 600 | 15px | 1.50 | -0.01em | `--text-body-emphasis` |
| `subheading` | 600 | 20px | 1.30 | -0.02em | `--text-subheading` |
| `heading-sm` | 700 | 28px | 1.20 | -0.025em | `--text-heading-sm` |
| `heading` | 700 | 40px | 1.10 | -0.03em | `--text-heading` |
| `heading-lg` | 800 | 56px | 1.05 | -0.035em | `--text-heading-lg` |
| `display` | 800 | 80px | 0.95 | -0.045em | `--text-display` |

---

## Tokens — Spacing & Layout

**Density:** Compact & content-dense (engineered for high productivity and executive overview).

### Spacing Scale

| Name | Value | Token | Usage |
|------|-------|-------|-------|
| 2 | 2px | `--spacing-2` | Micro border offsets, indicator gaps |
| 4 | 4px | `--spacing-4` | Badge padding, icon gap |
| 6 | 6px | `--spacing-6` | Compact button vertical padding |
| 8 | 8px | `--spacing-8` | Component inner elements, standard gap |
| 12 | 12px | `--spacing-12` | Input vertical padding, list item gaps |
| 16 | 16px | `--spacing-16` | Standard card internal padding, column gaps |
| 20 | 20px | `--spacing-20` | Container padding, module spacing |
| 24 | 24px | `--spacing-24` | Large card padding, section sub-gaps |
| 32 | 32px | `--spacing-32` | Grid gaps, modal internal padding |
| 48 | 48px | `--spacing-48` | Major layout section transitions |
| 64 | 64px | `--spacing-64` | Landing page section vertical spacing |

---

### Border Radius Hierarchy

The SaaS system balances **structured content precision** with **tactile control pills**:

| Element | Radius | Token | Purpose |
|---------|--------|-------|---------|
| Sharp Tiles / Code | 4px | `--radius-xs` | Technical chips, code blocks, calendar day slots |
| Standard Cards | 8px | `--radius-sm` | Feature cards, data tables, metrics modules |
| Modals & Drawers | 14px | `--radius-md` | Popovers, slide-over panels, floating dialogs |
| Input Fields | 8px | `--radius-input` | Form controls, search bars, textarea wrappers |
| Buttons & Pills | 9999px | `--radius-pill` | Primary CTAs, status badges, filter chips, nav toggles |

---

## SaaS Core Components

### 1. Cyprus Primary Button
**Role:** Primary action, high-conversion trigger
- **Background:** Cyprus (`#004643`)
- **Text:** Sand Canvas (`#F0EDE5`) in 14px weight 600
- **Border:** 1px solid transparent
- **Radius:** 9999px (full pill)
- **Padding:** 10px 22px
- **Hover:** Background shifts to Cyprus Deep (`#003330`) with a subtle transform `translateY(-1px)` and shadow `0 6px 16px rgba(0, 70, 67, 0.20)`

### 2. Sand Secondary Button / Ghost Outline
**Role:** Secondary actions, cancel, navigation controls
- **Background:** Transparent or Sand Light (`#F8F6F1`)
- **Text:** Cyprus (`#004643`) weight 600
- **Border:** 1px solid Cyprus (`#004643`) or Sand Border (`#D8D2C5`)
- **Radius:** 9999px (full pill)
- **Padding:** 10px 20px
- **Hover:** Background shifts to `rgba(0, 70, 67, 0.08)`, border darkens to Cyprus

### 3. Metric & KPI Stat Card
**Role:** Real-time dashboards, executive summaries, AI usage
- **Background:** Sand Light (`#F8F6F1`) or Pure White (`#FFFFFF`)
- **Border:** 1px solid Sand Border (`#D8D2C5`)
- **Radius:** 8px
- **Padding:** 20px
- **Content:**
  - Label: Cyprus Slate (`#3B5855`) at 12px uppercase weight 600
  - Giant Value: Cyprus (`#004643`) at 32px display weight 800
  - Trend Indicator: Pill badge with Mint fill (`rgba(46, 196, 182, 0.15)`) + Mint text (`#2EC4B6`) for growth

### 4. Interactive AI Chat & Prompt Bar
**Role:** Conversational executive assistant, natural language input
- **Wrapper:** Sand Light (`#F8F6F1`) with 1px solid Sand Border (`#D8D2C5`), radius 12px, soft shadow
- **Input Text:** Cyprus Ink (`#091B1A`) at 15px
- **Focus Ring:** 2px solid Cyprus (`#004643`) with `box-shadow: 0 0 0 3px rgba(0, 70, 67, 0.12)`
- **Action Triggers:** Pill icons in Cyprus (`#004643`) for Voice, Attachments, and Send

### 5. High-Density Data Table Row
**Role:** Task lists, scheduled jobs, lead tables, transaction logs
- **Row Height:** 48px–54px
- **Border Bottom:** 1px solid Sand Border (`#D8D2C5`)
- **Background:** Pure White (`#FFFFFF`) or Sand Light (`#F8F6F1`)
- **Hover:** Subtle tint `rgba(0, 70, 67, 0.04)`
- **Text:** Primary cell in Cyprus Ink (`#091B1A`) weight 500; timestamps in Mono (`#708A87`)

### 6. Status & Role Badges (Pills)
**Role:** Live status, category markers, filter chips
- **Radius:** 9999px
- **Padding:** 3px 10px
- **Active / Online:** Background `rgba(46, 196, 182, 0.15)`, text `#004643`, 6px green indicator dot
- **Pending / Syncing:** Background `rgba(224, 159, 62, 0.15)`, text `#A06714`, pulsating dot
- **Offline / Error:** Background `rgba(231, 111, 81, 0.15)`, text `#C14425`

### 7. Featured SaaS Pricing / Tier Card
**Role:** Conversion, plan upgrades
- **Standard Card:** Sand Light (`#F8F6F1`) background, 1px Sand Border, Cyprus CTA button
- **Featured / Pro Card:** Deep Cyprus (`#004643`) background, Sand text (`#F0EDE5`), Mint badge `"RECOMMENDED"`, White pill button

---

## Do's and Don'ts

### Do
- **Use Sand (`#F0EDE5`) as the universal canvas:** It gives an immediate high-end editorial and humanized feel, differentiating from clinical white apps.
- **Use Cyprus (`#004643`) for primary focal points:** Buttons, main navigation, highlighted headers, active icons.
- **Respect the 8px/Pill duality:** Use clean 8px radius on rectangular data containers (cards, tables, inputs) and 9999px pills on interactive elements (buttons, badges, tabs).
- **Use tight negative tracking on headlines:** `-0.02em` to `-0.04em` gives modern SaaS headlines an authoritative, premium feel.
- **Render metadata and technical info in Monospace:** Dates, IDs, tokens, cron triggers, and metrics belong in mono fonts.

### Don'ts
- **Don't use generic cold grays:** Avoid `#E5E7EB` or `#F3F4F6`. Stick strictly to the warm Sand tones (`#F0EDE5`, `#F8F6F1`, `#D8D2C5`).
- **Don't use pure black (`#000000`) for text:** Use Cyprus Ink (`#091B1A`) — it provides softer contrast and unifies with the palette.
- **Don't apply cartoonish, heavy drop shadows:** Use subtle, multi-layered shadows with a touch of Cyprus tint: `rgba(0, 70, 67, 0.06)`.
- **Don't round cards to extreme pills:** A card with 24px+ radius wastes horizontal space in dense dashboards. Keep content cards at 8px.
- **Don't overuse accent colors:** Mint, Amber, and Coral are for status and feedback only — never as general page backgrounds.

---

## Surfaces Hierarchy

| Level | Name | Hex / Value | Purpose |
|-------|------|-------------|---------|
| **0** | **Canvas** | `#F0EDE5` | Page background, workspace canvas, main window shell |
| **1** | **Surface Elevated** | `#F8F6F1` | Primary cards, content modules, sidebar container |
| **2** | **Surface Pure** | `#FFFFFF` | Form inputs, data table rows, active tab containers, popovers |
| **3** | **Brand Hero** | `#004643` | Cyprus primary CTAs, active status headers, brand accent banners |
| **4** | **Inverse Dark** | `#002220` | High-contrast dark cards, code viewers, terminal outputs |

---

## Agent Prompt Guide (Copy-Paste Reference)

**Quick Color Reference:**
- `Canvas (Sand):` `#F0EDE5`
- `Surface (Card):` `#F8F6F1` / `#FFFFFF`
- `Border:` `#D8D2C5`
- `Primary / Accent (Cyprus):` `#004643`
- `Hover (Cyprus Deep):` `#003330`
- `Text Primary (Ink):` `#091B1A`
- `Text Muted (Slate):` `#3B5855`
- `Success / Active (Mint):` `#2EC4B6`

**Example Component Specifications:**
1. **SaaS Topbar:** Height 64px, Sand Canvas (`#F0EDE5`) with 1px bottom border (`#D8D2C5`), sticky blur. Brand logo in Cyprus (`#004643`) 18px font-weight 700. Action pill buttons on the right.
2. **Dashboard Card:** Background `#F8F6F1`, border 1px solid `#D8D2C5`, radius 8px, padding 24px. Title in Cyprus Ink (`#091B1A`) 18px weight 600.
3. **Primary CTA Button:** Background `#004643`, text `#F0EDE5`, radius 9999px, padding 10px 24px, font-weight 600. Hover: `#003330`.
4. **Status Chip:** Background `rgba(0, 70, 67, 0.08)`, border `1px solid rgba(0, 70, 67, 0.20)`, text `#004643`, font-size 12px, radius 9999px.

---

## Implementation Reference (CSS & Tailwind)

### CSS Custom Properties

```css
:root {
  /* Colors — Cyprus & Sand Palette */
  --color-sand: #F0EDE5;
  --color-sand-light: #F8F6F1;
  --color-surface-pure: #FFFFFF;
  --color-sand-muted: #E4DFC8;
  --color-sand-border: #D8D2C5;

  --color-cyprus: #004643;
  --color-cyprus-deep: #003330;
  --color-cyprus-dark: #002220;
  --color-cyprus-subtle: rgba(0, 70, 67, 0.08);
  --color-cyprus-glow: rgba(0, 70, 67, 0.20);

  --color-ink: #091B1A;
  --color-slate: #3B5855;
  --color-muted: #708A87;

  /* Functional Status Accents */
  --color-mint: #2EC4B6;
  --color-amber: #E09F3E;
  --color-coral: #E76F51;

  /* Typography */
  --font-display: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-sans: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;

  /* Spacing */
  --spacing-2: 2px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-48: 48px;
  --spacing-64: 64px;

  /* Border Radius */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-pill: 9999px;

  /* Shadows tuned for Sand */
  --shadow-sm: 0 1px 3px rgba(0, 70, 67, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 70, 67, 0.07);
  --shadow-lg: 0 12px 28px rgba(0, 70, 67, 0.12);
  --shadow-primary: 0 6px 18px rgba(0, 70, 67, 0.22);
}
```

### Tailwind v4 `@theme`

```css
@theme {
  /* Colors */
  --color-sand: #F0EDE5;
  --color-sand-light: #F8F6F1;
  --color-sand-muted: #E4DFC8;
  --color-sand-border: #D8D2C5;
  
  --color-cyprus: #004643;
  --color-cyprus-deep: #003330;
  --color-cyprus-dark: #002220;
  
  --color-ink: #091B1A;
  --color-slate: #3B5855;
  --color-muted: #708A87;

  --color-mint: #2EC4B6;
  --color-amber: #E09F3E;
  --color-coral: #E76F51;

  /* Fonts */
  --font-display: 'Outfit', sans-serif;
  --font-sans: 'Outfit', 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Radii */
  --radius-card: 8px;
  --radius-modal: 14px;
  --radius-pill: 9999px;
}
```
