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

  function initialsFor(name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = Array.from(parts[0] || guildName)[0] || 'L';
    const last = parts.length > 1
      ? Array.from(parts[parts.length - 1])[0] || ''
      : '';
    return `${first}${last}`.toLocaleUpperCase('en');
  }

  function create(value, options = {}) {
    const credit = normalize(value);
    const root = document.createElement(options.tagName === 'span' ? 'span' : 'div');
    const tone = supportedTones.has(options.tone) ? options.tone : '';
    const label = cleanCreditName(options.label) || 'Created by';

    root.className = [
      'content-credit',
      tone ? `content-credit--${tone}` : '',
      options.compact ? 'content-credit--compact' : '',
      credit.isGuild ? 'is-guild' : ''
    ].filter(Boolean).join(' ');
    root.dataset.contentCredit = credit.name;

    const seal = document.createElement('span');
    seal.className = 'content-credit__seal';
    seal.setAttribute('aria-hidden', 'true');
    const mark = document.createElement('span');
    mark.className = 'content-credit__mark';
    mark.textContent = initialsFor(credit.name);
    seal.append(mark);

    const copy = document.createElement('span');
    copy.className = 'content-credit__copy';
    const labelElement = document.createElement('span');
    labelElement.className = 'content-credit__label';
    labelElement.textContent = label;
    const name = document.createElement('strong');
    name.className = 'content-credit__name';
    name.textContent = credit.name;
    copy.append(labelElement, name);

    root.append(seal, copy);
    return root;
  }

  window.LuminaContentCredit = Object.freeze({
    create,
    normalize
  });
}());
