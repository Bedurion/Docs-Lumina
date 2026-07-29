const creatorDirectory = document.querySelector('[data-creator-directory]');
const creatorDirectoryStatus = document.querySelector('[data-creator-directory-status]');
const creatorSearch = document.querySelector('[data-creator-search]');
const creatorFilterButtons = [...document.querySelectorAll('[data-creator-filter]')];
const guildCreatorMount = document.querySelector('[data-guild-creator]');
let visibleCreators = [];
let activeCreatorFilter = 'all';

function creatorElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function creatorDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Archive collection'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function creatorTypeCounts(creator) {
  const list = creatorElement('ul', 'creator-type-counts');
  Object.entries(window.LuminaCommunityContent.contentTypes).forEach(([type, definition]) => {
    const item = creatorElement('li', `creator-type-count creator-type-count--${type}`);
    item.append(
      creatorElement('span', '', definition.label),
      creatorElement('strong', '', String(creator.counts[type] || 0))
    );
    list.append(item);
  });
  return list;
}

function creatorThumbnailStrip(items, className = '') {
  const strip = creatorElement('div', `creator-thumbnail-strip${className ? ` ${className}` : ''}`);
  const images = items.filter((item) => item.thumbnail?.src).slice(0, 3);
  if (images.length === 0) {
    strip.classList.add('is-typographic');
    strip.append(
      creatorElement('span', '', 'Stories'),
      creatorElement('span', '', 'Art'),
      creatorElement('span', '', 'Memories')
    );
    return strip;
  }
  images.forEach((item) => {
    const frame = creatorElement('span', `creator-thumbnail creator-thumbnail--${item.type}`);
    if (item.thumbnail.type === 'video') {
      frame.append(creatorElement('span', 'creator-thumbnail-video', 'Play'));
    } else {
      const image = document.createElement('img');
      image.src = item.thumbnail.src;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      frame.append(image);
    }
    strip.append(frame);
  });
  return strip;
}

function buildCreatorCard(creator) {
  const article = creatorElement('article', 'creator-directory-card');
  article.dataset.creatorName = creator.name.toLocaleLowerCase();
  article.dataset.creatorTypes = Object.keys(creator.counts).filter((type) => creator.counts[type] > 0).join(' ');
  const link = document.createElement('a');
  link.href = creator.href;
  link.setAttribute('aria-label', `View every publication credited to ${creator.name}`);
  const heading = creatorElement('div', 'creator-directory-card-heading');
  heading.append(
    creatorElement('span', 'creator-directory-kicker', `${creator.total} ${creator.total === 1 ? 'publication' : 'publications'}`),
    creatorElement('h3', '', creator.name),
    creatorElement('p', '', `Latest contribution · ${creatorDate(creator.latestAt)}`)
  );
  link.append(
    creatorThumbnailStrip(creator.items),
    heading,
    creatorTypeCounts(creator),
    creatorElement('span', 'creator-directory-open', 'View archive →')
  );
  article.append(link);
  return article;
}

function buildGuildCreatorCard(creator) {
  const article = creatorElement('article', 'creator-guild-card');
  const link = document.createElement('a');
  link.href = creator.href;
  link.setAttribute('aria-label', 'View the Lumina guild archive');
  const seal = creatorElement('span', 'creator-guild-seal');
  const image = document.createElement('img');
  image.src = 'assets/brand/seal-dark-nav.svg';
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  seal.append(image);
  const copy = creatorElement('div', 'creator-guild-copy');
  copy.append(
    creatorElement('p', 'eyebrow', 'Guild-owned collection'),
    creatorElement('h3', '', 'Lumina'),
    creatorElement('p', '', 'Collective, historic and unattributed work preserved under the guild name — never assigned to an invented creator.')
  );
  const summary = creatorElement('div', 'creator-guild-summary');
  summary.append(
    creatorElement('strong', '', String(creator.total)),
    creatorElement('span', '', creator.total === 1 ? 'publication' : 'publications'),
    creatorElement('b', '', 'Open guild archive →')
  );
  link.append(seal, copy, creatorThumbnailStrip(creator.items, 'creator-guild-thumbnails'), creatorTypeCounts(creator), summary);
  article.append(link);
  return article;
}

