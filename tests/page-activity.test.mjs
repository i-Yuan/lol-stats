import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../src/components/ToolsPanel.vue', import.meta.url), 'utf8')
test('tool children activity includes main page visibility', () => {
  assert.match(app, /<ToolsPanel\s+:active="activePage === 'tools'"/)
  assert.match(tools, /:active="active && activeTab === 'friends'"/)
  assert.match(tools, /:active="active && activeTab === 'reserved'"/)
  assert.match(tools, /watch\(\(\) => props.active,[\s\S]*?saveDialogOpen.value = false[\s\S]*?endDrag\(\)/)
})
function setupKeyboard() {
  const source = app.slice(app.indexOf('function handleSettingsKeydown('), app.indexOf('const shareSettings ='))
  const state = { activeElement: null }
  const make = () => ({ getClientRects: () => [1], focus() { state.activeElement = this } })
  const first = make(), last = make(), hidden = { ...make(), getClientRects: () => [] }
  const modal = { querySelectorAll: () => [first, hidden, last] }
  const settingsOpen = { value: true }
  const context = { document: state, settingsModalRef: { value: modal }, settingsOpen }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { state, first, last, modal, settingsOpen, key(key, shiftKey = false) { let prevented = false; context.handleSettingsKeydown({ key, shiftKey, preventDefault() { prevented = true } }); return prevented } }
}
test('settings Escape dismisses and modal Tab wraps visible controls', () => {
  const t = setupKeyboard()
  t.state.activeElement = t.modal
  assert.equal(t.key('Tab'), true); assert.equal(t.state.activeElement, t.first)
  t.state.activeElement = t.last
  assert.equal(t.key('Tab'), true); assert.equal(t.state.activeElement, t.first)
  assert.equal(t.key('Tab', true), true); assert.equal(t.state.activeElement, t.last)
  assert.equal(t.key('Escape'), true); assert.equal(t.settingsOpen.value, false)
})
test('settings has accessible focus target and bounded scroll height', () => {
  assert.match(app, /role="dialog" aria-modal="true" aria-label="软件设置" tabindex="-1"/)
  assert.match(app, /if \(settingsOpen.value\) settingsModalRef.value\?\.focus\(\)/)
  assert.match(app, /settingsReturnFocus.focus\(\)/)
  assert.match(app, /max-height: calc\(100vh - 32px\);\s+overflow-y: auto;/)
})

test('date picker click agrees with focus-open instead of toggling it closed', () => {
 const record = readFileSync(new URL('../src/components/RecordView.vue', import.meta.url), 'utf8')
 assert.match(record, /class="stats-date-trigger" @click="openStatsDatePicker"/)
 assert.doesNotMatch(record, /toggleStatsDatePicker/)
})
