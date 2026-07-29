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
    normalize
  });
}());
