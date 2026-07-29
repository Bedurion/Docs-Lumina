# Luminox Website

Static GitHub Pages product website and documentation for Lumina and Luminox.

## Structure

- `index.html` — main landing page.
- `features*.html` — product pages.
- `docs-*.html` — documentation pages.
- `assets/brand/` — brand marks.
- `assets/icons/` — reusable SVG icons.
- `assets/illustrations/` — decorative SVG illustrations.
- `styles.css` — shared design system.
- `script.js` — menus and search.
- `gallery.html`, `gallery.js`, `data/community-media.json` — approved community-media gallery.
- `tools/validate-site.js` — link, metadata, navigation and optional live command-reference validation.
- `tools/publish-community-media.mjs` — validates approved JPG/PNG/MP4 submissions and creates safe web copies.
- `sitemap.xml`, `robots.txt`, `404.html` — GitHub Pages discovery and fallback files.

Changelog updates are manual. Avoid generated status files that change during normal bot runtime.

## Validate locally

Run:

```bash
npm test
```

When the sibling Luminox bot repository is available at `../Bot`, validation also compares `commands.html` with the commands actually registered by the bot. Set `LUMINOX_BOT_DIR` to use another local path.

## Publish with GitHub Pages

In the GitHub repository settings, open **Pages** and select **GitHub Actions** as the source. The secure media workflow commits the approved gallery entry and then performs an explicit Pages deployment, because commits made with `GITHUB_TOKEN` do not trigger another workflow automatically.

## Publish approved Discord media

The Website workflow accepts only a staff-approved Discord proposal and creates a cleaned web copy before updating the gallery. Uploaded files are checked in GitHub Actions rather than on the Luminox host computer.

Publishing credentials belong only in the private bot environment and GitHub repository secrets. Never commit their values, paste them into Discord or include them in screenshots. Keep repository permissions limited to the actions required by the workflow.

The community publication workflow manages `data/community-media.json`, `data/blog-posts.json`, `data/art-entries.json`, `data/roleplay-stories.json`, `assets/community/` and `.github/community-publication-state.json` as one coordinated state. Do not edit, revert or copy any of those publication files separately. A manual maintenance change must update the affected content and publication ledger together, be reviewed as one atomic commit and preserve every published revision already recorded in the ledger.

## Browser security on GitHub Pages

`npm run seo` adds a compatible Content Security Policy and a strict referrer policy to every HTML page. The policy keeps scripts, data requests and media on the same origin while allowing the small set of dynamic inline styles used by navigation, galleries and the custom cursor.

Some protections can only be delivered as HTTP response headers, not as HTML metadata. HSTS, `X-Content-Type-Options`, `Permissions-Policy` and CSP `frame-ancestors` therefore require configuration at an upstream CDN/proxy or a host that supports custom response headers. Do not add platform-specific `_headers` files to this repository unless the deployment platform changes and explicitly supports them.
