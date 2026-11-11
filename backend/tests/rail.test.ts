import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushJerseys, openJerseyGap } from '../../frontend/src/components/railPhysics.js';

const positions = Array.from({ length: 23 }, (_, index) => -1.3 + (index * 2.6) / 22);
const bounds = { min: -1.4, max: 1.4, gap: 0.09 };
function checkPositions(next: number[]) {
  assert.ok(next[0] >= bounds.min - 1e-8);
  assert.ok(next.at(-1)! <= bounds.max + 1e-8);
  for (let index = 1; index < next.length; index++)
    assert.ok(next[index] - next[index - 1] >= bounds.gap - 1e-8, 'Jerseys must not cross');
}
test('dragging pushes neighbors on the correct side without crossing the screen edges', () => {
  const right = pushJerseys(positions, 10, 100, bounds);
  checkPositions(right);
  assert.deepEqual(right.slice(0, 10), positions.slice(0, 10));
  assert.ok(right[11] > positions[11]);
  const left = pushJerseys(positions, 10, -100, bounds);
  checkPositions(left);
  assert.deepEqual(left.slice(11), positions.slice(11));
  assert.ok(left[9] < positions[9]);
});
test('hovering any jersey creates clearance and keeps the full jersey within the screen', () => {
  for (let index = 0; index < positions.length; index++) {
    const next = openJerseyGap(positions, index, bounds);
    checkPositions(next);
    if (index) assert.ok(next[index] - next[index - 1] >= 0.37 - 1e-8);
    if (index < next.length - 1) assert.ok(next[index + 1] - next[index] >= 0.37 - 1e-8);
    assert.ok(next[index] - 0.24 >= bounds.min - 1e-8);
    assert.ok(next[index] + 0.24 <= bounds.max + 1e-8);
  }
});

test('reversing a drag leaves pushed neighbors in place and reserves cloth clearance', () => {
  const start = openJerseyGap(positions, 10, bounds);
  const right = pushJerseys(start, 10, 100, bounds, 0.37, 0.24);
  const reversed = pushJerseys(right, 10, start[10], bounds, 0.37, 0.24);
  checkPositions(right);
  checkPositions(reversed);
  assert.deepEqual(reversed.slice(11), right.slice(11), 'Pushed neighbors keep their positions');
  for (const next of [right, reversed]) {
    assert.ok(next[10] - next[9] >= 0.37 - 1e-8);
    assert.ok(next[11] - next[10] >= 0.37 - 1e-8);
  }
  for (const index of [0, 22]) {
    const next = pushJerseys(positions, index, index ? 100 : -100, bounds, 0.37, 0.24);
    checkPositions(next);
    assert.ok(next[index] - 0.24 >= bounds.min - 1e-8);
    assert.ok(next[index] + 0.24 <= bounds.max + 1e-8);
  }
});
