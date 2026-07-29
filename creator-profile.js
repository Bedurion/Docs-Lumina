const profileSummary = document.querySelector('[data-creator-summary]');
const profilePublications = document.querySelector('[data-creator-publications]');
const profileStatus = document.querySelector('[data-creator-profile-status]');
const profileFilterButtons = [...document.querySelectorAll('[data-profile-filter]')];
const requestedProfileId = new URLSearchParams(window.location.search).get('profile') || '';
let activeProfileFilter = 'all';
let profileCreator = null;

function profileElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function profileDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return options.fallback || 'Archive collection';
  return new Intl.DateTimeFormat(undefined, { dateStyle: options.long ? 'long' : 'medium' }).format(date);
}

function profileCountCard(label, value, type = '') {
  const card = profileElement('div', `creator-summary-count${type ? ` creator-summary-count--${type}` : ''}`);
  card.append(profileElement('dt', '', label), profileElement('dd', '', String(value)));
  return card;
}

function buildProfileSummary(creator) {
  const article = profileElement('article', `creator-summary-card${creator.isGuild ? ' is-guild' : ''}`);
  const identity = profileElement('div', 'creator-summary-identity');
  const marker = profileElement('span', 'creator-summary-marker');
  if (creator.isGuild) {
    const seal = document.createElement('img');
    seal.src = 'assets/brand/seal-dark-nav.svg';
    seal.alt = '';
    seal.setAttribute('aria-hidden', 'true');
    marker.append(seal);
  } else {
    marker.textContent = '✦';
    marker.setAttribute('aria-hidden', 'true');
  }
  const copy = profileElement('div', 'creator-summary-copy');
  const creatorHeading = profileElement('h2', '', creator.name);
  creatorHeading.id = 'creator-summary-title';
  copy.append(
    profileElement('p', 'eyebrow', creator.isGuild ? 'Shared guild archive' : 'Community creator'),
    creatorHeading,
    profileElement('p', '', creator.isGuild
      ? 'Collective, historic and unattributed publications remain together under the Lumina name.'
      : `Every public contribution currently credited to ${creator.name}, gathered across Lumina's community archive.`)
  );
  identity.append(marker, copy);
  const counts = profileElement('dl', 'creator-summary-counts');
  counts.append(
    profileCountCard('All', creator.total),
    ...Object.entries(window.LuminaCommunityContent.contentTypes)
      .map(([type, definition]) => profileCountCard(definition.label, creator.counts[type] || 0, type))
  );
  const latest = profileElement('div', 'creator-summary-latest');
  latest.append(
    profileElement('span', '', 'Latest contribution'),
    profileElement('strong', '', profileDate(creator.latestAt, { long: true, fallback: 'Archive prepared' }))
  );
  article.append(identity, counts, latest);
  return article;
}

function publicationMedia(item) {
  const media = profileElement('span', `creator-publication-media creator-publication-media--${item.type}`);
  if (item.thumbnail?.src && item.thumbnail.type !== 'video') {
    const image = document.createElement('img');
    image.src = item.thumbnail.src;
    image.alt = item.thumbnail.alt || item.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    media.append(image);
  } else {
    const words = { blog: 'Journal', gallery: 'Capture', art: 'Artwork', roleplay: 'Chronicle' };
    media.classList.add('is-typographic');
    media.append(profileElement('span', '', words[item.type]));
  }
  return media;
}

function buildPublicationCard(item, index) {
  const article = profileElement('article', `creator-publication-card creator-publication-card--${item.type}${index === 0 ? ' is-latest' : ''}`);
  article.dataset.publicationType = item.type;
  const link = document.createElement('a');
  link.href = item.href;
  link.setAttribute('aria-label', `Open ${item.title} in ${item.typeLabel}`);
  const copy = profileElement('span', 'creator-publication-copy');
  const meta = profileElement('span', 'creator-publication-meta');
  meta.append(
    profileElement('span', `creator-publication-type creator-publication-type--${item.type}`, item.typeLabel),
    profileElement('span', '', profileDate(item.publishedAt))
  );
  copy.append(
    meta,
    profileElement('strong', 'creator-publication-title', item.title),
    profileElement('span', 'creator-publication-summary', item.summary || `Open this ${window.LuminaCommunityContent.contentTypes[item.type].singular} in the Lumina archive.`),
    profileElement('span', 'creator-publication-open', `Open ${window.LuminaCommunityContent.contentTypes[item.type].singular} →`)
  );
  link.append(publicationMedia(item), copy);
  article.append(link);
  return article;
}

