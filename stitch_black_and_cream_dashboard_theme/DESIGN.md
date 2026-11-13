---
name: Obsidian Sentinel
colors:
  surface: '#121316'
  surface-dim: '#121316'
  surface-bright: '#38393d'
  surface-container-lowest: '#0d0e11'
  surface-container-low: '#1b1b1f'
  surface-container: '#1f1f23'
  surface-container-high: '#292a2d'
  surface-container-highest: '#343538'
  on-surface: '#e3e2e6'
  on-surface-variant: '#bdc9c8'
  inverse-surface: '#e3e2e6'
  inverse-on-surface: '#2f3034'
  outline: '#889392'
  outline-variant: '#3e4948'
  surface-tint: '#81d5d3'
  primary: '#a7fcfa'
  on-primary: '#003736'
  primary-container: '#8bdfdd'
  on-primary-container: '#006463'
  inverse-primary: '#006a69'
  secondary: '#ffb4a6'
  on-secondary: '#670600'
  secondary-container: '#8f1103'
  on-secondary-container: '#ff9a88'
  tertiary: '#ffe8e4'
  on-tertiary: '#690000'
  tertiary-container: '#ffc2b8'
  on-tertiary-container: '#ab2417'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#9df1ef'
  primary-fixed-dim: '#81d5d3'
  on-primary-fixed: '#00201f'
  on-primary-fixed-variant: '#00504f'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#ffb4a6'
  on-secondary-fixed: '#400200'
  on-secondary-fixed-variant: '#8f1103'
  tertiary-fixed: '#ffdad4'
  tertiary-fixed-dim: '#ffb4a8'
  on-tertiary-fixed: '#410000'
  on-tertiary-fixed-variant: '#900d06'
  background: '#121316'
  on-background: '#e3e2e6'
  surface-variant: '#343538'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  title-md:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-lg: 1rem
  margin: 1rem
  margin-lg: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

## Brand & Style

This design system delivers a mission-critical, high-density tactical interface engineered specifically for autonomous cybersecurity operations centers (SOC) and defensive AI threat-hunting environments. The mood is precise, vigilant, and calculating—balancing extreme data density with zero visual friction.

The design movement synthesizes **Futuristic Military Minimal / Cyber-Tactical HUD** with technical glassmorphism. It uses deep obsidian multi-tier canvas backdrops, fine-hairline telemetry framing, tactical corner accents, and luminescent optical glows. Threat signals cut through darkness with high chromatic precision, allowing analysts to instantly parse threat vector hierarchies, model weights, and agent health across dense telemetry grids.

## Colors

The palette leverages a calibrated dark-mode hierarchy designed to minimize optical fatigue across 12-hour operational shifts while preserving strict semantic color discipline:

- **Primary Canvas & Surfaces**:
  - Root Canvas: `#08090C` (Absolute Obsidian base)
  - Surface Level 1 (Panels, Nav, HUD Rails): `#0E1015`
  - Surface Level 2 (Cards, Modules, Hover Cells): `#14171F`
  - Surface Accent/Header: `#1B202B`
  - Hairline Border Token: `rgba(139, 223, 221, 0.14)` and `rgba(255, 255, 255, 0.08)`

- **Accent & Operational Telemetry**:
  - `Cyber Cyan (#8BDFDD)`: Signals authorized status, active neural nodes, primary metric graphs, focal telemetry readouts, and primary active states.
  - `Alert Crimson Red (#F05941)`: Reserved for severe threat anomalies, active radar intercepts, zero-day alerts, and destructive action triggers.
  - `Deep Crimson Red (#830000)`: Used for alert backdrops, degraded boundary glows, quarantined zone fills, and severe hazard containment frames.

- **Content & Typography Surfaces**:
  - `Warm Linen (#F4F0E2)`: Body content, sub-labels, tabular data feeds.
  - `Soft Off-White Linen (#FAF0E6)`: Metric KPIs, module headers, high-order callouts.
  - `Muted Tactical Slate (#687284)`: Structural metadata, micro-timestamps, disabled nodes.

## Typography

The typographic hierarchy addresses split-second readability in data-intensive mission spaces:

- **Space Grotesk** commands display titles and panel headers with sharp geometric clarity, instilling an advanced technical presence.
- **Inter** ensures uninterrupted scanning across tabular threat matrices, incident logs, and natural-language analysis descriptions.
- **JetBrains Mono** governs all data density touchpoints: payload hex outputs, IP addresses, model token rates, status tags, and micro-metric metadata. All monospaced labels use uppercase transforms and open letter tracking (`0.04em`–`0.08em`) to guarantee quick recognition under high stress.

## Layout & Spacing

A high-density 12-column fluid grid governs desktop displays (down to 6 columns on tablet and 2 columns on mobile devices). Gutters remain tight (`12px` to `16px`) to maximize screen efficiency and avoid unnecessary scroll debt during multi-panel incident tracking.

