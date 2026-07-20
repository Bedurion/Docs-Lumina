const blogStatus = document.querySelector('[data-blog-status]');
const featuredContainer = document.querySelector('[data-blog-featured]');
const postList = document.querySelector('[data-blog-posts]');
const trendingStatus = document.querySelector('[data-blog-trending-status]');
const trendingContainer = document.querySelector('[data-blog-trending]');
const leadersStatus = document.querySelector('[data-blog-leaders-status]');
const leadersContainer = document.querySelector('[data-blog-leaders]');

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Published by Lumina staff'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
}

function getViewCount(post) {
  const views = Number(post?.views);
  return Number.isSafeInteger(views) && views >= 0 ? views : 0;
}

function formatViews(post) {
  const views = getViewCount(post);
  return `${new Intl.NumberFormat().format(views)} ${views === 1 ? 'view' : 'views'}`;
}

function buildMeta(post, options = {}) {
  const meta = document.createElement('div');
  meta.className = 'blog-post-meta';
  const values = [
    createTextElement('span', 'blog-category', post.category || 'Guild journal'),
    createTextElement('span', '', formatDate(post.publishedAt)),
    createTextElement('span', '', `${Math.max(1, Number(post.readingMinutes) || 1)} min read`)
  ];
  if (options.showViews || getViewCount(post) > 0) {
    values.push(createTextElement('span', 'blog-view-count', formatViews(post)));
  }
  if (options.showLeadership && post.leadersSelection === true) {
    values.push(createTextElement('span', 'blog-leaders-badge', 'Leadership pick'));
  }
  meta.append(...values);
  return meta;
}

