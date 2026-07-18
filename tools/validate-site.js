const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
const publicBaseUrl = 'https://bedurion.github.io/Docs-Lumina/';
const errors = [];
const warnings = [];
const pageTitles = new Map();

function report(file, message) {
  errors.push(`${file}: ${message}`);
}

function stripFragment(value) {
  return value.split('#')[0].split('?')[0];
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const title = source.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || '';
  const description = source.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]?.trim() || '';

  if (!title) report(file, 'missing title');
  if (!/<meta\s+name="viewport"/i.test(source)) report(file, 'missing viewport');
  if (!description) report(file, 'missing meta description');
  if (!/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/i.test(source)) report(file, 'missing h1');
  if (!/data-nav-links/.test(source)) report(file, 'missing shared navigation mount');

  if (file !== '404.html') {
    const expectedUrl = file === 'index.html' ? publicBaseUrl : `${publicBaseUrl}${file}`;
    if (title.length < 25 || title.length > 65) report(file, `SEO title length ${title.length} is outside 25-65 characters`);
    if (description.length < 110 || description.length > 165) report(file, `meta description length ${description.length} is outside 110-165 characters`);
    if (!source.includes(`<link rel="canonical" href="${expectedUrl}">`)) report(file, `missing canonical URL ${expectedUrl}`);
    if (!/<meta\s+name="robots"\s+content="index,follow,[^"]+"/i.test(source)) report(file, 'missing indexable robots policy');
    if (!source.includes(`<meta property="og:url" content="${expectedUrl}">`)) report(file, 'missing matching Open Graph URL');
    if (!/<meta\s+property="og:title"\s+content="[^"]+"/i.test(source)) report(file, 'missing Open Graph title');
    if (!/<meta\s+property="og:description"\s+content="[^"]+"/i.test(source)) report(file, 'missing Open Graph description');
    if (!/<meta\s+property="og:image"\s+content="https:\/\/[^\"]+"/i.test(source)) report(file, 'missing absolute Open Graph image');
    if (!/<meta\s+name="twitter:card"\s+content="[^"]+"/i.test(source)) report(file, 'missing Twitter card metadata');

    const structuredData = source.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
    if (!structuredData) {
      report(file, 'missing JSON-LD structured data');
    } else {
      try {
        JSON.parse(structuredData);
      } catch {
        report(file, 'invalid JSON-LD structured data');
      }
    }

    pageTitles.set(title, [...(pageTitles.get(title) || []), file]);
  } else if (!/<meta\s+name="robots"\s+content="noindex"/i.test(source)) {
    report(file, '404 page must remain noindex');
  }

  const htmlWithoutStructuredData = source.replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  const rawEntity = htmlWithoutStructuredData.match(/&(?![A-Za-z][A-Za-z0-9]+;|#[0-9]+;|#x[0-9A-Fa-f]+;)/);
  if (rawEntity) report(file, 'contains an unescaped ampersand');

  const ids = [...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  duplicateIds.forEach((id) => report(file, `duplicate id #${id}`));

  for (const match of source.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/\salt="[^"]*"/i.test(match[1])) report(file, 'image without alt attribute');
  }

  for (const match of source.matchAll(/<button\b([^>]*)>/gi)) {
    if (!/\stype="(?:button|submit|reset)"/i.test(match[1])) report(file, 'button without explicit type');
  }

  for (const match of source.matchAll(/\s(?:href|src)="([^"]+)"/gi)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)) continue;
    const localPath = stripFragment(reference);
    if (!localPath) continue;
    if (!fs.existsSync(path.resolve(root, localPath))) report(file, `broken local reference ${reference}`);
  }

  for (const match of source.matchAll(/href="#([^"]+)"/gi)) {
    if (!ids.includes(match[1])) report(file, `missing local anchor #${match[1]}`);
  }
}

for (const [title, files] of pageTitles.entries()) {
  if (files.length > 1) report(files.join(', '), `duplicate SEO title ${title}`);
}

const publicPages = htmlFiles.filter((file) => file !== '404.html');
const sitemapPath = path.join(root, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  report('sitemap.xml', 'missing sitemap');
} else {
  const sitemapSource = fs.readFileSync(sitemapPath, 'utf8');
  const sitemapUrls = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  sitemapUrls.forEach((url) => {
    if (!url.startsWith(publicBaseUrl)) report('sitemap.xml', `URL uses the wrong public base ${url}`);
  });
  if (new Set(sitemapUrls).size !== sitemapUrls.length) report('sitemap.xml', 'contains duplicate URLs');
  const sitemapPages = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
    const pathname = new URL(match[1]).pathname;
    return pathname.endsWith('/') ? 'index.html' : path.basename(pathname);
  });

  publicPages.forEach((page) => {
    if (!sitemapPages.includes(page)) report('sitemap.xml', `missing public page ${page}`);
  });

  sitemapPages.forEach((page) => {
    if (!publicPages.includes(page)) report('sitemap.xml', `unknown public page ${page}`);
  });
}