Structural rhythm follows a strict 4px sub-grid with tight component padding:
- **Desktop (1440px+)**: Multi-pane triage with permanent telemetry side rails (280px fixed width), flexible center stream, and docked threat inspection drawer.
- **Tablet (768px–1023px)**: Side rails collapse to condensed tactical icon bars; panels switch to modular 2-column stacks.
- **Mobile (<768px)**: Single column stream with sticky top-level status bar displaying primary operational readiness and alert counts.

## Elevation & Depth

Visual depth is achieved through layered dark obsidian values combined with low-opacity cyber-tinted luminescence rather than traditional dropped shadows:

- **Tier 0 (Root Canvas)**: `#08090C` background, textured with a faint 24px micro-grid overlay (`rgba(139, 223, 221, 0.02)`).
- **Tier 1 (Base Panels & Docks)**: `#0E1015` backed by 1px perimeter stroke of `rgba(139, 223, 221, 0.08)`.
- **Tier 2 (Interactive Cards & Tables)**: `#14171F` with sharp 1px borders in `rgba(244, 240, 226, 0.08)`.
- **Tier 3 (Active Threat / Focus States)**: Elevated via atmospheric cyan blur (`box-shadow: 0 0 20px -4px rgba(139, 223, 221, 0.25)`) or containment red blur (`box-shadow: 0 0 24px -2px rgba(131, 0, 0, 0.55), inset 0 0 12px rgba(240, 89, 65, 0.15)`).
- **Overlays & Modals**: Frosted obsidian backdrop blur (`backdrop-filter: blur(12px)`) with layered `#0E1015` fill at 85% opacity.

## Shapes

The design uses a sharp, tactical aesthetic. Base components use `4px` (`0.25rem`) corner rounding to maintain a disciplined, instrumented finish without appearing completely blunt. 

Accent elements—such as telemetry badges, tactical buttons, and active threat monitors—utilize subtle chamfered clipping (`clip-path: polygon(...)`) or outer bracket notches on top-left and bottom-right corners. Round pill formats are strictly prohibited outside of circular radar nodes and micro ping dots.

## Components

### Buttons
- **Primary Cyber Action**: `#8BDFDD` solid fill, `#08090C` bold text (`Space Grotesk` or `JetBrains Mono`), 4px radius, hover glow `box-shadow: 0 0 14px rgba(139, 223, 221, 0.45)`.
- **Critical Intercept Button**: `#830000` base with `#F05941` border, `#FAF0E6` text; active state pulses with alert crimson radiance.
- **Secondary Ghost**: Transparent surface with 1px border `rgba(139, 223, 221, 0.25)`, text `#F4F0E2`, hover background `rgba(139, 223, 221, 0.06)`.

### Cards & Threat Panels
- Constructed on `#14171F` surfaces with 1px `rgba(255, 255, 255, 0.07)` borders.
- Header bars feature subtle monospaced subsystem indicators (`SYS.01 // AGENT_DEFENSE`) in `#8BDFDD` with `#FAF0E6` panel titles.
- Critical anomaly cards add a top 2px boundary bar in `#F05941` with a linear background gradient tinting toward `#830000` at 10% opacity.

### Chips & Telemetry Tags
- Monospaced 10px uppercase text, compact padding (`2px 8px`), 2px radius.
- **Nominal/Active**: Background `rgba(139, 223, 221, 0.1)`, text `#8BDFDD`, border `rgba(139, 223, 221, 0.3)`.
- **Critical Warning**: Background `rgba(131, 0, 0, 0.35)`, text `#F05941`, border `rgba(240, 89, 65, 0.5)`. Includes a pulsating 4px `#F05941` status indicator dot.

### Lists & Telemetry Logs
- Alternating row zebra effect using `#0E1015` and `#14171F`.
- Inline cell separators use ultra-thin `rgba(255, 255, 255, 0.04)` dividers.
- Monospaced timestamping in `#687284`, IP/Hash values in `#8BDFDD`, and payload descriptions in `#F4F0E2`.

### Form Controls & Inputs
- Terminal-inspired inputs with `#08090C` fill, 1px border of `rgba(139, 223, 221, 0.2)`, text `#FAF0E6`.
- Focus switches border to `#8BDFDD` with subtle inner cyan glow.
- Checkboxes and radios are square or diamond-shaped with a 2px Cyber Cyan checked pip.

### Specialized SOC Components
- **Agent Radar Scope**: Concentric orbital guide rings (`rgba(139, 223, 221, 0.15)`) with rotating sweep gradients and `#F05941` threat pings.
- **Model Weight Gauges**: Segmented bar charts with Cyan-to-Crimson gradient steps representing agent neural load and anomaly probabilities.