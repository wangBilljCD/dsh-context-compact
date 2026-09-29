/**
 * Client-half test: loads the browser bundle through a stubbed module loader,
 * registers the card on a stubbed slot table, and drives the card controller
 * against a stubbed settings scope.
 *
 * The card's only real dependency is React from the module table, so this runs
 * in plain Node with no browser and no profile install:
 *   node --test tests/client.test.mjs
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

/** Captured `window.__ModuleLoader__.load` handoff. */
const handoff = { id: undefined, factory: undefined }
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => {
      handoff.id = entry.id
      handoff.factory = entry.factory
    },
  },
}

await import('../lib/client.js')

/** The card's namespace, duplicated here so a rename cannot silently pass. */
const NS = 'context-compact'

/** Minimal React stand-in: elements become plain data. */
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
}

/**
 * Materialize the bundle's factory.
 * @returns the module exports the Loader would hand the runtime.
 */
function loadBundle() {
  const required = []
  const exported = handoff.factory((name) => {
    required.push(name)
    if (name === 'react') return react
    throw new Error(`unexpected external: ${name}`)
  })
  assert.deepEqual(required, ['react'])
  return exported
}

/**
 * Build a settings scope stub over one namespace section.
 * @param options - `user` seeds the overridden layer; `dropWrites` makes every
 * write a silent no-op, which is how the Host rejects a value.
 * @returns the scope stub plus its recorded writes.
 */
function makeScope(options = {}) {
  const base = { enabled: true, triggerPercent: 65, compactPercent: 25, maxTokens: 16384 }
  const writes = []
  let snapshot = {
    status: 'ready',
    value: { ...base, ...(options.user ?? {}) },
    base: { ...base },
    user: { ...(options.user ?? {}) },
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const listeners = new Set()
  const publish = () => { for (const listener of listeners) listener() }
  return {
    writes,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field, value) => {
      writes.push(['set', field, value])
      if (options.dropWrites === true) { publish(); return }
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        user: { ...snapshot.user, [field]: value },
        value: { ...snapshot.value, [field]: value },
      }
      publish()
    },
    unset: async (field) => {
      writes.push(['unset', field])
      if (options.dropWrites === true) { publish(); return }
      const user = { ...snapshot.user }
      delete user[field]
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        user,
        value: { ...snapshot.value, [field]: snapshot.base[field] },
      }
      publish()
    },
  }
}

/**
 * Run the bundle's apply against a stubbed browser context.
 * @param scope - the settings scope stub to bind.
 * @returns the registered slot entry and its inject face.
 */
function mountCard(scope) {
  const registered = []
  const effects = []
  const bound = []
  const ctx = {
    effect: (factory) => {
      effects.push(factory)
      return factory()
    },
    slots: {
      inject: (name, callback) => {
        assert.equal(name, 'settings.plugin.item')
        return callback()
      },
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      },
    },
    settingsScope: {
      bind: (spec) => {
        bound.push(spec)
        return scope
      },
    },
  }
  loadBundle().apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(bound.length, 1)
  return { entry: registered[0], spec: bound[0], effects }
}

/**
 * Let the card's queued writes settle. The injected `save` action is
 * fire-and-forget by design — the card publishes progress through its
 * observable instead of through a returned promise — so a test waits a couple
 * of macrotasks for the writes and the read-back.
 * @returns a promise resolved after the queue drains.
 */
async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

/** Find the first element of a type/class in a rendered tree. */function find(tree, predicate) {
  if (tree === null || typeof tree !== 'object') return undefined
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const hit = find(child, predicate)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (predicate(tree)) return tree
  return find(tree.children, predicate)
}

/**
 * Render the card with the given inject face and read its state.
 * @param component - the registered card component.
 * @param face - the inject face from the slot entry.
 * @returns `{ element, state }` after one render.
 */
function render(component, face) {
  const state = face.hooks.contextCompact.getSnapshot()
  const element = component({
    useContextCompact: (selector) => selector(state),
    edit: face.edit,
    resetField: face.resetField,
    toggleEnabled: face.toggleEnabled,
    save: face.save,
    discard: face.discard,
  })
  return { element, state }
}

