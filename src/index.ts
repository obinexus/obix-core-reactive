/**
 * obix-core-reactive  (formerly obix-adapter-reactive / obix-binding-reactive)
 *
 * The Reactive projection: current state, frozen props, subscribers, changedKeys
 * and an effects lifecycle. Transitions route through obix-ir.applyAction.
 * Effects consume state/props but never own component business logic — the
 * scheduler just re-checks the declared `while(state, props)` predicate.
 */
import { applyAction, calculateChangedKeys } from "obix-core-ir";
import {
  createScheduler,
  defaultClock,
  evaluateWhile,
  type Clock,
  type RuntimeEffect,
} from "obix-core-scheduler/effects";
import type {
  DOPArtifact,
  State,
  Props,
  Payload,
  ActionTrace,
  TransitionMeta,
  ValidationResult,
} from "obix-core-spec";

// the interval clock `startEffects` defaults to (`defaultClock` is also the name the published legacy adapter-reactive package exported)
export { defaultClock };
export type { Clock };

export type Subscriber<S extends object> = (
  next: S,
  prev: S,
  meta: TransitionMeta<S>,
) => void;

export interface ReactiveInstance<S extends object, P extends object> {
  readonly state: S;
  readonly props: P;
  readonly transitions: number;
  dispatch(actionName: string, payload?: Payload): S;
  subscribe(fn: Subscriber<S>): () => void;
  render(): string;
  validate(): ValidationResult;
  startEffects(clock?: Clock): void;
  stopEffects(): void;
  readonly activeEffects: number;
}

export interface ReactiveFactory<S extends object, P extends object> {
  (opts?: { state?: S; props?: Partial<P> }): ReactiveInstance<S, P>;
}

export function toReactive<S extends object = State, P extends object = Props>(
  artifact: DOPArtifact<S, P>,
): ReactiveFactory<S, P> {
  return function create(opts: { state?: S; props?: Partial<P> } = {}): ReactiveInstance<S, P> {
    let cur: S = opts.state ?? artifact.initialState;
    let transitions = 0;
    const props = Object.freeze({ ...artifact.props, ...(opts.props ?? {}) }) as P;
    const subs = new Set<Subscriber<S>>();
    let scheduler: ReturnType<typeof createScheduler> | undefined;

    const dispatch = (actionName: string, payload?: Payload): S => {
      const prev = cur;
      const next = applyAction(artifact, prev, actionName, payload, props);
      if (Object.is(next, prev)) return prev;
      cur = next;
      transitions++;
      const meta: TransitionMeta<S> = {
        action: actionName,
        payload,
        from: prev,
        to: next,
        changedKeys: calculateChangedKeys(prev, next),
      };
      for (const fn of subs) fn(next, prev, meta);
      return next;
    };

    const instance: ReactiveInstance<S, P> = {
      get state() {
        return cur;
      },
      get props() {
        return props;
      },
      get transitions() {
        return transitions;
      },
      get activeEffects() {
        return scheduler?.activeCount ?? 0;
      },
      dispatch,
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      render: () => (artifact.render ? artifact.render(cur, props) : ""),
      validate: () => (artifact.validate ? artifact.validate(cur, props) : { valid: true, violations: [] }),
      startEffects(clock: Clock = defaultClock) {
        if (scheduler) return;
        scheduler = createScheduler(clock);
        for (const [name, descRaw] of Object.entries(artifact.effects)) {
          const desc = descRaw as RuntimeEffect;
          if (desc.kind !== "every") continue;
          const predicate = () =>
            typeof desc.while === "function"
              ? desc.while(cur, props)
              : evaluateWhile(desc.whileExpr, cur as Record<string, unknown>, props as Record<string, unknown>);
          scheduler.every(name, desc.every ?? 1000, predicate, () => dispatch(desc.dispatch));
        }
        scheduler.start();
      },
      stopEffects() {
        scheduler?.stopAll();
        scheduler = undefined;
      },
    };

    return instance;
  };
}
