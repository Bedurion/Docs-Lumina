import assert from 'node:assert/strict';
import test from 'node:test';
import {
  legacyCreatorIdForName,
  normalizeCreatorName,
  validateCreatorIdentity,
  validateCreatorOperation
} from '../tools/content-creators.mjs';

test('creator normalization keeps Lumina stable and produces opaque deterministic legacy IDs', () => {
  assert.equal(normalizeCreatorName(' Lumina community '), 'Lumina');
  assert.equal(legacyCreatorIdForName('Lumina staff'), 'lumina');
  assert.equal(legacyCreatorIdForName('Sacrel'), 'legacy-93467c7d7e5ffc47');
  assert.equal(legacyCreatorIdForName('Legacy Character'), 'legacy-6b34410d622dfa8f');
  assert.equal(legacyCreatorIdForName(' Sacrel '), legacyCreatorIdForName('sacrel'));
});

test('version 6 creator identities separate guild and opaque member ownership', () => {
  assert.deepEqual(
    validateCreatorIdentity('lumina', 'guild', 'anything', 'Credit'),
    { creatorId: 'lumina', creatorScope: 'guild', creatorName: 'Lumina' }
  );
  assert.deepEqual(
    validateCreatorIdentity('member-0123456789abcdef', 'member', 'Sacrel', 'Credit'),
    {
      creatorId: 'member-0123456789abcdef',
      creatorScope: 'member',
      creatorName: 'Sacrel'
    }
  );
  assert.throws(
    () => validateCreatorIdentity('1444865794688159865', 'member', 'Sacrel'),
    /opaque member creator ID/
  );
  assert.throws(
    () => validateCreatorIdentity('member-0123456789abcdef', 'guild', 'Lumina'),
    /creatorId lumina/
  );
});

test('creator operations enforce exact schemas and safe rename and transfer semantics', () => {
  const rename = validateCreatorOperation({
    version: 1,
    type: 'rename',
    scope: 'all',
    sourceCreatorId: 'member-0123456789abcdef',
    targetCreatorId: 'member-0123456789abcdef',
    targetScope: 'member',
    targetName: 'New Main'
  });
  assert.equal(rename.targetName, 'New Main');

  const transfer = validateCreatorOperation({
    version: 1,
    type: 'transfer',
    scope: 'submission',
    submissionId: 'WS-ABCDEFGH',
    contentType: 'art',
    sourceCreatorId: 'member-0123456789abcdef',
    targetCreatorId: 'lumina',
    targetScope: 'guild',
    targetName: 'Lumina'
  });
  assert.equal(transfer.targetCreatorId, 'lumina');

  assert.throws(
    () => validateCreatorOperation({ ...rename, scope: 'submission' }),
    /invalid schema|all scope/
  );
  assert.throws(
    () => validateCreatorOperation({ ...rename, extra: true }),
    /invalid schema/
  );
  assert.throws(
    () => validateCreatorOperation({
      ...transfer,
      targetCreatorId: 'member-fedcba9876543210',
      targetScope: 'guild'
    }),
    /creatorId lumina/
  );
});