function appendTextParagraphs(container, value) {
  String(value || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .forEach((paragraph) => container.append(createTextElement('p', '', paragraph)));
}

function buildImageFigure(post, media, index, className = '') {
  if (media?.type !== 'image' || typeof media.src !== 'string') return null;
  const figure = document.createElement('figure');
  if (className) figure.className = className;
  const image = document.createElement('img');
  image.src = media.src;
  image.alt = media.alt || `${post.title || 'Lumina article'} image ${index + 1}`;
  image.width = Number(media.width) || 1200;
  image.height = Number(media.height) || 800;
  image.loading = 'lazy';
  image.decoding = 'async';
  figure.append(image);
  return figure;
}

function buildMedia(post) {
  const mediaItems = Array.isArray(post.media) ? post.media : [];

  if (mediaItems.length === 0) return null;

  const gallery = document.createElement('div');
  gallery.className = `blog-post-media blog-post-media-${Math.min(mediaItems.length, 4)}`;

  mediaItems.forEach((media, index) => {
    const figure = buildImageFigure(post, media, index);
    if (figure) gallery.append(figure);
  });

  return gallery.childElementCount > 0 ? gallery : null;
}

function buildArticleContent(post) {
  const body = document.createElement('div');
  body.className = 'blog-post-body';
  const orderedContent = Array.isArray(post.content) ? post.content : [];
  const mediaItems = Array.isArray(post.media) ? post.media : [];

  if (orderedContent.length === 0) {
    appendTextParagraphs(body, post.body);
    const media = buildMedia(post);
    if (media) body.append(media);
    return body;
  }

  orderedContent.forEach((block) => {
    if (block?.type === 'text') {
      appendTextParagraphs(body, block.text);
      return;
    }

    if (block?.type === 'image' && Number.isSafeInteger(block.mediaIndex)) {
      const figure = buildImageFigure(post, mediaItems[block.mediaIndex], block.mediaIndex, 'blog-inline-media');
      if (figure) body.append(figure);
    }
  });

  return body;
}

function buildFeatured(post) {
  const article = document.createElement('article');
  article.className = 'blog-featured-post';
  article.id = `latest-${String(post.id || '').toLowerCase()}`;

  const marker = document.createElement('div');
  marker.className = 'blog-featured-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = '<img src="assets/icons/content-blog.svg" alt=""><span>Latest article</span>';

  const content = document.createElement('div');
  content.className = 'blog-featured-content';
  content.append(
    buildMeta(post, { showLeadership: true }),
    createTextElement('h3', '', post.title || 'Lumina story'),
    createTextElement('p', 'blog-post-excerpt', post.excerpt || ''),
    createTextElement('p', 'blog-post-author', `By ${post.author || 'Lumina staff'}`),
    buildArticleContent(post)
  );
  article.append(marker, content);
  return article;
}

function buildArchivePost(post, options = {}) {
  const article = document.createElement('article');
  article.className = `blog-archive-post${options.curated ? ' blog-curated-post' : ''}`;
  if (options.linkable) article.id = String(post.id || '').toLowerCase();
  article.dataset.blogPostId = String(post.id || '');

  const summary = document.createElement('div');
  summary.className = 'blog-archive-summary';
  summary.append(
    buildMeta(post, {
      showViews: options.showViews,
      showLeadership: options.showLeadership
    }),
    createTextElement('h3', '', post.title || 'Lumina story'),
    createTextElement('p', 'blog-post-excerpt', post.excerpt || ''),
    createTextElement('p', 'blog-post-author', `By ${post.author || 'Lumina staff'}`)
  );

  if (options.curated) {
    const openArticle = document.createElement('a');
    openArticle.className = 'blog-curated-open';
    openArticle.href = `#${String(post.id || '').toLowerCase()}`;
    openArticle.innerHTML = '<span>Open article</span><span aria-hidden="true">→</span>';
    article.append(summary, openArticle);
  } else {
    const details = document.createElement('details');
    details.className = 'blog-archive-details';
    const toggle = document.createElement('summary');
    toggle.textContent = 'Read complete article';
    details.append(toggle, buildArticleContent(post));
    article.append(summary, details);
  }
  return article;
}

function buildCollectionEmpty(eyebrow, title, description, icon = 'assets/illustrations/blog-journal.svg') {
  const empty = document.createElement('article');
  empty.className = 'blog-archive-empty';
  const image = document.createElement('img');
  image.src = icon;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'blog-empty-copy';
  copy.append(
    createTextElement('p', 'eyebrow', eyebrow),
    createTextElement('h3', '', title),
    createTextElement('p', '', description)
  );
  empty.append(image, copy);
  return empty;
}

function buildArchiveEmpty() {
  return buildCollectionEmpty(
    'The shelf is ready',
    'More Lumina stories will live here.',
    'The archive is ready for every future staff-reviewed story.'
  );
}

function renderPostCollection(container, posts, options = {}) {
  const fragment = document.createDocumentFragment();
  posts.forEach((post) => fragment.append(buildArchivePost(post, options)));
  container.replaceChildren(fragment);
}

function updateStatus(element, message, className) {
  element.classList.remove('blog-status-empty', 'blog-status-error', 'blog-status-summary');
  element.textContent = message;
  if (className) element.classList.add(className);
}

function revealHashPost() {
  if (!window.location.hash) return;
  let id = window.location.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    id = window.location.hash.slice(1);
  }
  const target = document.getElementById(id);
  target?.querySelector('details')?.setAttribute('open', '');
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderBlog(posts) {
  const sorted = posts
    .filter((post) => post?.visible !== false)
    .sort((left, right) => Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0));

  if (sorted.length === 0) {
    updateStatus(blogStatus, 'The journal is ready for its first visible Lumina story.', 'blog-status-empty');
    featuredContainer.innerHTML = '<article class="blog-empty-state"><img src="assets/illustrations/blog-journal.svg" alt=""><div class="blog-empty-copy"><p class="eyebrow">The first page is waiting</p><h3>Lumina’s written archive begins here.</h3><p>Guild news and stories approved through Discord will appear in this space.</p></div></article>';
    postList.replaceChildren(buildArchiveEmpty());
    updateStatus(trendingStatus, 'Trending articles will appear after published stories receive recorded public views.', 'blog-status-empty');
    trendingContainer.replaceChildren(buildCollectionEmpty(
      'Waiting for readers',
      'No trending stories yet.',
      'This section activates when published articles have verified public view totals.',
      'assets/icons/blog-trending.svg'
    ));
    updateStatus(leadersStatus, 'Lumina leadership has not selected a public article yet.', 'blog-status-empty');
    leadersContainer.replaceChildren(buildCollectionEmpty(
      'Editorial shelf',
      'No leadership selections yet.',
      'Articles chosen by Lumina leadership will be collected here.',
      'assets/icons/blog-leaders-selection.svg'
    ));
    return;
  }
  const [featured] = sorted;
  featuredContainer.replaceChildren(buildFeatured(featured));

  renderPostCollection(postList, sorted, {
    linkable: true,
    showLeadership: true
  });

  const trending = [...sorted]
    .filter((post) => getViewCount(post) > 0)
    .sort((left, right) => (
      getViewCount(right) - getViewCount(left) ||
      Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0)
    ));
  if (trending.length > 0) {
    renderPostCollection(trendingContainer, trending, {
      curated: true,
      showViews: true,
      showLeadership: true
    });
    updateStatus(
      trendingStatus,
      `${trending.length} ${trending.length === 1 ? 'article is' : 'articles are'} ranked by recorded public views.`,
      'blog-status-summary'
    );
  } else {
    updateStatus(trendingStatus, 'Trending articles will appear after published stories receive recorded public views.', 'blog-status-empty');
    trendingContainer.replaceChildren(buildCollectionEmpty(
      'Waiting for readers',
      'No trending stories yet.',
      'This section activates when published articles have verified public view totals.',
      'assets/icons/blog-trending.svg'
    ));
  }

  const leadersSelection = sorted.filter((post) => post.leadersSelection === true);
  if (leadersSelection.length > 0) {
    renderPostCollection(leadersContainer, leadersSelection, {
      curated: true,
      showViews: true,
      showLeadership: true
    });
    updateStatus(
      leadersStatus,
      `${leadersSelection.length} ${leadersSelection.length === 1 ? 'article has' : 'articles have'} been selected by Lumina leadership.`,
      'blog-status-summary'
    );
  } else {
    updateStatus(leadersStatus, 'Lumina leadership has not selected a public article yet.', 'blog-status-empty');
    leadersContainer.replaceChildren(buildCollectionEmpty(
      'Editorial shelf',
      'No leadership selections yet.',
      'Articles chosen by Lumina leadership will be collected here.',
      'assets/icons/blog-leaders-selection.svg'
    ));
  }

  updateStatus(
    blogStatus,
    `${sorted.length} published ${sorted.length === 1 ? 'article' : 'articles'} in the Lumina journal.`,
    'blog-status-summary'
  );

  revealHashPost();
}

async function loadBlog() {
  try {
    const response = await fetch('data/blog-posts.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const posts = Array.isArray(data.posts) ? data.posts : [];

    if (posts.length === 0) {
      renderBlog([]);
      return;
    }

    renderBlog(posts);
  } catch {
    updateStatus(blogStatus, 'The Lumina journal could not be loaded right now. Please try again later.', 'blog-status-error');
  }
}

loadBlog();
