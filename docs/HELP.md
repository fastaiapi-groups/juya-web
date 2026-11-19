# Public help center

Public routes (no account required):

- `/help/`: overview, guide search and common questions
- `/help/codex/`: Windows/macOS installation, first use and built-in media-api image/video examples
- `/help/api/`: registration, API keys, client setup, image generation and troubleshooting

These are static HTML pages served by the existing Nginx site. The homepage navigation includes a Help docs link in all five supported navigation languages. The tutorials themselves are Simplified Chinese.

## Site design system

All website pages share `public/brand.css` (served at `/hub/home/brand.css`): colour tokens (`--fa-*`), the dark `.fa-header` navigation, `.fa-footer`, `.fa-btn` buttons and the dark `.fa-band` hero. Static pages link it before their own stylesheet; the Vue pages import it in `frontend/src/main.ts` and render `SiteHeader.vue` / `SiteFooter.vue`. Keep the primary navigation identical everywhere (产品 · Codex++ · 笑笑漫剧 · 帮助 · 充值 · 登录) and use the ink + mint palette instead of page-specific colours.

## Maintenance

Edit the relevant `public/help/**/index.html`; shared styles and interactions are in `help.css` and `help.js`. Keep heading IDs stable because the overview and table of contents link to them. There are no external scripts, fonts or image hosts.

The API tutorial preserves all 43 original operation screenshots. The Codex tutorial preserves its 16 screenshots and adds a branded Windows launch screenshot. Screenshot branding uses FastAiApi and `https://fastaiapi.cloud`; MiniMax H3 uses `https://newapi.fastaiapi.cloud`. Other product marks and original controls remain as shown. Historical OpenClaw and optional IPv6 screenshots are collapsed behind explicit version/usage notes.

Codex++ accepts FastAiApi accounts and API keys directly. The API tutorial section 3, the overview first-steps panel and the side navigation point new users to Codex++ first; manual Codex CLI configuration remains as the alternative.

The current Codex++ release includes the media-api skill. Users do not need to download or install a separate media skill package. The guide includes direct image and video prompts, while main image, Grok and H3 credentials remain configured separately.

Codex++ installer links use the public Lark download entries. The Lark files are configured for direct download without requiring an account. Tutorial text and screenshots remain served locally by this website.

## Validation (2026-11-19)

- Every local image, stylesheet, script, download, page and fragment link resolves.
- 43 API screenshots and 17 Codex screenshots present, including updated Windows dashboard branding.
- No old brand names or domains remain in tutorial text; branded screenshots reviewed visually.
- Search filters correctly for “验证码”; code copy matches the underlying code block.
- Screenshot viewer opens, supports Escape, returns focus and links to the image.
- Browser viewport checks at 390 px and 320 px show no horizontal overflow.
- Existing Docker service, configuration mount and installer mount remain unchanged.