function profileEmpty(title, description) {
  const empty = profileElement('article', 'creator-profile-empty');
  empty.append(
    profileElement('span', 'creator-profile-empty-mark', '✦'),
    profileElement('h3', '', title),
    profileElement('p', '', description),
    (() => {
      const link = profileElement('a', 'text-link', 'Return to all creators →');
      link.href = 'guild-creators.html';
      return link;
    })()
  );
  return empty;
}

function applyProfileFilter(type) {
  activeProfileFilter = Object.hasOwn(window.LuminaCommunityContent.contentTypes, type) ? type : 'all';
  profileFilterButtons.forEach((button) => {
    const selected = button.dataset.profileFilter === activeProfileFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
    if (profileCreator && button.dataset.profileFilter !== 'all') {
      button.disabled = profileCreator.counts[button.dataset.profileFilter] === 0;
    }
  });
  if (!profileCreator) return;
  const items = profileCreator.items.filter((item) => activeProfileFilter === 'all' || item.type === activeProfileFilter);
  profilePublications.replaceChildren(...(items.length
    ? items.map(buildPublicationCard)
    : [profileEmpty('No publications in this format.', 'Choose another format to continue through this creator archive.')]));
  const contentType = window.LuminaCommunityContent.contentTypes[activeProfileFilter];
  const format = activeProfileFilter === 'all'
    ? (items.length === 1 ? 'publication' : 'publications')
    : (items.length === 1 ? contentType.singular : contentType.label.toLocaleLowerCase());
  profileStatus.textContent = `${items.length} ${format} in this view.`;
  profileStatus.className = `creator-profile-status${items.length ? ' is-summary' : ' is-empty'}`;
}

function updateProfileDocument(creator) {
  const title = creator.isGuild ? 'Lumina Guild Archive' : `${creator.name} · Contributor archive`;
  const lead = creator.isGuild
    ? 'Collective, historic and unattributed publications preserved under the Lumina name.'
    : `Articles, screenshots, artwork and roleplay chronicles credited to ${creator.name}.`;
  document.querySelector('[data-creator-hero-eyebrow]').textContent = creator.isGuild
    ? 'Guild · Shared archive'
    : 'Guild · Community creator';
  document.querySelector('[data-creator-hero-title]').textContent = title;
  document.querySelector('[data-creator-hero-lead]').textContent = lead;
  document.title = `${title} | Lumina Guild`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', lead);
}

async function loadCreatorProfile() {
  try {
    const archive = await window.LuminaCommunityContent.load();
    const normalizedRequest = window.LuminaCommunityContent.normalizeCreatorId(
      requestedProfileId,
      requestedProfileId === window.LuminaCommunityContent.guildCreatorId ? window.LuminaCommunityContent.guildName : ''
    );
    profileCreator = archive.creators.find((creator) => creator.id === normalizedRequest) || null;
    if (!profileCreator && normalizedRequest === window.LuminaCommunityContent.guildCreatorId) {
      profileCreator = {
        id: window.LuminaCommunityContent.guildCreatorId,
        name: window.LuminaCommunityContent.guildName,
        isGuild: true,
        total: 0,
        latestAt: '',
        items: [],
        counts: { blog: 0, gallery: 0, art: 0, roleplay: 0 }
      };
    }
    if (!requestedProfileId || !profileCreator) {
      document.querySelector('[data-creator-hero-title]').textContent = 'Creator not found';
      document.querySelector('[data-creator-hero-lead]').textContent = 'This creator link does not match a current public Lumina archive.';
      profileSummary.replaceChildren(profileEmpty('This creator archive is unavailable.', 'The credit may have moved, changed or no longer contain public content.'));
      profilePublications.replaceChildren();
      profileStatus.textContent = 'Return to the creator directory to continue browsing.';
      profileStatus.className = 'creator-profile-status is-error';
      profileFilterButtons.forEach((button) => { button.disabled = true; });
      return;
    }
    updateProfileDocument(profileCreator);
    profileSummary.replaceChildren(buildProfileSummary(profileCreator));
    applyProfileFilter('all');
    if (archive.partial) {
      profileStatus.textContent += ' Some archive sources are temporarily unavailable.';
      profileStatus.classList.add('is-partial');
    }
  } catch {
    profileSummary.replaceChildren(profileEmpty('The creator archive could not be loaded.', 'Please try again in a moment or return to the complete creator directory.'));
    profilePublications.replaceChildren();
    profileStatus.textContent = 'The community archive is temporarily unavailable.';
    profileStatus.className = 'creator-profile-status is-error';
    profileFilterButtons.forEach((button) => { button.disabled = true; });
  }
}

profileFilterButtons.forEach((button) => {
  button.addEventListener('click', () => applyProfileFilter(button.dataset.profileFilter));
});
loadCreatorProfile();
