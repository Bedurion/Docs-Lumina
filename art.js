const filterButtons = [...document.querySelectorAll('[data-art-filter]')];
const resultCount = document.querySelector('[data-art-result-count]');
const manifestoCount = document.querySelector('[data-art-manifesto-count]');
const featuredImage = document.querySelector('[data-art-featured-image]');
const featuredTitle = document.querySelector('[data-art-featured-title]');
const featuredDescription = document.querySelector('[data-art-featured-description]');
const featuredCategory = document.querySelector('[data-art-featured-category]');
const featuredTags = document.querySelector('[data-art-featured-tags]');
const featuredCurrent = document.querySelector('[data-art-featured-current]');
const featuredTotal = document.querySelector('[data-art-featured-total]');
const thumbnailRail = document.querySelector('[data-art-thumbnail-rail]');
const artGrid = document.querySelector('[data-art-grid]');
const featuredSection = document.querySelector('.art-featured');
const previousButton = document.querySelector('.art-featured-prev');
const nextButton = document.querySelector('.art-featured-next');
const openFeaturedButton = document.querySelector('[data-art-open-featured]');
const dialog = document.querySelector('[data-art-dialog]');
const dialogImage = document.querySelector('[data-art-dialog-image]');
const dialogTitle = document.querySelector('[data-art-dialog-title]');
const dialogDescription = document.querySelector('[data-art-dialog-description]');
const dialogCategory = document.querySelector('[data-art-dialog-category]');
const dialogTags = document.querySelector('[data-art-dialog-tags]');
const dialogClose = document.querySelector('[data-art-dialog-close]');

const categoryLabels = new Map([
  ['places', 'Places'],
  ['heroes', 'Heroes'],
  ['creatures', 'Creatures'],
  ['adversaries', 'Adversaries'],
  ['guild-life', 'Guild life']
]);

let artCards = [];
let visibleCards = [];
let activeCard = null;

