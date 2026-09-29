import test from "node:test";
import assert from "node:assert/strict";
import { toReactive } from "../dist/index.js";
import { createVirtualClock } from "obix-core-scheduler/effects";
import { TimerDOP } from "obix-fixture-timer";

test("subscribers receive changedKeys; identity actions do not notify", () => {
  const r = toReactive(TimerDOP)({ props: { limitSeconds: 5 } });
  const seen = [];
  r.subscribe((next, prev, meta) => seen.push(meta.changedKeys));
  r.dispatch("Start"); // running: false -> true
  r.dispatch("Start"); // identity -> no notification
  assert.deepEqual(seen, [["running"]]);
  assert.equal(r.transitions, 1);
});

test("effects lifecycle quiesces on the simple while predicate", () => {
  const vc = createVirtualClock();
  const r = toReactive(TimerDOP)({ props: { limitSeconds: 5 } });
  r.startEffects(vc.clock);
  r.dispatch("Start");
  vc.advance(20000);
  assert.deepEqual(r.state, { seconds: 5, running: false });
  assert.equal(r.activeEffects, 0);
  r.stopEffects();
});

import { defaultClock as exportedClock } from "../dist/index.js";

test("defaultClock is exported: the interval clock startEffects uses when none is given (the name of the published adapter-reactive)", () => {
  assert.equal(typeof exportedClock.setInterval, "function");
  assert.equal(typeof exportedClock.clearInterval, "function");
  const handle = exportedClock.setInterval(() => {}, 1_000_000);
  exportedClock.clearInterval(handle);
});
