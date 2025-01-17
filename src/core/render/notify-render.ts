import { assertDefined } from '../assert/assert';
import { QHostAttr } from '../util/markers';
import { executeContextWithSlots, printRenderStats, RenderContext } from './cursor';
import { getContext, resumeIfNeeded } from '../props/props';
import { qDev } from '../util/qdev';
import { getPlatform } from '../platform/platform';
import { getDocument } from '../util/dom';
import { renderComponent } from '../component/component-ctx';
import { logDebug } from '../util/log';
import { getContainer } from '../use/use-core';

/**
 * Mark component for rendering.
 *
 * Use `notifyRender` method to mark a component for rendering at some later point in time.
 * This method uses `getPlatform(doc).queueRender` for scheduling of the rendering. The
 * default implementation of the method is to use `requestAnimationFrame` to do actual rendering.
 *
 * The method is intended to coalesce multiple calls into `notifyRender` into a single call for
 * rendering.
 *
 * @param hostElement - Host-element of the component to re-render.
 * @returns A promise which is resolved when the component has been rendered.
 * @public
 */
export function notifyRender(hostElement: Element): Promise<RenderContext> {
  assertDefined(hostElement.getAttribute(QHostAttr));

  const containerEl = getContainer(hostElement)!;
  assertDefined(containerEl);
  resumeIfNeeded(containerEl);

  const ctx = getContext(hostElement);
  const state = getRenderingState(containerEl);
  if (ctx.dirty) {
    // TODO
    return state.renderPromise!;
  }
  ctx.dirty = true;
  const activeRendering = state.hostsRendering !== undefined;
  if (activeRendering) {
    state.hostsStaging.add(hostElement);
    return state.renderPromise!.then((ctx) => {
      if (state.hostsNext.has(hostElement)) {
        // TODO
        return state.renderPromise!;
      } else {
        return ctx;
      }
    });
  } else {
    state.hostsNext.add(hostElement);
    return scheduleFrame(containerEl, state);
  }
}

export function scheduleFrame(containerEl: Element, state: RenderingState): Promise<RenderContext> {
  if (state.renderPromise === undefined) {
    state.renderPromise = getPlatform(containerEl).nextTick(() => renderMarked(containerEl, state));
  }
  return state.renderPromise;
}

const SCHEDULE = Symbol('Render state');

export interface RenderingState {
  hostsNext: Set<Element>;
  hostsStaging: Set<Element>;
  hostsRendering: Set<Element> | undefined;
  renderPromise: Promise<RenderContext> | undefined;
}

export function getRenderingState(containerEl: Element): RenderingState {
  let set = (containerEl as any)[SCHEDULE] as RenderingState;
  if (!set) {
    (containerEl as any)[SCHEDULE] = set = {
      hostsNext: new Set(),
      hostsStaging: new Set(),
      renderPromise: undefined,
      hostsRendering: undefined,
    };
  }
  return set;
}

export async function renderMarked(
  containerEl: Element,
  state: RenderingState
): Promise<RenderContext> {
  state.hostsRendering = new Set(state.hostsNext);
  state.hostsNext.clear();

  const doc = getDocument(containerEl);
  const platform = getPlatform(containerEl);
  const renderingQueue = Array.from(state.hostsRendering);
  sortNodes(renderingQueue);

  const ctx: RenderContext = {
    doc,
    globalState: state,
    hostElements: new Set(),
    operations: [],
    roots: [],
    containerEl,
    component: undefined,
    perf: {
      visited: 0,
      timing: [],
    },
  };

  for (const el of renderingQueue) {
    if (!ctx.hostElements.has(el)) {
      ctx.roots.push(el);
      await renderComponent(ctx, getContext(el));
    }
  }

  // Early exist, no dom operations
  if (ctx.operations.length === 0) {
    if (qDev) {
      if (typeof window !== 'undefined' && window.document != null) {
        logDebug('Render skipped. No operations.');
        printRenderStats(ctx);
      }
    }
    postRendering(containerEl, state);
    return ctx;
  }

  return platform.raf(() => {
    executeContextWithSlots(ctx);
    if (qDev) {
      if (typeof window !== 'undefined' && window.document != null) {
        printRenderStats(ctx);
      }
    }
    postRendering(containerEl, state);
    return ctx;
  });
}

function postRendering(containerEl: Element, state: RenderingState) {
  // Move elements from staging to nextRender
  state.hostsStaging.forEach((el) => {
    state.hostsNext.add(el);
  });

  // Clear staging
  state.hostsStaging.clear();
  state.hostsRendering = undefined;
  state.renderPromise = undefined;

  if (state.hostsNext.size > 0) {
    scheduleFrame(containerEl, state);
  }
}

function sortNodes(elements: Element[]) {
  elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
}
