(function initializeContentCredit() {
  const guildName = 'Lumina';
  const guildAliases = new Set([
    '',
    'lumina',
    'lumina community',
    'lumina guild',
    'lumina member',
    'lumina roleplay team',
    'lumina staff'
  ]);
  const supportedTones = new Set(['art', 'blog', 'gallery', 'roleplay']);
  const guildCreatorId = 'lumina';

  function cleanCreditName(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalize(value) {
    const candidate = cleanCreditName(value);
    const isGuild = guildAliases.has(candidate.toLocaleLowerCase('en'));

    return {
      name: isGuild ? guildName : candidate,
      isGuild
    };
  }

  function fallbackCreatorId(name) {
    const normalized = normalize(name);
    if (normalized.isGuild) return guildCreatorId;
    const input = normalized.name.toLocaleLowerCase('en');
    const hash = (value, seed) => {
      let result = seed >>> 0;
      for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
      }
      return (result >>> 0).toString(16).padStart(8, '0');
    };
    const reversed = [...input].reverse().join('');
    return `legacy-${hash(input, 2166136261)}${hash(reversed, 2246822519)}`;
  }

  function normalizeCreatorId(value, name) {
    const candidate = cleanCreditName(value);
    return candidate || fallbackCreatorId(name);
  }

  function creatorUrl(creatorId) {
    return `guild-creator.html?profile=${encodeURIComponent(creatorId)}`;
  }

  function create(value, options = {}) {
    const credit = normalize(value);
    const creatorId = normalizeCreatorId(options.creatorId, credit.name);
    const linked = options.link !== false;
    const root = document.createElement(linked ? 'a' : options.tagName === 'span' ? 'span' : 'div');
    const tone = supportedTones.has(options.tone) ? options.tone : '';
    const label = cleanCreditName(options.label) || 'Created by';

    root.className = [
      'content-credit',
      tone ? `content-credit--${tone}` : '',
      options.compact ? 'content-credit--compact' : '',
      credit.isGuild ? 'is-guild' : ''
    ].filter(Boolean).join(' ');
    root.dataset.contentCredit = credit.name;
    root.dataset.contentCreatorId = creatorId;
    if (linked) {
      root.href = creatorUrl(creatorId);
      root.setAttribute('aria-label', credit.isGuild
        ? 'View the Lumina guild archive'
        : `View all content credited to ${credit.name}`);
    }

    const labelElement = document.createElement('span');
    labelElement.className = 'content-credit__label';
    labelElement.textContent = label;
    const name = document.createElement('strong');
    name.className = 'content-credit__name';
    name.textContent = credit.name;

    root.append(labelElement, name);
    return root;
  }

  window.LuminaContentCredit = Object.freeze({
    create,
    normalize,
    normalizeCreatorId,
    creatorUrl
  });
}());