function emptyCreator(name = 'No creators match this view.') {
  const empty = creatorElement('article', 'creator-directory-empty');
  empty.append(
    creatorElement('span', 'creator-directory-empty-mark', '✦'),
    creatorElement('h3', '', name),
    creatorElement('p', '', 'Try another name or choose a different publication format.')
  );
  return empty;
}

function applyCreatorView() {
  const query = String(creatorSearch?.value || '').trim().toLocaleLowerCase();
  const matches = visibleCreators.filter((creator) => (
    (!query || creator.name.toLocaleLowerCase().includes(query)) &&
    (activeCreatorFilter === 'all' || creator.counts[activeCreatorFilter] > 0)
  ));
  creatorDirectory.replaceChildren(...(matches.length ? matches.map(buildCreatorCard) : [emptyCreator()]));
  creatorDirectoryStatus.textContent = matches.length === 0
    ? 'No credited creators match the current view.'
    : `${matches.length} ${matches.length === 1 ? 'creator' : 'creators'} in this view.`;
  creatorDirectoryStatus.className = `creator-directory-status${matches.length ? ' is-summary' : ' is-empty'}`;
}

function updateCreatorFilter(type) {
  activeCreatorFilter = Object.hasOwn(window.LuminaCommunityContent.contentTypes, type) ? type : 'all';
  creatorFilterButtons.forEach((button) => {
    const selected = button.dataset.creatorFilter === activeCreatorFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  applyCreatorView();
}

async function loadCreatorDirectory() {
  try {
    const archive = await window.LuminaCommunityContent.load();
    const guildCreator = archive.creators.find((creator) => creator.isGuild) || {
      id: window.LuminaCommunityContent.guildCreatorId,
      name: window.LuminaCommunityContent.guildName,
      isGuild: true,
      total: 0,
      latestAt: '',
      latestTimestamp: 0,
      items: [],
      counts: { blog: 0, gallery: 0, art: 0, roleplay: 0 },
      href: 'guild-creator.html?profile=lumina'
    };
    visibleCreators = archive.creators.filter((creator) => !creator.isGuild);
    const usedFormats = Object.keys(window.LuminaCommunityContent.contentTypes)
      .filter((type) => archive.items.some((item) => item.type === type)).length;
    const creatorTotal = archive.creators.some((creator) => creator.isGuild)
      ? archive.creators.length
      : archive.creators.length + 1;
    document.querySelector('[data-creators-total]').textContent = String(creatorTotal);
    document.querySelector('[data-publications-total]').textContent = String(archive.items.length);
    document.querySelector('[data-formats-total]').textContent = String(usedFormats);
    guildCreatorMount.replaceChildren(buildGuildCreatorCard(guildCreator));
    applyCreatorView();
    if (archive.partial) {
      creatorDirectoryStatus.textContent += ' Some archive sources are temporarily unavailable.';
      creatorDirectoryStatus.classList.add('is-partial');
    }
  } catch {
    document.querySelector('[data-creators-total]').textContent = '—';
    document.querySelector('[data-publications-total]').textContent = '—';
    document.querySelector('[data-formats-total]').textContent = '—';
    guildCreatorMount.replaceChildren(emptyCreator('The guild archive is temporarily unavailable.'));
    creatorDirectory.replaceChildren(emptyCreator('The creator directory could not be loaded.'));
    creatorDirectoryStatus.textContent = 'Please try opening the directory again in a moment.';
    creatorDirectoryStatus.className = 'creator-directory-status is-error';
  }
}

creatorSearch?.addEventListener('input', applyCreatorView);
creatorFilterButtons.forEach((button) => {
  button.addEventListener('click', () => updateCreatorFilter(button.dataset.creatorFilter));
});
loadCreatorDirectory();
