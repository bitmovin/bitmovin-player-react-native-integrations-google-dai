import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteSourceConfigFactory,
  storeSourceConfigFactory,
  takeSourceConfigFactory,
} from '../src/googleDaiSourceConfigFactoryRegistry';

void test('source config factories are independent and removable', () => {
  const first = () => ({ title: 'one' });
  const second = () => ({ title: 'two' });

  storeSourceConfigFactory('first', first);
  storeSourceConfigFactory('second', second);

  assert.equal(takeSourceConfigFactory('second'), second);
  assert.equal(takeSourceConfigFactory('second'), undefined);
  assert.equal(takeSourceConfigFactory('first'), first);

  storeSourceConfigFactory('removed', first);
  deleteSourceConfigFactory('removed');
  assert.equal(takeSourceConfigFactory('removed'), undefined);
});