test('the bundle registers the card under the shared namespace', () => {
  const scope = makeScope()
  const { entry, spec } = mountCard(scope)
  assert.equal(handoff.id, 'dsh-context-compact')
  assert.equal(spec.namespace, NS)
  assert.equal(entry.options.name, 'settings.plugin.item')
  assert.equal(entry.options.key, NS)
  assert.equal(entry.options.id, 'dsh-context-compact')
  assert.equal(typeof entry.component, 'function')
  const face = entry.options.inject()
  assert.equal(typeof face.hooks.contextCompact.getSnapshot, 'function')
  assert.equal(typeof face.hooks.contextCompact.subscribe, 'function')
})

test('the card renders the stored policy and stays clean until edited', () => {
  const scope = makeScope()
  const { entry } = mountCard(scope)
  const face = entry.options.inject()
  const { element, state } = render(entry.component, face)
  assert.equal(element.type, 'li')
  assert.equal(state.available, true)
  assert.equal(state.dirty, false)
  assert.equal(state.enabled.text, 'true')
  assert.equal(state.triggerPercent.text, '65')
  assert.equal(state.compactPercent.text, '25')
  const save = find(element, node => node.props.className === 'dsccc-save')
  assert.equal(save.props.disabled, true)
})

test('an out-of-range or non-numeric draft blocks the save', async () => {
  const scope = makeScope()
  const { entry } = mountCard(scope)
  const face = entry.options.inject()
  face.edit('triggerPercent', '250')
  let { element, state } = render(entry.component, face)
  assert.equal(state.dirty, true)
  assert.equal(state.invalid, true)
  assert.equal(state.triggerPercent.invalid, true)
  assert.equal(find(element, node => node.props.className === 'dsccc-save').props.disabled, true)
  face.save()
  await settle()
  assert.deepEqual(scope.writes, [])

  face.edit('triggerPercent', 'not a number')
  face.save()
  await settle()
  assert.deepEqual(scope.writes, [])
})

test('a save writes the staged value and clears the draft', async () => {
  const scope = makeScope()
  const { entry } = mountCard(scope)
  const face = entry.options.inject()
  face.edit('triggerPercent', '40')
  face.edit('compactPercent', '50')
  face.save()
  await settle()
  assert.deepEqual(scope.writes, [['set', 'triggerPercent', 40], ['set', 'compactPercent', 50]])
  const state = face.hooks.contextCompact.getSnapshot()
  assert.equal(state.dirty, false)
  assert.equal(state.failed, false)
  assert.equal(state.triggerPercent.overridden, true)
})

test('a rejected write keeps the draft and reports the failure', async () => {
  const scope = makeScope({ dropWrites: true })
  const { entry } = mountCard(scope)
  const face = entry.options.inject()
  face.edit('triggerPercent', '40')
  face.save()
  await settle()
  const state = face.hooks.contextCompact.getSnapshot()
  assert.equal(state.failed, true)
  assert.equal(state.dirty, true)
  assert.equal(state.triggerPercent.text, '40')
  face.discard()
  const after = face.hooks.contextCompact.getSnapshot()
  assert.equal(after.failed, false)
  assert.equal(after.dirty, false)
  assert.equal(after.triggerPercent.text, '65')
})

test('the switch and the reset gesture stage real writes', async () => {
  const scope = makeScope({ user: { triggerPercent: 40 } })
  const { entry } = mountCard(scope)
  const face = entry.options.inject()
  const before = face.hooks.contextCompact.getSnapshot()
  assert.equal(before.triggerPercent.overridden, true)
  assert.equal(before.triggerPercent.text, '40')

  face.toggleEnabled()
  const toggled = face.hooks.contextCompact.getSnapshot()
  assert.equal(toggled.enabled.text, 'false')
  face.resetField('triggerPercent')
  const reset = face.hooks.contextCompact.getSnapshot()
  assert.equal(reset.triggerPercent.text, '65')
  assert.equal(reset.triggerPercent.overridden, false)

  face.save()
  await settle()
  assert.deepEqual(scope.writes, [['set', 'enabled', false], ['unset', 'triggerPercent']])
})

test('an unwritable document disables the controls', () => {
  const scope = makeScope()
  const { entry } = mountCard(scope)
  const face = entry.options.inject()
  const state = { ...face.hooks.contextCompact.getSnapshot(), writable: false }
  const element = entry.component({
    useContextCompact: (selector) => selector(state),
    edit: face.edit,
    resetField: face.resetField,
    toggleEnabled: face.toggleEnabled,
    save: face.save,
    discard: face.discard,
  })
  const save = find(element, node => node.props.className === 'dsccc-save')
  assert.equal(save.props.disabled, true)
  assert.equal(find(element, node => node.props.className === 'dsccc-readOnly') !== undefined, true)
})
