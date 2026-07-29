const guildCreatorId = 'lumina';
const guildCreatorName = 'Lumina';
const memberCreatorIdPattern = /^member-[a-f0-9]{16}$/;
const legacyCreatorIdPattern = /^legacy-[a-f0-9]{16}$/;
const publicCreatorIdPattern = /^(?:lumina|member-[a-f0-9]{16}|legacy-[a-f0-9]{16})$/;
const guildAliases = new Set([
  '',
  'lumina',
  'lumina community',
  'lumina guild',
  'lumina member',
  'lumina roleplay team',
  'lumina staff'
]);
const contentTypes = new Set(['blog', 'art', 'gallery', 'roleplay']);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasExactKeys(value, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

export function cleanCreatorName(value, label = 'Creator name', { optional = false } = {}) {
  const name = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if ((!optional && !name) || name.length > 100) {
    fail(`${label} is missing or exceeds 100 characters.`);
  }

  return name;
}

export function normalizeCreatorName(value) {
  const candidate = cleanCreatorName(value, 'Creator name', { optional: true });
  return guildAliases.has(candidate.toLocaleLowerCase('en'))
    ? guildCreatorName
    : candidate;
}

export function legacyCreatorIdForName(value) {
  const name = normalizeCreatorName(value);
  if (name === guildCreatorName) return guildCreatorId;

  const input = name.toLocaleLowerCase('en');
  const hash = (text, seed) => {
    let result = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  const reversed = [...input].reverse().join('');
  return `legacy-${hash(input, 2166136261)}${hash(reversed, 2246822519)}`;
}

export function assertPublicCreatorId(value, label = 'Creator ID') {
  if (typeof value !== 'string' || !publicCreatorIdPattern.test(value)) {
    fail(`${label} has an invalid public-safe format.`);
  }
  return value;
}

export function validateCreatorIdentity(creatorId, creatorScope, creatorName, label = 'Creator') {
  if (!['member', 'guild'].includes(creatorScope)) {
    fail(`${label} scope must be member or guild.`);
  }

  const name = cleanCreatorName(creatorName, `${label} name`, {
    optional: creatorScope === 'guild'
  });

  if (creatorScope === 'guild') {
    if (creatorId !== guildCreatorId) {
      fail(`${label} guild scope must use creatorId lumina.`);
    }
    return {
      creatorId: guildCreatorId,
      creatorScope: 'guild',
      creatorName: guildCreatorName
    };
  }

  if (!memberCreatorIdPattern.test(String(creatorId || ''))) {
    fail(`${label} member scope must use an opaque member creator ID.`);
  }
  if (normalizeCreatorName(name) === guildCreatorName) {
    fail(`${label} member scope cannot use the Lumina guild name.`);
  }

  return {
    creatorId,
    creatorScope: 'member',
    creatorName: name
  };
}

export function validateCreatorOperation(value) {
  if (!isPlainObject(value)) {
    fail('Creator operation must be an object.');
  }

  const scope = value.scope;
  const expectedKeys = scope === 'submission'
    ? [
        'version', 'type', 'scope', 'submissionId', 'contentType',
        'sourceCreatorId', 'targetCreatorId', 'targetScope', 'targetName'
      ]
    : [
        'version', 'type', 'scope', 'sourceCreatorId',
        'targetCreatorId', 'targetScope', 'targetName'
      ];

  if (!hasExactKeys(value, expectedKeys) || value.version !== 1) {
    fail('Creator operation has an invalid schema.');
  }
  if (!['rename', 'transfer'].includes(value.type)) {
    fail('Creator operation type must be rename or transfer.');
  }
  if (!['all', 'submission'].includes(scope)) {
    fail('Creator operation scope must be all or submission.');
  }
  if (value.type === 'rename' && scope !== 'all') {
    fail('Creator rename operations must use all scope.');
  }
  if (scope === 'submission') {
    if (!/^WS-[A-Z2-9]{8}$/.test(value.submissionId)) {
      fail('Creator operation submission ID has an invalid format.');
    }
    if (!contentTypes.has(value.contentType)) {
      fail('Creator operation content type is not supported.');
    }
  }

  assertPublicCreatorId(value.sourceCreatorId, 'Source creator ID');
  const target = validateCreatorIdentity(
    value.targetCreatorId,
    value.targetScope,
    value.targetName,
    'Target creator'
  );

  if (value.type === 'rename') {
    if (value.sourceCreatorId !== target.creatorId) {
      fail('Creator rename must preserve the stable creator ID.');
    }
  } else if (value.sourceCreatorId === target.creatorId) {
    fail('Creator transfer must change the stable creator ID.');
  }

  return Object.freeze({
    ...value,
    targetCreatorId: target.creatorId,
    targetScope: target.creatorScope,
    targetName: target.creatorName
  });
}

export function storedCreatorId(entry, creditField) {
  if (entry?.creatorId !== undefined) {
    return assertPublicCreatorId(entry.creatorId, 'Stored creator ID');
  }
  return legacyCreatorIdForName(entry?.[creditField]);
}

export const creatorSchema = Object.freeze({
  guildCreatorId,
  guildCreatorName,
  memberCreatorIdPattern,
  legacyCreatorIdPattern,
  publicCreatorIdPattern
});
