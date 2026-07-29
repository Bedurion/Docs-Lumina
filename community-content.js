(function initializeCommunityContent() {
  const guildCreatorId = 'lumina';
  const guildName = 'Lumina';
  const contentTypes = Object.freeze({
    blog: Object.freeze({ label: 'Blog', singular: 'article', accent: 'blog' }),
    gallery: Object.freeze({ label: 'Screenshots', singular: 'gallery story', accent: 'gallery' }),
    art: Object.freeze({ label: 'Artwork', singular: 'artwork', accent: 'art' }),
    roleplay: Object.freeze({ label: 'Roleplay', singular: 'chronicle', accent: 'roleplay' })
  });
  const sources = Object.freeze([
    Object.freeze({ url: 'data/art-curated.json', type: 'art', key: 'entries', curated: true }),
    Object.freeze({ url: 'data/community-media.json', type: 'gallery', key: 'entries' }),
    Object.freeze({ url: 'data/blog-posts.json', type: 'blog', key: 'posts' }),
    Object.freeze({ url: 'data/art-entries.json', type: 'art', key: 'entries' }),
    Object.freeze({ url: 'data/roleplay-stories.json', type: 'roleplay', key: 'stories' })
  ]);
  let loadPromise = null;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function cleanMultiline(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizeCreatorName(value) {
    if (window.LuminaContentCredit) return window.LuminaContentCredit.normalize(value).name;
    return clean(value) || guildName;
  }

  function normalizeCreatorId(value, name) {
    if (window.LuminaContentCredit) {
      return window.LuminaContentCredit.normalizeCreatorId(value, name);
    }
    const candidate = clean(value);
    if (candidate) return candidate;
    if (normalizeCreatorName(name) === guildName) return guildCreatorId;
    const input = normalizeCreatorName(name).toLocaleLowerCase('en');
    const hash = (value, seed) => {
      let result = seed >>> 0;
      for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
      }
      return (result >>> 0).toString(16).padStart(8, '0');
    };
    return `legacy-${hash(input, 2166136261)}${hash([...input].reverse().join(''), 2246822519)}`;
  }

  function creatorNameFor(entry, type) {
    return normalizeCreatorName(type === 'blog' || type === 'roleplay' ? entry.author : entry.credit);
  }

  function creatorIdFor(entry, name) {
    return normalizeCreatorId(
      entry.creatorId || entry.creditCreatorId || entry.authorCreatorId || entry.creditProfileId,
      name
    );
  }

  function dateValue(entry) {
    return clean(entry.updatedAt || entry.publishedAt || entry.submittedAt);
  }

  function timestamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function firstImage(media) {
    const values = Array.isArray(media) ? media : media ? [media] : [];
    return values.find((item) => item?.type !== 'video' && clean(item?.src)) || values.find((item) => clean(item?.src)) || null;
  }

  function deepLink(type, entry) {
    const rawId = clean(entry.slug || entry.id);
    if (!rawId) return '';
    if (type === 'blog') return `blog.html#${encodeURIComponent(clean(entry.id).toLocaleLowerCase('en'))}`;
    if (type === 'gallery') return `gallery.html#${encodeURIComponent(clean(entry.id).toLocaleLowerCase('en'))}`;
    if (type === 'art') return `guild-art.html#${encodeURIComponent(clean(entry.id).toLocaleLowerCase('en'))}`;
    return `guild-roleplay.html#story-${encodeURIComponent(rawId)}`;
  }

  function normalizeEntry(entry, source) {
    if (!entry || typeof entry !== 'object' || entry.visible === false || entry.hidden === true) return null;
    const id = clean(entry.id || entry.slug);
    const title = clean(entry.title);
    if (!id || !title) return null;
    const creatorName = creatorNameFor(entry, source.type);
    const creatorId = creatorIdFor(entry, creatorName);
    const media = source.type === 'roleplay'
      ? entry.cover
      : source.type === 'blog' || source.type === 'gallery'
        ? firstImage(entry.media || entry.images)
        : firstImage(entry.media);
    const summary = cleanMultiline(
      entry.excerpt || entry.summary || entry.subtitle || entry.description || entry.body
    ).slice(0, 360);
    const category = clean(entry.subcategory || entry.category);

    return Object.freeze({
      id,
      key: `${source.type}:${id.toLocaleLowerCase('en')}`,
      type: source.type,
      typeLabel: contentTypes[source.type].label,
      title,
      summary,
      category,
      creatorId,
      creatorName,
      isGuild: creatorId === guildCreatorId || creatorName === guildName,
      publishedAt: dateValue(entry),
      timestamp: timestamp(dateValue(entry)),
      thumbnail: media && clean(media.src) ? Object.freeze({
        type: clean(media.type) || 'image',
        src: clean(media.src),
        alt: clean(media.alt) || title,
        width: Number(media.width) || 0,
        height: Number(media.height) || 0
      }) : null,
      href: deepLink(source.type, entry),
      curated: source.curated === true
    });
  }

  async function readSource(source) {
    const response = await fetch(source.url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${source.url} returned HTTP ${response.status}`);
    const data = await response.json();
    const values = Array.isArray(data?.[source.key]) ? data[source.key] : [];
    return values.map((entry) => normalizeEntry(entry, source)).filter(Boolean);
  }

  function buildCreators(items) {
    const creators = new Map();
    items.forEach((item) => {
      const existing = creators.get(item.creatorId) || {
        id: item.creatorId,
        name: item.creatorName,
        isGuild: item.isGuild,
        items: [],
        counts: { blog: 0, gallery: 0, art: 0, roleplay: 0 },
        latestAt: '',
        latestTimestamp: 0
      };
      existing.items.push(item);
      existing.counts[item.type] += 1;
      if (item.timestamp >= existing.latestTimestamp) {
        existing.latestTimestamp = item.timestamp;
        existing.latestAt = item.publishedAt;
        existing.name = item.creatorName;
      }
      existing.isGuild = existing.isGuild || item.isGuild;
      creators.set(item.creatorId, existing);
    });

    return [...creators.values()].map((creator) => Object.freeze({
      ...creator,
      total: creator.items.length,
      items: Object.freeze([...creator.items].sort((left, right) => right.timestamp - left.timestamp)),
      counts: Object.freeze({ ...creator.counts }),
      href: `guild-creator.html?profile=${encodeURIComponent(creator.id)}`
    })).sort((left, right) => (
      Number(right.isGuild) - Number(left.isGuild) ||
      right.latestTimestamp - left.latestTimestamp ||
      left.name.localeCompare(right.name)
    ));
  }

  async function load() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.allSettled(sources.map(readSource)).then((results) => {
      const errors = [];
      const itemMap = new Map();
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          errors.push(Object.freeze({ source: sources[index].url, message: result.reason?.message || 'Unavailable' }));
          return;
        }
        result.value.forEach((item) => itemMap.set(item.key, item));
      });
      if (errors.length === sources.length) throw new Error('The community archive is unavailable.');
      const items = [...itemMap.values()].sort((left, right) => (
        right.timestamp - left.timestamp || left.title.localeCompare(right.title)
      ));
      return Object.freeze({
        items: Object.freeze(items),
        creators: Object.freeze(buildCreators(items)),
        errors: Object.freeze(errors),
        partial: errors.length > 0
      });
    });
    return loadPromise;
  }

  window.LuminaCommunityContent = Object.freeze({
    guildCreatorId,
    guildName,
    contentTypes,
    normalizeCreatorId,
    load
  });
}());
