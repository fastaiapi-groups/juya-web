# Public help center

Public routes (no account required):

- `/help/`: overview, guide search and common questions
- `/help/codex/`: Windows/macOS installation, first use and built-in media-api image/video examples
- `/help/api/`: registration, API keys, client setup, image generation and troubleshooting

These are static HTML pages served by the existing Nginx site. The homepage navigation includes a Help docs link in all five supported navigation languages. The tutorials themselves are Simplified Chinese.

## Maintenance

Edit the relevant `public/help/**/index.html`; shared styles and interactions are in `help.css` and `help.js`. Keep heading IDs stable because the overview and table of contents link to them. There are no external scripts, fonts or image hosts.

The API tutorial preserves all 43 original operation screenshots. The Codex tutorial preserves its 16 screenshots and adds a branded Windows launch screenshot. Screenshot branding uses FastAiApi and `https://fastaiapi.cloud`; MiniMax H3 uses `https://newapi.fastaiapi.cloud`. Other product marks and original controls remain as shown. Historical OpenClaw and optional IPv6 screenshots are collapsed behind explicit version/usage notes.

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
