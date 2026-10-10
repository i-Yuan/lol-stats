import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual App.vue handlers with deferred IPC, not copied implementations.
const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const script = app.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
const ast = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true)
const names = new Set(['createRequestId', 'beginProgress', 'endProgress',
  'keepProgressVisible', 'cancelProgress', 'loadCurrentStats', 'loadSearchStats',
  'resetSearchRequests', 'isActiveProgress'])
const handlers = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text))
  .map(n => n.getText(ast)).join('\n')
const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const ref = value => ({ value })
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup() {
  const ready = deferred(), result = deferred(), calls = [], errors = []
  const ctx = vm.createContext({
    Date, Math, MIN_PROGRESS_VISIBLE_MS: 0, window: { setTimeout },
    progressOverlay: ref({ visible: false, requestId: '', cancelled: false }),
    currentFullStats: ref(null), currentStatsLoading: ref(false), currentError: ref(''), currentStatsDepth: ref(100),
    searchFullStats: ref(null), searchStatsLoading: ref(false), searchError: ref(''), searchStatsDepth: ref(100),
    searchEpoch: ref(0), activeSearchQuery: ref('player-a'), activeSearchServerId: ref('TENCENT_HN1'),
    searchRecentLoading: ref(false), searchCandidateRequestKey: '', searchCandidateLoading: ref(false),
    ensureClientReady: () => ready.promise,
    loadCurrentRanked: async () => {}, loadSearchRanked: async () => {},
    loadSelfStatsWithProgress: (...args) => { calls.push(args); return result.promise },
    searchPlayerWithProgress: (...args) => { calls.push(args); return result.promise },
    cancelStatsLoad: async () => {}, errorMessage: String,
    notifyError: (...args) => errors.push(args),
  })
  vm.runInContext(js, ctx)
  return { ctx, ready, result, calls, errors }
}

for (const handler of ['loadCurrentStats', 'loadSearchStats']) {
  test(`${handler}: cancellation while preparing prevents IPC from starting`, async () => {
    const h = setup()
    const pending = h.ctx[handler]()
    await h.ctx.cancelProgress()
    h.ready.resolve()
    h.result.resolve({ summoner: { puuid: 'player-a' } })
    await pending
    assert.equal(h.calls.length, 0)
    assert.equal(h.ctx.currentFullStats.value, null)
    assert.equal(h.ctx.searchFullStats.value, null)
  })
  test(`${handler}: an old response cannot use a newer progress dialog's cancellation state`, async () => {
    const h = setup()
    h.ready.resolve()
    const pending = h.ctx[handler]()
    await Promise.resolve()
    await h.ctx.cancelProgress()
    h.ctx.beginProgress('new-request', 100)
    h.result.resolve({ summoner: { puuid: 'player-a' } })
    await pending
    assert.equal(h.ctx.currentFullStats.value, null)
    assert.equal(h.ctx.searchFullStats.value, null)
    assert.equal(h.ctx.progressOverlay.value.visible, true)
    assert.equal(h.ctx.progressOverlay.value.requestId, 'new-request')
  })
  test(`${handler}: active result is applied`, async () => {
    const h = setup()
    h.ready.resolve()
    const pending = h.ctx[handler]()
    const result = { summoner: { puuid: 'player-a' } }
    h.result.resolve(result)
    await pending
    assert.equal(h.calls.length, 1)
    assert.equal(handler === 'loadCurrentStats' ? h.ctx.currentFullStats.value : h.ctx.searchFullStats.value, result)
  })
}

test('switching players during preparation does not start the old query', async () => {
  const h = setup()
  const pending = h.ctx.loadSearchStats()
  h.ctx.resetSearchRequests()
  h.ctx.activeSearchQuery.value = 'player-b'
  h.ready.resolve()
  h.result.resolve({ summoner: { puuid: 'player-a' } })
  await pending
  assert.equal(h.calls.length, 0)
  assert.equal(h.ctx.searchFullStats.value, null)
})
