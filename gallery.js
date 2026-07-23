const gallery = document.querySelector('[data-community-gallery]');
const featuredGallery = document.querySelector('[data-gallery-featured]');
const statusMessage = document.querySelector('[data-gallery-status]');
const filterButtons = [...document.querySelectorAll('[data-gallery-filter]')];
const collectionLinks = [...document.querySelectorAll('[data-gallery-jump]')];

const categoryLabels = Object.freeze({
  adventures: 'Adventures',
  community: 'Guild life',
  roleplay: 'Roleplay',
  milestones: 'Milestones',
  video: 'Video'
});

let galleryEntries = [];
let activeFilter = 'all';

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function formatPublishedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Published by Lumina staff'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
}

function normalizeCategory(entry) {
  const candidate = String(entry.category || '').trim().toLowerCase();
  if (Object.hasOwn(categoryLabels, candidate)) return candidate;

  const mediaItems = Array.isArray(entry.media) ? entry.media : [];
  return mediaItems.some((media) => media.type === 'video') ? 'video' : 'community';
}

function normalizeMedia(entry) {
  if (Array.isArray(entry.media)) return entry.media;
  if (Array.isArray(entry.images)) {
    return entry.images.map((image) => ({ ...image, type: 'image' }));
  }
  return [];
}

function buildMedia(entry, featured = false) {
  const mediaItems = normalizeMedia(entry);
  const media = document.createElement('div');
  media.className = `${featured ? 'gallery-featured-media' : 'community-gallery-media'} media-${Math.min(Math.max(mediaItems.length, 1), 4)}`;

  if (mediaItems.length === 0) {
    const fallback = document.createElement('div');
    fallback.className = 'gallery-media-fallback';
    fallback.innerHTML = '<img src="assets/illustrations/gallery-frames.svg?v=20260723-4" alt="Decorative gallery frames">';
    media.append(fallback);
    return media;
  }

  mediaItems.slice(0, featured ? 3 : 4).forEach((mediaData) => {
    if (mediaData.type === 'video') {
      const video = document.createElement('video');
      video.src = mediaData.src;
      video.setAttribute('aria-label', mediaData.alt || entry.title || 'Lumina gallery video');
      if (mediaData.width) video.width = mediaData.width;
      if (mediaData.height) video.height = mediaData.height;
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      media.append(video);
      return;
    }

    const image = document.createElement('img');
    image.src = mediaData.src;
    image.alt = mediaData.alt || entry.title || 'Lumina gallery image';
    if (mediaData.width) image.width = mediaData.width;
    if (mediaData.height) image.height = mediaData.height;
    image.loading = featured ? 'eager' : 'lazy';
    image.decoding = 'async';
    media.append(image);
  });

  return media;
}

function buildEntryMeta(entry, category) {
  const meta = document.createElement('div');
  meta.className = 'gallery-entry-meta';
  meta.append(
    createTextElement('span', 'gallery-category-badge', categoryLabels[category]),
    createTextElement('span', '', formatPublishedDate(entry.publishedAt))
  );
  return meta;
}

function buildGalleryEntry(entry) {
  const category = normalizeCategory(entry);
  const article = document.createElement('article');
  article.className = 'community-gallery-entry';
  article.dataset.galleryCategory = category;
  article.id = String(entry.id || '').toLowerCase();

  const content = document.createElement('div');
  content.className = 'community-gallery-content';
  content.append(
    buildEntryMeta(entry, category),
    createTextElement('h3', '', entry.title || 'Lumina story'),
    createTextElement('p', 'community-gallery-description', entry.description || ''),
    createTextElement('p', 'community-gallery-credit', `Credit · ${entry.credit || 'Lumina community'}`)
  );

  article.append(buildMedia(entry), content);
  return article;
}

function buildFeaturedEntry(entry) {
  const category = normalizeCategory(entry);
  const article = document.createElement('article');
  article.className = 'gallery-featured-entry';

  const content = document.createElement('div');
  content.className = 'gallery-featured-content';
  content.append(
    buildEntryMeta(entry, category),
    createTextElement('h3', '', entry.title || 'Lumina story'),
    createTextElement('p', '', entry.description || ''),
    createTextElement('p', 'community-gallery-credit', `Credit · ${entry.credit || 'Lumina community'}`)
  );

  article.append(buildMedia(entry, true), content);
  return article;
}

function updateFilter(filter) {
  activeFilter = Object.hasOwn(categoryLabels, filter) ? filter : 'all';
  let visibleCount = 0;

  galleryEntries.forEach((entry) => {
    const visible = activeFilter === 'all' || normalizeCategory(entry.data) === activeFilter;
    entry.element.classList.toggle('is-hidden', !visible);
    if (visible) visibleCount += 1;
  });

  filterButtons.forEach((button) => {
    const selected = button.dataset.galleryFilter === activeFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  if (galleryEntries.length > 0) {
    if (activeFilter === 'all') {
      statusMessage.textContent = `${visibleCount} approved ${visibleCount === 1 ? 'story' : 'stories'}.`;
    } else if (visibleCount === 0) {
      statusMessage.textContent = `No ${categoryLabels[activeFilter].toLowerCase()} entries have been published yet.`;
    } else {
      statusMessage.textContent = `${visibleCount} ${categoryLabels[activeFilter].toLowerCase()} ${visibleCount === 1 ? 'entry' : 'entries'}.`;
    }
    statusMessage.classList.add('gallery-status-summary');
  }
}

function renderEntries(entries) {
  const featuredEntry = entries.find((entry) => entry.featured) || entries[0];
  const archiveEntries = entries.filter((entry) => entry !== featuredEntry);

  featuredGallery.replaceChildren(buildFeaturedEntry(featuredEntry));
  const fragment = document.createDocumentFragment();
  galleryEntries = archiveEntries.map((entry) => {
    const element = buildGalleryEntry(entry);
    fragment.append(element);
    return { data: entry, element };
  });
  gallery.replaceChildren(fragment);

  if (archiveEntries.length === 0) {
    statusMessage.textContent = 'The featured story is currently the only approved gallery entry.';
    statusMessage.classList.remove('gallery-status-summary');
  } else {
    updateFilter(activeFilter);
  }
}

function scrollToHashEntry() {
  if (!window.location.hash) return;

  const encodedEntryId = window.location.hash.slice(1);
  let entryId = encodedEntryId;
  try {
    entryId = decodeURIComponent(encodedEntryId);
  } catch {
    entryId = encodedEntryId;
  }

  document.getElementById(entryId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadGallery() {
  try {
    const response = await fetch('data/community-media.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];

    if (entries.length === 0) {
      statusMessage.textContent = 'The archive is ready for its first approved story.';
      statusMessage.classList.add('gallery-status-empty');
      return;
    }

    renderEntries(entries);
    scrollToHashEntry();
  } catch {
    statusMessage.textContent = 'The community gallery could not be loaded right now. Please try again later.';
    statusMessage.classList.add('gallery-status-error');
  }
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => updateFilter(button.dataset.galleryFilter));
});

collectionLinks.forEach((link) => {
  link.addEventListener('click', () => {
    const filter = link.dataset.galleryJump;
    window.setTimeout(() => updateFilter(filter), 0);
  });
});

loadGallery();
