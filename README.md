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
- `tools/validate-site.js` — link, metadata, navigation and optional live command-reference validation.
- `sitemap.xml`, `robots.txt`, `404.html` — GitHub Pages discovery and fallback files.

Changelog updates are manual. Avoid generated status files that change during normal bot runtime.

## Validate locally

Run:

```bash
npm test
```

When the sibling Luminox bot repository is available at `../Bot`, validation also compares `commands.html` with the commands actually registered by the bot. Set `LUMINOX_BOT_DIR` to use another local path.

## Publish with GitHub Pages

In the GitHub repository settings, open **Pages**, select **Deploy from a branch**, choose `main` and the repository root. The expected project URL is `https://bedurion.github.io/Docs/`.
