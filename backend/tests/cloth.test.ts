import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClothMotion, updateClothMotion } from '../../frontend/src/components/clothMotion.js';

test('fabric lags behind movement, changes direction, and settles after release', () => {
  const motion = createClothMotion();
  for (let frame = 0; frame < 30; frame++) updateClothMotion(motion, 1, 1 / 60);
  assert.ok(motion.bend < -0.08, 'The hem trails a hanger moving right');
  assert.ok(motion.energy > 0.8);
  for (let frame = 0; frame < 30; frame++) updateClothMotion(motion, -1, 1 / 60);
  assert.ok(motion.bend > 0.08, 'The cloth follows a reversed drag');
  updateClothMotion(motion, 0, 1 / 60);
  assert.ok(Math.abs(motion.bend) > 0.03, 'Release preserves motion instead of snapping straight');
  for (let frame = 0; frame < 360; frame++) updateClothMotion(motion, 0, 1 / 60);
  assert.ok(Math.abs(motion.bend) < 0.001);
  assert.ok(Math.abs(motion.ripple) < 0.001);
  assert.ok(motion.energy < 0.001);
});

test('cloth motion is consistent at 30, 60, and 120 fps and survives a long frame', () => {
  const results = [30, 60, 120].map((fps) => {
    const motion = createClothMotion();
    for (let frame = 0; frame < fps; frame++) updateClothMotion(motion, 0.8, 1 / fps);
    return motion;
  });
  for (const motion of results) {
    assert.ok(Math.abs(motion.bend - results[0].bend) < 0.001);
    assert.ok(Math.abs(motion.ripple - results[0].ripple) < 0.001);
  }
  for (const motion of results) {
    updateClothMotion(motion, 100, 5);
    assert.ok(Number.isFinite(motion.bend));
    assert.ok(Math.abs(motion.bend) < 0.3);
  }
});
