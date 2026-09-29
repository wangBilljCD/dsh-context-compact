/*
 * dsh-context-compact — browser half.
 *
 * Registers one card into `settings.plugin.item` keyed by the `context-compact`
 * settings namespace. The configurable-plugins tab dispatches a card only for a
 * namespace the Host serves, so this half, the Host namespace registration, and
 * the row in `cordis.patch.yml` are three halves of one feature.
 *
 * The bundle is the Loader's lazy-CJS factory artifact: executing this file
 * only registers a factory; the body runs when the module is materialized. Only
 * React comes from the module table — the card talks to settings through the
 * `settingsScope` service, so it needs no private UI package and no bridge.
 */
window.__ModuleLoader__.load({
  id: 'dsh-context-compact',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')

    const NS = 'context-compact'
    const STYLE_ATTR = 'data-dsh-context-compact'

    const CSS = `
.dsccc-card{list-style:none;border:.5px solid var(--dsw-alias-border-l4);border-radius:16px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}
.dsccc-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dsccc-card:focus-within{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dsccc-header{display:flex;align-items:center;gap:12px;padding:14px 16px}
.dsccc-headText{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsccc-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.dsccc-description{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsccc-pending{flex:none;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsccc-body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px}
.dsccc-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.dsccc-field+.dsccc-field{border-top:.5px solid var(--dsw-alias-border-l2)}
.dsccc-fieldHead{display:flex;align-items:center;gap:8px}
.dsccc-label{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.dsccc-badges{display:inline-flex;align-items:center;gap:8px}
.dsccc-overridden{font-size:11px;line-height:1.5;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dsccc-reset{border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsccc-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dsccc-reset:disabled{cursor:default}
.dsccc-input{height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.dsccc-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsccc-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dsccc-inputInvalid{border-color:var(--dsw-alias-label-error)}
.dsccc-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsccc-invalid{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
.dsccc-switchRow{display:flex;align-items:center;gap:10px}
.dsccc-switch{flex:none;width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsccc-switch:disabled{cursor:default}
.dsccc-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 14px;border-top:.5px solid var(--dsw-alias-border-l2)}
.dsccc-failed{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
.dsccc-readOnly{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsccc-discard,.dsccc-save{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.dsccc-discard{border-color:var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
.dsccc-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.dsccc-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dsccc-discard:disabled,.dsccc-save:disabled{opacity:.4;cursor:default}
.dsccc-discard:focus-visible,.dsccc-save:focus-visible,.dsccc-reset:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
`

    /** Card copy. The card owns its own text; it is not part of the section's dictionary. */
    const COPY = {
      zh: {
        title: '上下文压缩',
        description: '达到阈值后，把最旧的上下文压缩成一条摘要；对所有会话生效。',
        enable: '启用自动压缩',
        enableHint: '关闭后交回 Harness 内置策略（占用 80% 触发，保留最近 16%）。',
        trigger: '压缩阈值（%）',
        triggerHint: '聊天输入框右下角的上下文占用达到该百分比时触发。',
        compact: '旧上下文压缩比（%）',
        compactHint: '每次从最旧一端压缩掉可压缩区间的百分比。',
        save: '保存',
        saving: '保存中…',
        discard: '放弃修改',
        unsaved: '未保存',
        overridden: '已覆盖',
        reset: '恢复默认',
        readOnly: '当前设置文档只读，改动无法保存。',
        failed: '保存失败：宿主未接受该值，草稿已保留。',
        invalid: '请输入范围内的整数。',
        unavailable: '设置服务不可用。',
      },
      en: {
        title: 'Context compaction',
        description: 'Summarizes the oldest context once occupancy crosses the threshold; applies to every session.',
        enable: 'Enable automatic compaction',
        enableHint: 'Off falls back to the built-in policy (fires at 80% occupancy, keeps the newest 16%).',
        trigger: 'Trigger threshold (%)',
        triggerHint: 'Fires when the context meter at the bottom right of the chat input reaches this percentage.',
        compact: 'Old-context ratio (%)',
        compactHint: 'Share of the compactable span summarized per pass, taken from the oldest end.',
        save: 'Save',
        saving: 'Saving…',
        discard: 'Discard',
        unsaved: 'Unsaved',
        overridden: 'Overridden',
        reset: 'Reset',
        readOnly: 'The settings document is read-only; changes cannot be saved.',
        failed: 'Save failed: the Host rejected the value; drafts were kept.',
        invalid: 'Enter a whole number inside the allowed range.',
        unavailable: 'The settings service is unavailable.',
      },
    }

    /**
     * Pick the card's copy by browser language.
     * @returns the dictionary for the current locale.
     */
    function copy() {
      const language = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
      return language.toLowerCase().startsWith('zh') ? COPY.zh : COPY.en
    }

    /** The three editable fields, with the bounds the Host schema enforces. */
    const FIELDS = {
      enabled: { kind: 'boolean' },
      triggerPercent: { kind: 'number', min: 1, max: 100 },
      compactPercent: { kind: 'number', min: 1, max: 99 },
    }

    /**
     * Render one stored value as draft text.
     * @param spec - the field's kind.
     * @param value - stored value, possibly undefined.
     * @returns draft text; empty when the section carries nothing.
     */
    function format(spec, value) {
      if (spec.kind === 'boolean') return value === false ? 'false' : 'true'
      return typeof value === 'number' ? String(value) : ''
    }

    /**
     * Convert draft text into the write it stages.
     * @param spec - the field's kind and bounds.
     * @param text - draft text.
     * @returns a set/clear write, or undefined when the text is not accepted.
     */
    function parse(spec, text) {
      const trimmed = text.trim()
      if (spec.kind === 'boolean') {
        if (trimmed === 'true') return { kind: 'set', value: true }
        if (trimmed === 'false') return { kind: 'set', value: false }
        return undefined
      }
      if (trimmed === '') return { kind: 'clear' }
      const number = Number(trimmed)
      if (!Number.isFinite(number) || !Number.isInteger(number)) return undefined
      if (number < spec.min || number > spec.max) return undefined
      return { kind: 'set', value: number }
    }

    /**
     * Build a minimal snapshot source for the renderer's selector hook.
     * @param initial - first published snapshot.
     * @returns an observable with `getSnapshot`/`subscribe`/`set`.
     */
    function createStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          snapshot = next
          for (const listener of listeners) listener()
        },
      }
    }

    /**
     * Stage one card's edits over the `context-compact` namespace and write
     * them when the user saves.
     *
     * The Host is the only authority on whether a value landed, so a save reads
     * the result back out of the user layer instead of predicting it; a save
     * that did not land keeps its drafts so the user can correct them.
     */
    class ContextCompactCardController {
      /** @param scope - the bound settings scope for this namespace. */
      constructor(scope) {
        this.scope = scope
        this.staged = new Map()
        this.saving = false
        this.failed = false
        this.store = createStore(null)
        this.publish()
        scope.subscribe(() => { this.publish() })
      }

      /**
       * Build the face this card's slot entry injects.
       * @returns the observable source and the card's actions.
       */
      face() {
        return {
          hooks: { contextCompact: this.store },
          edit: (field, text) => { this.stage(field, { kind: 'set', text }) },
          resetField: (field) => { this.stage(field, { kind: 'clear' }) },
          toggleEnabled: () => {
            const current = this.effective('enabled') !== false
            this.stage('enabled', { kind: 'set', text: String(!current) })
          },
          save: () => { void this.save() },
          discard: () => {
            if (this.staged.size === 0 && !this.failed) return
            this.staged.clear()
            this.failed = false
            this.publish()
          },
        }
      }

      /**
       * Publish the card's state: the scope snapshot folded with local drafts.
       */
      publish() {
        const snapshot = this.scope.getSnapshot()
        const user = isObject(snapshot.user) ? snapshot.user : {}
        const value = isObject(snapshot.value) ? snapshot.value : {}
        const base = isObject(snapshot.base) ? snapshot.base : {}
        const fields = {}
        let invalid = false
        for (const field of Object.keys(FIELDS)) {
          const spec = FIELDS[field]
          const staged = this.staged.get(field)
          if (staged === undefined) {
            fields[field] = {
              text: format(spec, value[field]),
              overridden: hasOwn(user, field),
              invalid: false,
            }
            continue
          }
          if (staged.kind === 'clear') {
            fields[field] = { text: format(spec, base[field]), overridden: false, invalid: false }
            continue
          }
          const write = parse(spec, staged.text)
          if (write === undefined) invalid = true
          fields[field] = {
            text: staged.text,
            overridden: write !== undefined && write.kind === 'set',
            invalid: write === undefined,
          }
        }
        this.store.set({
          available: snapshot.status === 'ready',
          writable: snapshot.writable,
          dirty: this.staged.size > 0,
          invalid,
          saving: this.saving,
          failed: this.failed,
          enabled: fields.enabled,
          triggerPercent: fields.triggerPercent,
          compactPercent: fields.compactPercent,
        })
      }

      /**
       * Read one field's effective (resolved) value.
       * @param field - field name inside the namespace section.
       * @returns the resolved value, or undefined.
       */
      effective(field) {
        const value = this.scope.getSnapshot().value
        return isObject(value) ? value[field] : undefined
      }

      /**
       * Whether the user layer carries a field, which is what marks it overridden.
       * @param field - field name inside the namespace section.
       * @returns true when the user document holds the field.
       */
      stored(field) {
        const user = this.scope.getSnapshot().user
        return isObject(user) && hasOwn(user, field)
      }

      /**
       * Stage one edit and re-publish.
       * @param field - field name inside the namespace section.
       * @param edit - the staged write.
       */
      stage(field, edit) {
        this.staged.set(field, edit)
        this.failed = false
        this.publish()
      }

      /**
       * Every write a save would perform, in the order the fields were staged.
       * A draft the field does not accept carries no write, which blocks the save.
       * @returns planned writes; `run` is undefined for a blocked draft.
       */
      plan() {
        const plan = []
        for (const [field, staged] of this.staged) {
          if (staged.kind === 'clear') {
            if (this.stored(field)) plan.push({ field, run: () => this.clear(field) })
            continue
          }
          const write = parse(FIELDS[field], staged.text)
          if (write === undefined) {
            plan.push({ field, run: undefined })
            continue
          }
          if (write.kind === 'clear') {
            plan.push({ field, run: () => this.clear(field) })
            continue
          }
          if (write.value === this.effective(field)) continue
          plan.push({ field, run: () => this.writeField(field, write.value) })
        }
        return plan
      }

      /**
       * Clear one field so it re-inherits the composition layer.
       * @param field - field name inside the namespace section.
       * @returns whether the user layer no longer carries the field.
       */
      async clear(field) {
        await this.scope.unset(field)
        return !this.stored(field)
      }

      /**
       * Write one field and confirm it from the user layer.
       * @param field - field name inside the namespace section.
       * @param value - the value to store.
       * @returns whether the stored user layer carries exactly this value.
       */
      async writeField(field, value) {
        await this.scope.set(field, value)
        const user = this.scope.getSnapshot().user
        return isObject(user) && user[field] === value
      }

      /**
       * Write every staged edit, then re-seed from what the Host accepted.
       * @returns settlement after every write and the read-back.
       */
      async save() {
        const plan = this.plan()
        const writes = plan.filter(item => item.run !== undefined).map(item => item.run)
        if (plan.length === 0 || this.saving || writes.length !== plan.length) return
        this.saving = true
        this.failed = false
        this.publish()
        let landed = true
        for (const write of writes) landed = await write() && landed
        if (landed) this.staged.clear()
        this.saving = false
        this.failed = !landed
        this.publish()
      }
    }

    /**
     * Whether a value is a plain record.
     * @param value - candidate value.
     * @returns true for a non-null object.
     */
    function isObject(value) {
      return typeof value === 'object' && value !== null
    }

    /**
     * Own-property test that does not consult the prototype chain.
     * @param target - record to read.
     * @param key - property name.
     * @returns true when the record carries the property as its own data.
     */
    function hasOwn(target, key) {
      return Object.prototype.hasOwnProperty.call(target, key)
    }

    /**
     * Render one labelled field with its override badge and reset control.
     * @param props - copy, state, and the staging callbacks.
     * @returns the field element.
     */
    function NumberField(props) {
      const { t, state, id, label, hint, disabled, onEdit, onReset } = props
      return React.createElement(
        'div',
        { className: 'dsccc-field' },
        React.createElement(
          'div',
          { className: 'dsccc-fieldHead' },
          React.createElement('label', { className: 'dsccc-label', htmlFor: id }, label),
          state.overridden
            ? React.createElement(
              'span',
              { className: 'dsccc-badges' },
              React.createElement('span', { className: 'dsccc-overridden' }, t.overridden),
              React.createElement(
                'button',
                { type: 'button', className: 'dsccc-reset', disabled, onClick: onReset },
                t.reset,
              ),
            )
            : null,
        ),
        React.createElement('input', {
          id,
          className: state.invalid ? 'dsccc-input dsccc-inputInvalid' : 'dsccc-input',
          type: 'text',
          inputMode: 'numeric',
          'aria-invalid': state.invalid ? true : undefined,
          value: state.text,
          disabled,
          onChange: event => { onEdit(event.target.value) },
        }),
        React.createElement(
          'p',
          { className: state.invalid ? 'dsccc-invalid' : 'dsccc-hint' },
          state.invalid ? t.invalid : hint,
        ),
      )
    }

    /**
     * Render the card.
     * @param props - the bound snapshot and the card's actions.
     * @returns the card element.
     */
    function ContextCompactCard(props) {
      const t = copy()
      const state = props.useContextCompact(snapshot => snapshot)
      if (state === null || !state.available) return null
      const disabled = !state.writable
      const blocked = !state.dirty || state.invalid || state.saving
      return React.createElement(
        'li',
        { className: 'dsccc-card' },
        React.createElement(
          'div',
          { className: 'dsccc-header' },
          React.createElement(
            'span',
            { className: 'dsccc-headText' },
            React.createElement('span', { className: 'dsccc-name' }, t.title),
            React.createElement('span', { className: 'dsccc-description' }, t.description),
          ),
          state.dirty ? React.createElement('span', { className: 'dsccc-pending' }, t.unsaved) : null,
        ),
        React.createElement(
          'div',
          { className: 'dsccc-body' },
          React.createElement(
            'div',
            { className: 'dsccc-field' },
            React.createElement(
              'div',
              { className: 'dsccc-switchRow' },
              React.createElement('input', {
                id: 'dsh-context-compact-enabled',
                className: 'dsccc-switch',
                type: 'checkbox',
                checked: state.enabled.text === 'true',
                disabled,
                onChange: () => { props.toggleEnabled() },
              }),
              React.createElement(
                'label',
                { className: 'dsccc-label', htmlFor: 'dsh-context-compact-enabled' },
                t.enable,
              ),
              state.enabled.overridden
                ? React.createElement(
                  'span',
                  { className: 'dsccc-badges' },
                  React.createElement('span', { className: 'dsccc-overridden' }, t.overridden),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'dsccc-reset',
                      disabled,
                      onClick: () => { props.resetField('enabled') },
                    },
                    t.reset,
                  ),
                )
                : null,
            ),
            React.createElement('p', { className: 'dsccc-hint' }, t.enableHint),
          ),
          NumberField({
            t,
            state: state.triggerPercent,
            id: 'dsh-context-compact-trigger',
            label: t.trigger,
            hint: t.triggerHint,
            disabled,
            onEdit: text => { props.edit('triggerPercent', text) },
            onReset: () => { props.resetField('triggerPercent') },
          }),
          NumberField({
            t,
            state: state.compactPercent,
            id: 'dsh-context-compact-compact',
            label: t.compact,
            hint: t.compactHint,
            disabled,
            onEdit: text => { props.edit('compactPercent', text) },
            onReset: () => { props.resetField('compactPercent') },
          }),
          React.createElement(
            'div',
            { className: 'dsccc-footer' },
            !state.writable ? React.createElement('p', { className: 'dsccc-readOnly' }, t.readOnly) : null,
            state.failed ? React.createElement('p', { className: 'dsccc-failed' }, t.failed) : null,
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'dsccc-discard',
                disabled: !state.dirty || state.saving,
                onClick: () => { props.discard() },
              },
              t.discard,
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'dsccc-save',
                disabled: blocked,
                onClick: () => { props.save() },
              },
              t.saving ? t.saving : t.save,
            ),
          ),
        ),
      )
    }

    /** Services this browser half needs before it can register its card. */
    const inject = ['slots', 'settingsScope']

    /**
     * Install the card's stylesheet once, and remove it when the plugin unloads.
     * @returns the disposer.
     */
    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const existing = document.querySelector('style[' + STYLE_ATTR + ']')
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.setAttribute(STYLE_ATTR, '')
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }

    /**
     * Bind the namespace scope and contribute the card.
     * @param ctx - the browser-side Cordis context.
     */
    function apply(ctx) {
      ctx.effect(installStyles, 'context-compact: card styles')
      const controller = new ContextCompactCardController(ctx.settingsScope.bind({ namespace: NS }))
      const face = controller.face()
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: NS,
        id: 'dsh-context-compact',
        inject: () => face,
      }, ContextCompactCard))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
