# Public help center

Public routes (no account required):

- `/help/`: overview, guide search and common questions
- `/help/codex/`: Windows/macOS installation, first use and media-api setup
- `/help/api/`: registration, API keys, client setup, image generation and troubleshooting

These are static HTML pages served by the existing Nginx site. The homepage navigation includes a Help docs link in all five supported navigation languages. The tutorials themselves are Simplified Chinese.

## Maintenance

Edit the relevant `public/help/**/index.html`; shared styles and interactions are in `help.css` and `help.js`. Keep heading IDs stable because the overview and table of contents link to them. There are no external scripts, fonts or image hosts.

The API tutorial preserves all 43 original operation screenshots. The Codex tutorial preserves its 16 screenshots and adds a branded Windows launch screenshot. Screenshot branding uses FastAiApi and `https://fastaiapi.cloud`; MiniMax H3 uses `https://newapi.fastaiapi.cloud`. Other product marks and original controls remain as shown. Historical OpenClaw and optional IPv6 screenshots are collapsed behind explicit version/usage notes.

`downloads/media-api-fastaiapi-20261024-tested.zip` is the provided tested package; its SHA-256 is in `downloads/SHA256SUMS.txt`. Main image, Grok and H3 credentials are configured separately. Do not publish real credentials or claim upstream availability from a successful local setup.

Installer links retain the original external Lark/Feishu download destinations; access to these may depend on the external service. All tutorial text, screenshots and the media skill ZIP are served locally by this website.

## Validation (2026-10-24)

- Every local image, stylesheet, script, download, page and fragment link resolves.
- 43 API screenshots and 17 Codex screenshots present, including updated Windows dashboard branding.
- No old brand names or domains remain in tutorial text; branded screenshots reviewed visually.
- Search filters correctly for “验证码”; code copy matches the underlying code block.
- Screenshot viewer opens, supports Escape, returns focus and links to the image.
- Browser viewport checks at 390 px and 320 px show no horizontal overflow.
- Existing Docker service, configuration mount and installer mount remain unchanged.
