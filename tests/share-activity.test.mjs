import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
function loadGuard() {
 const context = { exports: {} }
 vm.createContext(context)
 vm.runInContext(ts.transpileModule(read('shareGuard.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
 return context.exports.createShareGuard
}
test('export lease cannot revive after leaving and returning or data replacement', () => {
 let active = true
 const guard = loadGuard()(() => active)
 const pending = guard.capture()
 assert.equal(pending(), true)
 active = false; guard.invalidate()
 assert.equal(pending(), false)
 active = true; guard.invalidate()
 assert.equal(pending(), false)
 const next = guard.capture()
 assert.equal(next(), true)
 guard.invalidate() // source/filter identity changed during rendering
 assert.equal(next(), false)
 const final = guard.capture()
 guard.dispose()
 assert.equal(final(), false)
 assert.equal(guard.capture()(), false)
})
test('Vue guard synchronously invalidates activity/source changes and cached/unmounted views', () => {
 const source = read('useShareGuard.ts')
 assert.match(source, /watch\(\[active, \.\.\.sources\], guard.invalidate, \{ flush: 'sync', deep: true \}\)/)
 assert.match(source, /onDeactivated\(guard.invalidate\)/)
 assert.match(source, /onBeforeUnmount\(guard.dispose\)/)
})
test('record page visibility reaches recent and stats exporters', () => {
 const app = read('App.vue'), record = read('components/RecordView.vue')
 for (const page of ['current','search','details']) assert.ok(app.includes(`:active="activePage === '${page}'"`))
 assert.match(record, /<MatchHistoryPanel\s+:active="active !== false && activeTab === 'recent'"/)
 assert.match(record, /<StatsPanel\s+:active="active !== false && activeTab === 'stats'"/)
 assert.match(read('components/MatchHistoryPanel.vue'), /<RecentGamesShare :active="active"/)
 assert.match(read('components/PlayerRecordTab.vue'), /<RecordView\s+:active="active"/)
})
test('all non-detail exports pass current lease into final clipboard guard', () => {
 const recent = read('components/RecentGamesShare.vue')
 assert.match(recent, /const isCurrent=shareGuard.capture\(\)/)
 assert.match(recent, /shouldWrite:\(\)=>isCurrent\(\)&&opened.value&&snapshot.value===captured/)
 const stats = read('components/StatsPanel.vue')
 assert.equal((stats.match(/copyElementAsPng\(target, \{ shouldWrite \}\)/g)||[]).length,2)
 for (const file of ['ToolsPanel','HextechAugmentDesigner']) {
  const content = read(`components/${file}.vue`)
  assert.match(content, /const shouldWrite = \w+.capture\(\)/)
  assert.match(content, /copyElementAsPng\(captureRef.value, \{\s+shouldWrite,/)
 }
})
