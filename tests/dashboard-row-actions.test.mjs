import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSessionId,
  removeSessionById,
} from '../src/js/dashboard-row-actions.js';

test('normalizeSessionId keeps valid ids and rejects empty values', () => {
  assert.equal(normalizeSessionId('abc'), 'abc');
  assert.equal(normalizeSessionId(123), '123');
  assert.equal(normalizeSessionId(''), null);
  assert.equal(normalizeSessionId(null), null);
  assert.equal(normalizeSessionId(undefined), null);
});

test('removeSessionById removes matching session ids using string comparison', () => {
  const sessions = [
    { id: '1', label: 'keep' },
    { id: 2, label: 'remove' },
    { id: '3', label: 'keep' },
  ];

  assert.deepEqual(removeSessionById(sessions, '2'), [
    { id: '1', label: 'keep' },
    { id: '3', label: 'keep' },
  ]);
});

test('removeSessionById leaves sessions unchanged when id is empty', () => {
  const sessions = [{ id: '1' }];

  assert.deepEqual(removeSessionById(sessions, null), sessions);
  assert.deepEqual(removeSessionById(sessions, ''), sessions);
});
