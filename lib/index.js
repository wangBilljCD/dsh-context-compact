/**
 * context-compact — oldest-first context compaction with a live, user-editable policy.
 *
 * This plugin takes over the host's `compaction` service with an engine that
 * summarizes the OLDEST fraction of the compactable surface once the occupancy
 * the conversation footer displays reaches a configured threshold. The policy
 * is three user-visible values — an enable switch, the trigger percentage, and
 * the compacted share — served as the `context-compact` settings namespace and
 * rendered as a card in Settings → Plugins.
 *
 * Layering: the composition `base` is this row's `config`, the user document
 * layer sits above it, and the schema supplies defaults below both. When no
 * settings provider is mounted the row config is the whole policy, so the
 * plugin is fully usable from `cordis.yml` alone. With the switch off, the
 * inherited `compaction-basic` policy runs instead of nothing, so turning the
 * plugin off never leaves a session without overflow protection.
 *
 * @module dsh-context-compact
 */

import Schema from '@deepseek-ai/schemastery'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import { toolPairingBalancedAfter, toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction'

/** Plugin name registered with the Loader. */
export const name = 'context-compact'

/**
 * Settings namespace pairing this Host policy with its browser card. The card
 * registers into `settings.plugin.item` under exactly this key, and the
 * configurable-plugins tab dispatches a card only for a namespace the Host
 * actually serves.
 */
export const NS = 'context-compact'

/**
 * Policy schema. Percentages are whole numbers so the settings form and
 * `settings.yaml` carry the same values a user typed, with no rounding step.
 */
export const Config = Schema.object({
  /** Whether this plugin's own oldest-first policy runs. */
  enabled: Schema.boolean().default(true),
  /** Occupancy, in percent of the context window, at which a pass fires. */
  triggerPercent: Schema.number().step(1).min(1).max(100).default(65),
  /** Share of the compactable surface summarized per pass, from the oldest end. */
  compactPercent: Schema.number().step(1).min(1).max(99).default(25),
  /** Summary output cap in tokens. */
  maxTokens: Schema.number().step(1).min(1).default(16384),
})

/** Fallbacks applied when a settings value is absent or not a usable number. */
const DEFAULTS = { enabled: true, triggerPercent: 65, compactPercent: 25, maxTokens: 16384 }

/**
 * Resolve one policy value into the ratios the engine compares and cuts with.
 *
 * Reads clamp rather than trust: the settings service validates its own writes,
 * but a hand-edited `settings.yaml` or a row config that predates a schema
 * change can still carry a value outside the range, and a compaction pass that
 * fires at 0% or cuts 100% of the surface is a worse outcome than a clamp.
 * @param value - resolved policy section, or the composition entry.
 * @returns clamped switch, trigger ratio, compact ratio, and summary cap.
 */
function resolvePolicy(value) {
  const source = value ?? {}
  return {
    enabled: source.enabled !== false,
    triggerRatio: clamp(source.triggerPercent, 1, 100, DEFAULTS.triggerPercent) / 100,
    compactRatio: clamp(source.compactPercent, 1, 99, DEFAULTS.compactPercent) / 100,
    maxTokens: Math.floor(clamp(source.maxTokens, 1, Number.MAX_SAFE_INTEGER, DEFAULTS.maxTokens)),
  }
}

/**
 * Clamp one numeric policy value into range.
 * @param value - candidate value from a settings document or a row config.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @param fallback - value used when the candidate is not a finite number.
 * @returns the clamped number.
 */
function clamp(value, min, max, fallback) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, number))
}

/**
 * The inclusive surface-position range covering the oldest `compactRatio` of
 * the compactable span, with both edges backed to the nearest
 * tool-pairing-balanced cut so an assistant tool call never separates from its
 * result.
 *
 * Positions are counted, not priced: the percentage names a share of the
 * surface, and a pass that frees less than expected simply leaves occupancy
 * above the threshold, so the next step boundary takes another slice from the
 * oldest end.
 * @param session - the live session.
 * @param measurement - token-meter measurement of the session.
 * @param compactRatio - share of the compactable span to take, in (0, 1).
 * @returns `{ start, end }` seqs, or `null` when no useful oldest cut exists.
 */
function selectOldestRange(session, measurement, compactRatio) {
  const nodes = measurement.nodes
  if (nodes.length === 0) return null
  const surfaceNodes = session.surface.nodes
  if (surfaceNodes.length !== nodes.length) return null

  // First compactable position: skip a leading `system/message` node 0.
  let firstIdx = 0
  const headEvent = session.eventAt(surfaceNodes[0])
  if (headEvent !== undefined && headEvent.type === 'system/message') firstIdx = 1
  const lastIdx = surfaceNodes.length - 1
  if (firstIdx >= lastIdx) return null
  const spanSize = lastIdx - firstIdx + 1

  // Oldest fraction of the span, at least one node.
  const count = Math.max(1, Math.floor(spanSize * compactRatio))
  const endIdx = Math.min(firstIdx + count - 1, lastIdx)

  // Forward the start edge from firstIdx to the nearest balanced cut.
  let cutStartIdx = firstIdx
  while (cutStartIdx < endIdx && !toolPairingBalancedBefore(session, surfaceNodes[cutStartIdx])) {
    cutStartIdx += 1
  }

  // Back the end edge from endIdx to the nearest balanced cut. Backing can
  // land on the start edge itself, which leaves the single oldest node: a
  // one-node span is still a legal region, and rejecting it would make small
  // ratios silently never compact.
  let cutEndIdx = endIdx
  while (cutEndIdx > cutStartIdx && !toolPairingBalancedAfter(session, surfaceNodes[cutEndIdx])) {
    cutEndIdx -= 1
  }

  const start = surfaceNodes[cutStartIdx]
  const end = surfaceNodes[cutEndIdx]
  if (start === undefined || end === undefined) return null
  return { start, end }
}