const robotsPath = path.join(root, 'robots.txt');
if (!fs.existsSync(robotsPath)) {
  report('robots.txt', 'missing robots file');
} else {
  const robotsSource = fs.readFileSync(robotsPath, 'utf8');
  if (!robotsSource.includes(`Sitemap: ${publicBaseUrl}sitemap.xml`)) report('robots.txt', 'sitemap URL does not match the public site');
}

const scriptSource = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const presentationPages = [...scriptSource.matchAll(/^  '([^']+\.html)': \{ family:/gm)].map((match) => match[1]);
const interiorPages = htmlFiles.filter((file) => file !== 'index.html');
interiorPages.forEach((page) => {
  if (!presentationPages.includes(page)) report('script.js', `missing unique page presentation for ${page}`);
});
presentationPages.forEach((page) => {
  if (!interiorPages.includes(page)) report('script.js', `unknown page presentation ${page}`);
});

for (const page of publicPages) {
  if (page === 'index.html') continue;
  const source = fs.readFileSync(path.join(root, page), 'utf8');
  const linkedFromHtml = htmlFiles.some((otherFile) => {
    if (otherFile === page) return false;
    return fs.readFileSync(path.join(root, otherFile), 'utf8').includes(`href="${page}"`);
  });
  if (!linkedFromHtml && !scriptSource.includes(`'${page}'`)) warnings.push(`${page}: no incoming navigation or catalog link`);
}

const legacyPatterns = [
  '/set setup', '/set guildbank', '/set leaderboards', '/set guildlist',
  '/set blacklist', '/set banlist', '/set tracker', '/sync all', '/loot-panel'
];
for (const pattern of legacyPatterns) {
  const matches = htmlFiles.filter((file) => fs.readFileSync(path.join(root, file), 'utf8').includes(pattern));
  if (matches.length > 0) report(matches.join(', '), `legacy command name ${pattern}`);
}

const botDirectory = process.env.LUMINOX_BOT_DIR || path.resolve(root, '..', 'Bot');
if (fs.existsSync(path.join(botDirectory, 'utils', 'commandLoader.js'))) {
  const loaderScript = `
    const { loadCommands } = require('./utils/commandLoader');
    (async () => {
      const commands = await loadCommands({ info() {}, warn() {}, error() {} });
      const registered = [...commands].filter(([, command]) => command.register !== false);
      const commandNames = registered.map(([name]) => name);
      const commandPaths = [];

      const collectPaths = (name, options = [], prefix = []) => {
        const structuralOptions = options.filter((option) => option.type === 1 || option.type === 2);
        if (structuralOptions.length === 0) {
          commandPaths.push([name, ...prefix].join(' '));
          return;
        }

        structuralOptions.forEach((option) => {
          if (option.type === 2) collectPaths(name, option.options || [], [...prefix, option.name]);
          if (option.type === 1) commandPaths.push([name, ...prefix, option.name].join(' '));
        });
      };

      registered.forEach(([name, command]) => {
        if (name === 'Convert time') {
          commandPaths.push(name);
          return;
        }
        collectPaths(name, command.data?.toJSON?.().options || []);
      });

      console.log(JSON.stringify({ commandNames, commandPaths }));
    })();
  `;
  const { commandNames, commandPaths } = JSON.parse(execFileSync(process.execPath, ['-e', loaderScript], {
    cwd: botDirectory,
    encoding: 'utf8'
  }).trim());
  const commandPage = fs.readFileSync(path.join(root, 'commands.html'), 'utf8');
  for (const commandPath of commandPaths) {
    if (commandPath === 'Convert time') {
      if (!commandPage.includes('Convert time')) report('commands.html', 'missing Convert time context command');
      continue;
    }
    if (!commandPage.includes(`/${commandPath}`)) report('commands.html', `missing registered /${commandPath} command path`);
  }
  console.log(`Verified ${commandNames.length} registered commands and ${commandPaths.length} executable paths against commands.html.`);
} else {
  warnings.push('Bot repository not found; skipped live command-registration comparison');
}

if (warnings.length > 0) {
  console.warn(`Warnings (${warnings.length}):`);
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Validated ${htmlFiles.length} HTML pages with no blocking errors.`);
}
