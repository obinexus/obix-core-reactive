/**
 * Effect lifecycle of the reactive projection, on a virtual clock (deterministic, no real timers):
 * cancellation, restart, props threading, subscription cleanup.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { toReactive } from "../dist/index.js";
import { createVirtualClock } from "obix-core-scheduler/effects";
import { TimerDOP } from "obix-fixture-timer";

test("stopEffects cancels the running effect: no further ticks and nothing left on the clock", () => {
  const vc = createVirtualClock();
  const r = toReactive(TimerDOP)({ props: { limitSeconds: 100 } });
  r.startEffects(vc.clock);
  r.dispatch("Start");
  vc.advance(3000);
  assert.equal(r.state.seconds, 3);
  assert.equal(r.activeEffects, 1);
  r.stopEffects();
  assert.equal(r.activeEffects, 0);
  assert.equal(vc.clock.pending, 0, "no timer is left on the clock");
  vc.advance(60000);
  assert.equal(r.state.seconds, 3);
});

test("stopEffects is idempotent and effects can be started again afterwards", () => {
  const vc = createVirtualClock();
  const r = toReactive(TimerDOP)({ props: { limitSeconds: 100 } });
  r.stopEffects();
  r.startEffects(vc.clock);
  r.startEffects(vc.clock); // a second start does not double the timers
  assert.equal(vc.clock.pending, 1);
  r.dispatch("Start");
  vc.advance(2000);
  r.stopEffects();
  r.stopEffects();
  r.startEffects(vc.clock);
  vc.advance(2000);
  assert.equal(r.state.seconds, 4, "the restarted effect keeps ticking from where the state was");
  r.stopEffects();
});

test("the effect predicate sees THIS instance's props (props are threaded through effects)", () => {
  const vc = createVirtualClock();
  const a = toReactive(TimerDOP)({ props: { limitSeconds: 2 } });
  const b = toReactive(TimerDOP)({ props: { limitSeconds: 4 } });
  a.startEffects(vc.clock); b.startEffects(vc.clock);
  a.dispatch("Start"); b.dispatch("Start");
  vc.advance(60000);
  assert.deepEqual(a.state, { seconds: 2, running: false });
  assert.deepEqual(b.state, { seconds: 4, running: false });
  assert.equal(a.activeEffects + b.activeEffects, 0, "both quiesced");
});

test("an effect armed before its condition holds still runs once the condition becomes true", () => {
  const vc = createVirtualClock();
  const r = toReactive(TimerDOP)({ props: { limitSeconds: 3 } });
  r.startEffects(vc.clock);
  vc.advance(5000);
  assert.equal(r.state.seconds, 0, "not running: the predicate is false and the effect stopped itself");
  // The Level-0 contract: a false predicate ends the interval; the way back in is an explicit restart.
  assert.equal(r.activeEffects, 0);
  r.stopEffects();
  r.startEffects(vc.clock);
  r.dispatch("Start");
  vc.advance(10000);
  assert.deepEqual(r.state, { seconds: 3, running: false });
});

test("subscribe returns an unsubscribe; an unsubscribed listener is never called again; unsubscribing twice is harmless", () => {
  const r = toReactive(TimerDOP)();
  const seen = [];
  const off = r.subscribe((next) => seen.push(next.running));
  r.dispatch("Start");
  off(); off();
  r.dispatch("Stop");
  assert.deepEqual(seen, [true]);
});

test("a listener that unsubscribes itself during delivery does not disturb the others", () => {
  const r = toReactive(TimerDOP)();
  const order = [];
  const offA = r.subscribe(() => { order.push("a"); offA(); });
  r.subscribe(() => order.push("b"));
  r.dispatch("Start");
  r.dispatch("Stop");
  assert.deepEqual(order, ["a", "b", "b"]);
});
