/**
 * Host-half integration test: mounts the real engine on a real Cordis context
 * and drives the policy through the seams it depends on.
 *
 * Run from a checkout with the plugin's dependencies resolvable, i.e. with
 * `node_modules/@deepseek-ai` pointing at an installed DSH profile:
 *   node --test tests/host.test.mjs
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { Config, NS, apply } from '../lib/index.js'

/** Surface seqs used by the synthetic session; node 0 is the system head. */
const SURFACE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * Build a session stub with a balanced surface (every event is a plain user
 * message, so no tool call crosses a cut).
 * @returns the session stub.
 */
function makeSession() {
  return {
    surface: { nodes: [...SURFACE], replaceGeneration: 1 },
    eventAt: (seq) => ({ seq, type: seq === 1 ? 'system/message' : 'user/message' }),
    requestHeader: () => undefined,
  }
}

/** Token-meter measurement matching {@link SURFACE}. */
function makeMeasurement() {
  return { nodes: SURFACE.map(seq => ({ seq, tokens: 10 })), totalTokens: 70000 }
}

/**
 * Wait until a service is readable from a context.
 * @param ctx - the context to read.
 * @param name - service name.
 * @returns the registered service value.
 */
async function waitForService(ctx, name) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5))
    let value
    try {
      value = ctx.get(name)
    } catch {
      value = undefined
    }
    if (value !== undefined) return value
  }
  throw new Error(`service ${name} never registered`)
}

/**
 * Mount the plugin on a fresh Cordis context.
 * @param config - the row config.
 * @param options - `settings` installs a fake settings provider; `usedTokens`
 * seeds the `contextPressure` projection.
 * @returns the mounted engine, the settings capture, and the projection handle.
 */
async function mount(config, options = {}) {
  const root = new Context()
  const pressure = {
    projectedTokens: options.usedTokens ?? 70000,
    contextWindow: options.contextWindow ?? 100000,
  }
  root.provide('sessionProjections', {
    snapshot: () => ({ asOfSeq: 0, values: { contextPressure: pressure } }),
  })
  root.provide('tokenMeter', { measure: () => makeMeasurement() })
  root.provide('llm', { resolveModelInfo: async () => ({ context: { contextWindow: 100000 } }) })
  root.provide('sessions', {})
  const captured = { calls: [] }
  if (options.settings === true) {
    root.provide('settings', {
      installSection: (owner, ns, schema, entry, hooks) => {
        captured.ns = ns
        captured.schema = schema
        captured.entry = entry
        captured.hooks = hooks
      },
    })
  }
  apply(root, config)
  // The service appears once the engine fiber passes its inject gates.
  const engine = await waitForService(root, 'compaction')
  captured.regions = []
  engine.compactRegion = async (start, end) => {
    captured.regions.push([start, end])
    return { shadowedSeqs: [], shadowedRange: { start, end }, shadowedTokenCount: 0 }
  }
  return { root, engine, captured, pressure }
}

const SIGNAL = { aborted: false }
const agent = () => ({ session: makeSession() })

test('schema defaults and range validation', () => {
  const resolved = Config({})
  assert.equal(resolved.enabled, true)
  assert.equal(resolved.triggerPercent, 65)
  assert.equal(resolved.compactPercent, 25)
  assert.equal(resolved.maxTokens, 16384)
  assert.throws(() => Config({ triggerPercent: 101 }))
  assert.throws(() => Config({ compactPercent: 0 }))
})

test('fires at the configured occupancy and not below it', async () => {
  const at = await mount({ enabled: true, triggerPercent: 65, compactPercent: 25, maxTokens: 16384 })
  assert.deepEqual(await at.engine.compactIfNeeded(agent(), 'pressure', SIGNAL), {
    shadowedSeqs: [],
    shadowedRange: { start: 2, end: 3 },
    shadowedTokenCount: 0,
  })
  // Oldest 25% of the 9-node compactable span, at least one node, edges balanced.
  assert.deepEqual(at.captured.regions, [[2, 3]])

  const below = await mount({ enabled: true, triggerPercent: 65, compactPercent: 25, maxTokens: 16384 }, { usedTokens: 60000 })
  assert.equal(await below.engine.compactIfNeeded(agent(), 'pressure', SIGNAL), null)
  assert.deepEqual(below.captured.regions, [])
})

test('the compacted share follows the configured ratio', async () => {
  const { engine, captured } = await mount({ enabled: true, triggerPercent: 65, compactPercent: 90, maxTokens: 16384 })
  await engine.compactIfNeeded(agent(), 'pressure', SIGNAL)
  assert.deepEqual(captured.regions, [[2, 9]])
})

test('the switch off delegates instead of running this policy', async () => {
  // `requestHeader()` is undefined, so the inherited path returns null before
  // doing any work: our selection must not run at all.
  const { engine, captured } = await mount({ enabled: false, triggerPercent: 65, compactPercent: 25, maxTokens: 16384 })
  assert.equal(await engine.compactIfNeeded(agent(), 'pressure', SIGNAL), null)
  assert.deepEqual(captured.regions, [])
})

test('a live settings layer replaces the composition policy', async () => {
  const { engine, captured, pressure } = await mount(
    { enabled: true, triggerPercent: 90, compactPercent: 25, maxTokens: 16384 },
    { settings: true },
  )
  assert.equal(captured.ns, NS)
  // 70% is below the composition's 90%: nothing fires.
  assert.equal(await engine.compactIfNeeded(agent(), 'pressure', SIGNAL), null)

  // The settings scope becomes authoritative and raises nothing but lowers the
  // threshold to 50%, so the same occupancy now fires.
  captured.hooks.setSource(() => ({ enabled: true, triggerPercent: 50, compactPercent: 10, maxTokens: 16384 }))
  pressure.projectedTokens = 70000
  await engine.compactIfNeeded(agent(), 'pressure', SIGNAL)
  assert.deepEqual(captured.regions, [[2, 2]])

  // And switching it off through the same layer stops this policy again.
  captured.hooks.setSource(() => ({ enabled: false, triggerPercent: 50, compactPercent: 10, maxTokens: 16384 }))
  assert.equal(await engine.compactIfNeeded(agent(), 'pressure', SIGNAL), null)
})

test('a missing occupancy projection falls back to the inherited engine', async () => {
  const root = new Context()
  root.provide('sessionProjections', { snapshot: () => ({ asOfSeq: 0, values: {} }) })
  root.provide('tokenMeter', { measure: () => makeMeasurement() })
  root.provide('llm', { resolveModelInfo: async () => ({ context: { contextWindow: 100000 } }) })
  root.provide('sessions', {})
  apply(root, { enabled: true, triggerPercent: 65, compactPercent: 25, maxTokens: 16384 })
  const engine = await waitForService(root, 'compaction')
  let regions = 0
  engine.compactRegion = async () => { regions += 1; return {} }
  assert.equal(await engine.compactIfNeeded(agent(), 'pressure', SIGNAL), null)
  assert.equal(regions, 0)
})