const cardData = (card) => {
  const tags = (card.dataset.artTags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
  if (card.dataset.artCredit) tags.push(`By ${card.dataset.artCredit}`);

  return {
    src: card.dataset.artSrc,
    title: card.dataset.artTitle,
    description: card.dataset.artDescription,
    tags,
    category: card.querySelector('small')?.textContent || 'Illustration',
    alt: card.querySelector('img')?.alt || card.dataset.artTitle
  };
};

const renderTags = (container, tags) => {
  if (!container) return;
  container.replaceChildren(...tags.map((tag) => {
    const span = document.createElement('span');
    span.textContent = tag;
    return span;
  }));
};

const setFeatured = (card, options = {}) => {
  if (!card || !featuredImage || !featuredTitle || !featuredDescription || !featuredCategory || !featuredCurrent) return;
  const data = cardData(card);
  activeCard = card;
  featuredImage.src = data.src;
  featuredImage.alt = data.alt;
  featuredTitle.textContent = data.title;
  featuredDescription.textContent = data.description;
  featuredCategory.textContent = data.category;
  renderTags(featuredTags, data.tags);
  const globalIndex = artCards.indexOf(card);
  featuredCurrent.textContent = String(globalIndex + 1).padStart(2, '0');
  document.querySelectorAll('[data-art-thumbnail]').forEach((thumbnail) => {
    const selected = Number(thumbnail.dataset.artThumbnail) === globalIndex;
    thumbnail.classList.toggle('is-active', selected);
    thumbnail.setAttribute('aria-current', selected ? 'true' : 'false');
  });
  if (options.scrollThumbnail) {
    document.querySelector(`[data-art-thumbnail="${globalIndex}"]`)?.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'});
  }
};

const moveFeatured = (direction) => {
  if (!visibleCards.length) return;
  const currentIndex = Math.max(0, visibleCards.indexOf(activeCard));
  const nextIndex = (currentIndex + direction + visibleCards.length) % visibleCards.length;
  setFeatured(visibleCards[nextIndex], {scrollThumbnail: true});
};

const openDialog = (card) => {
  if (!card || !dialog || !dialogImage || !dialogTitle || !dialogDescription || !dialogCategory) return;
  const data = cardData(card);
  dialogImage.src = data.src;
  dialogImage.alt = data.alt;
  dialogTitle.textContent = data.title;
  dialogDescription.textContent = data.description;
  dialogCategory.textContent = data.category;
  renderTags(dialogTags, data.tags);
  if (typeof dialog.showModal === 'function') dialog.showModal();
};

const createPublishedArtCard = (entry) => {
  if (
    !entry ||
    typeof entry.id !== 'string' ||
    typeof entry.title !== 'string' ||
    typeof entry.description !== 'string' ||
    !categoryLabels.has(entry.category) ||
    typeof entry.credit !== 'string' ||
    !entry.media ||
    entry.media.type !== 'image' ||
    typeof entry.media.src !== 'string' ||
    typeof entry.media.alt !== 'string'
  ) {
    return null;
  }

  const card = document.createElement('button');
  const ratio = Number(entry.media.width) / Number(entry.media.height);
  card.className = ratio >= 1.65 ? 'art-card art-card-wide' : 'art-card';
  card.type = 'button';
  card.id = entry.id.toLowerCase();
  card.dataset.artCategories = entry.category;
  card.dataset.artSrc = entry.media.src;
  card.dataset.artTitle = entry.title;
  card.dataset.artDescription = entry.description;
  card.dataset.artTags = `${categoryLabels.get(entry.category)},Community artwork`;
  card.dataset.artCredit = entry.credit;

  const imageFrame = document.createElement('span');
  imageFrame.className = 'art-card-image';
  const image = document.createElement('img');
  image.src = entry.media.src;
  image.width = Number(entry.media.width);
  image.height = Number(entry.media.height);
  image.alt = entry.media.alt;
  image.loading = 'lazy';
  imageFrame.append(image);

  const copy = document.createElement('span');
  copy.className = 'art-card-copy';
  const category = document.createElement('small');
  category.textContent = `${categoryLabels.get(entry.category)} · Community`;
  const title = document.createElement('strong');
  title.textContent = entry.title;
  const credit = document.createElement('em');
  credit.textContent = `Artwork by ${entry.credit}.`;
  copy.append(category, title, credit);
  card.append(imageFrame, copy);
  return card;
};

const loadPublishedArt = async () => {
  if (!artGrid || window.location.protocol === 'file:') return;

  try {
    const response = await fetch('data/art-entries.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return;

    const data = await response.json();
    if (data?.version !== 1 || !Array.isArray(data.entries)) return;

    const existingIds = new Set(
      [...artGrid.querySelectorAll('[id]')].map((element) => element.id.toUpperCase())
    );
    const fragment = document.createDocumentFragment();
    data.entries.forEach((entry) => {
      if (existingIds.has(entry?.id)) return;
      const card = createPublishedArtCard(entry);
      if (!card) return;
      existingIds.add(entry.id);
      fragment.append(card);
    });
    artGrid.prepend(fragment);
  } catch {
    // The curated archive remains fully usable if remote community data is unavailable.
  }
};

const requestedCardFromHash = () => {
  const requestedId = decodeURIComponent(window.location.hash.slice(1)).toLowerCase();
  return requestedId ? artCards.find((card) => card.id.toLowerCase() === requestedId) || null : null;
};

const showRequestedCard = ({ scroll = false } = {}) => {
  const requestedCard = requestedCardFromHash();
  if (!requestedCard) return false;
  setFeatured(requestedCard, { scrollThumbnail: true });
  if (scroll) featuredSection?.scrollIntoView({ block: 'start' });
  return true;
};

const initializeArchive = () => {
  artCards = [...document.querySelectorAll('.art-card')];
  visibleCards = [...artCards];
  activeCard = artCards[0] || null;

  const total = String(artCards.length);
  if (resultCount) resultCount.textContent = total;
  if (manifestoCount) manifestoCount.textContent = total;
  if (featuredTotal) featuredTotal.textContent = total.padStart(2, '0');

  artCards.forEach((card) => {
    card.addEventListener('click', () => {
      setFeatured(card);
      openDialog(card);
    });
  });

  if (thumbnailRail) {
    const thumbnails = artCards.map((card, index) => {
      const data = cardData(card);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.artThumbnail = String(index);
      button.setAttribute('aria-label', `Show ${data.title}`);
      const image = document.createElement('img');
      image.src = data.src;
      image.alt = '';
      image.width = 120;
      image.height = 80;
      image.loading = 'lazy';
      button.append(image);
      button.addEventListener('click', () => setFeatured(card));
      return button;
    });
    thumbnailRail.replaceChildren(...thumbnails);
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.artFilter;
      filterButtons.forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle('is-active', selected);
        candidate.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      visibleCards = artCards.filter((card) => filter === 'all' || card.dataset.artCategories.split(/\s+/).includes(filter));
      artCards.forEach((card) => {
        card.hidden = !visibleCards.includes(card);
      });
      if (resultCount) resultCount.textContent = String(visibleCards.length);
      if (!visibleCards.includes(activeCard)) setFeatured(visibleCards[0]);
    });
  });

  previousButton?.addEventListener('click', () => moveFeatured(-1));
  nextButton?.addEventListener('click', () => moveFeatured(1));
  openFeaturedButton?.addEventListener('click', () => openDialog(activeCard));
  dialogClose?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.addEventListener('keydown', (event) => {
    if (dialog?.open) return;
    if (event.key === 'ArrowLeft') moveFeatured(-1);
    if (event.key === 'ArrowRight') moveFeatured(1);
  });
  window.addEventListener('hashchange', () => showRequestedCard({ scroll: true }));

  if (!showRequestedCard()) setFeatured(activeCard);
};

loadPublishedArt().finally(initializeArchive);
