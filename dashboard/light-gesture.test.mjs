import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveLightGesture } from './js/light-gesture.js';
const gesture = () => ({ x: 820, y: 100, left: 100, width: 900, value: 20, slide: false, cancel: false });
test('drag brightness follows absolute finger position, clamps bounds and uses final release coordinates', () => {
  const g = gesture();
  moveLightGesture(g, 550, 100); assert.equal(g.value, 50);
  moveLightGesture(g, 640, 100); assert.equal(g.value, 60); // Final pointerup can differ from last move.
  moveLightGesture(g, 1200, 100); assert.equal(g.value, 100);
  moveLightGesture(g, 0, 100); assert.equal(g.value, 0);
});
test('a tap preserves the current value and vertical scrolling cancels without changing power or brightness', () => {
  const tap = gesture(); moveLightGesture(tap, 823, 102); assert.equal(tap.slide, false); assert.equal(tap.value, 20);
  const scroll = gesture(); moveLightGesture(scroll, 825, 130); assert.equal(scroll.cancel, true); assert.equal(scroll.slide, false);
});
