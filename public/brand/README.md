# Brand assets — Czarnikow × Optinus

Co-brand assets for the PM Tower tool, sourced from both companies' websites
(downloaded 2026-10-21). Regenerate any of these with `node scripts/build-brand-assets.mjs`
after replacing the raw downloads.

| File | Source | Use |
| --- | --- | --- |
| `czarnikow.png` | czarnikow.com favicon 200×200 (blue CZ square mark) | app brand rows, works on any surface |
| `czarnikow-favicon-200.png` / `-56.png` | czarnikow.com site icons | raw source |
| `czarnikow-mark.svg` | inline SVG extracted from the czarnikow.com site header | vector master (note: paths use site-theme white/blue — not self-contained on light backgrounds) |
| `optinus-logo.png` | optinus-solutions.com primary wordmark PNG (transparent) | raw source; "Optinus" is white → only for dark surfaces |
| `optinus-dark.png` | recolor-trimmed from `optinus-logo.png` | **dark surfaces** (navy/navy-gradient panels, dark sidebar) |
| `optinus-light.png` | `optinus-logo.png` with near-white pixels recolored slate-900 | **light surfaces** (white top bar) |
| `optinus-ring.png` | optinus-solutions.com favicon (ring mark, trimmed) | icon use |
| `optinus-favicon.png` | optinus-solutions.com favicon | raw source |
| `czarnikow-x-optinus.png` | composite lockup: CZ mark × Optinus wordmark | sharing/og/exports |
| `app-icon.png` | CZ square + Optinus ring corner badge | app icon master |

Wired into the UI via `src/components/pmct/brand.tsx` (`PmTowerBrand`, `PmTowerMark`,
`BRAND_ASSETS`). The component selects the Optinus colorway automatically:
`light` prop (dark surface) → `optinus-dark.png`; default (light surface) → `optinus-light.png`.