/**
 * The occupancy a session's conversation footer renders, read from the same
 * `contextPressure` projection the client consumes: `projectedTokens` when the
 * meter holds a provider sample, else `pressureTokens`, over the newest
 * recorded route capacity.
 *
 * Resolving the window from the model route instead can disagree with the
 * displayed number after a model switch, when the projection still carries the
 * previous route's capacity.
 * @param ctx - the live Cordis context.
 * @param session - the session to price.
 * @returns `{ usedTokens, contextWindow }`, or `undefined` when unprojected.
 */
function displayedOccupancy(ctx, session) {
  const projections = ctx.get('sessionProjections')
  if (projections === undefined) return undefined
  const pressure = projections.snapshot(session, ['contextPressure']).values.contextPressure
  if (pressure === undefined) return undefined
  const usedTokens = pressure.projectedTokens ?? pressure.pressureTokens
  const contextWindow = pressure.contextWindow
  if (usedTokens === undefined || contextWindow === undefined) return undefined
  return { usedTokens, contextWindow }
}

/**
 * Mount the engine as the `compaction` service and attach the policy's
 * settings layer.
 * @param ctx - the plugin's Cordis context.
 * @param config - the composition entry, already resolved by {@link Config}.
 */
export function apply(ctx, config) {
  // Live policy source: the settings scope while one is attached, the
  // composition entry otherwise. `installSection` calls `setSource` at attach
  // and at detach with the thunk that is authoritative from then on.
  let source = () => config

  /**
   * Compaction backend that keeps the inherited transaction machinery and
   * redirects only the pressure-trigger selection toward the oldest content.
   *
   * Defined inside `apply` so `compactIfNeeded` closes over this plugin's live
   * policy source; a module-scope class would need the source threaded through
   * the Loader config, which is not a channel for live values.
   */
  class ContextCompactEngine extends BasicCompactionEngine {
    /**
     * @param engineCtx - the engine's Cordis context.
     * @param rowConfig - config the Loader already resolved against
     * {@link Config}, so it carries this plugin's policy keys as well as the
     * inherited engine's.
     */
    constructor(engineCtx, rowConfig) {
      // The inherited schema rejects unknown keys, and the policy keys are read
      // live through `source()` rather than frozen here, so they are dropped
      // before the inherited constructor sees them.
      const { enabled, triggerPercent, compactPercent, ...basic } = rowConfig ?? {}
      // `auto: true` keeps the inherited automatic plumbing — notably the
      // `agent/request-error` overflow recovery — while `compactIfNeeded`
      // stays dynamically dispatched, so this subclass still owns the
      // pressure policy.
      super(engineCtx, { auto: true, ...basic })
    }

    /**
     * Run the configured policy for a pressure trigger; delegate everything
     * else to the inherited engine.
     *
     * The switch being off, or the occupancy projection being unavailable,
     * falls through to the basic policy rather than doing nothing: a session
     * must never lose compaction because a display projection is missing.
     * @param agent - the live agent.
     * @param trigger - compaction trigger kind.
     * @param signal - live turn cancellation signal.
     * @returns the compaction result, or `null` when no summary ran.
     */
    async compactIfNeeded(agent, trigger, signal) {
      const policy = resolvePolicy(source())
      if (trigger !== 'pressure' || !policy.enabled) {
        return super.compactIfNeeded(agent, trigger, signal)
      }
      const occupancy = displayedOccupancy(this.ctx, agent.session)
      if (occupancy === undefined) return super.compactIfNeeded(agent, trigger, signal)
      const triggerTokens = Math.floor(occupancy.contextWindow * policy.triggerRatio)
      if (occupancy.usedTokens < triggerTokens) return null
      const measurement = this.ctx.tokenMeter.measure(agent.session)
      const range = selectOldestRange(agent.session, measurement, policy.compactRatio)
      if (range === null) return null
      return this.compactRegion(range.start, range.end, agent, signal)
    }
  }

  // The Loader validates a row's config against the row plugin's own schema.
  ContextCompactEngine.Config = Config

  ctx.plugin(ContextCompactEngine, config)

  ctx.inject(['settings'], (settingsCtx) => {
    // `installSection` is the optional-settings consumer path: it registers the
    // namespace with the composition entry as `base`, hands back the live
    // source, and falls back to the entry when the provider detaches. Older
    // providers without it leave the row config authoritative.
    if (typeof settingsCtx.settings.installSection !== 'function') return
    settingsCtx.settings.installSection(ctx, NS, Config, config, {
      setSource: (current) => { source = current },
      // The engine reads the source at each decision point, so a committed
      // change needs no rebuild here.
      onChange: () => {},
    })
  })
}
