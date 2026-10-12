import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
const script=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
const ast=ts.createSourceFile('App.ts',script,ts.ScriptTarget.Latest,true)
const names=new Set(['refreshLiveGame','stopLiveAutoRefresh','createRequestId'])
const code=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function setup(){
 const result=deferred(),events=[],calls=[],ref=value=>({value});let unlistens=0
 const ctx=vm.createContext({Math,Date,activeLiveRequestId:'',liveRefreshTimer:1,LIVE_STATS_DEPTH:50,
  liveGame:ref(null),liveLoading:ref(false),liveRefreshing:ref(false),liveError:ref(''),
  window:{clearInterval(){}},navigateToPage(){},ensureClientReady:async()=>{},errorMessage:String,notifyError(){},
  listen:async(name,handler)=>{events.push(handler);return ()=>unlistens++},
  loadLiveGame:(...args)=>{calls.push(args);return result.promise}
 });vm.runInContext(code,ctx);return {ctx,result,events,calls,get unlistens(){return unlistens}}
}
const tick=()=>new Promise(r=>setImmediate(r))
const snapshot=stage=>({gameId:1,diagnostics:{stage},teams:[]})
test('roster displays before the slow history promise resolves',async()=>{
 const t=setup();const pending=t.ctx.refreshLiveGame();await tick();assert.equal(t.calls.length,1)
 t.events[0]({payload:{requestId:t.calls[0][1],snapshot:snapshot('roster')}})
 assert.equal(t.ctx.liveGame.value.diagnostics.stage,'roster');assert.equal(t.ctx.liveLoading.value,false);assert.equal(t.ctx.liveRefreshing.value,true)
 t.result.resolve(snapshot('complete'));await pending;assert.equal(t.ctx.liveRefreshing.value,false);assert.equal(t.unlistens,1)
})
test('wrong request events and a late response after navigation are discarded',async()=>{
 const t=setup();const pending=t.ctx.refreshLiveGame();await tick()
 t.events[0]({payload:{requestId:'old',snapshot:snapshot('roster')}});assert.equal(t.ctx.liveGame.value,null)
 t.ctx.stopLiveAutoRefresh();t.events[0]({payload:{requestId:t.calls[0][1],snapshot:snapshot('roster')}})
 t.result.resolve(snapshot('complete'));await pending;assert.equal(t.ctx.liveGame.value,null)
})
test('repeated requests are coalesced locally and force flag reaches backend',async()=>{
 const t=setup();const pending=t.ctx.refreshLiveGame({forceRefresh:true});await tick();await t.ctx.refreshLiveGame();assert.equal(t.calls.length,1);assert.equal(t.calls[0][2],true)
 t.result.resolve(snapshot('complete'));await pending
})
test('history failure preserves already displayed roster and releases listener',async()=>{
 const t=setup();const pending=t.ctx.refreshLiveGame();await tick();t.events[0]({payload:{requestId:t.calls[0][1],snapshot:snapshot('roster')}})
 t.result.reject(new Error('fixture failure'));await pending
 assert.equal(t.ctx.liveGame.value.diagnostics.stage,'interrupted');assert.match(t.ctx.liveError.value,/fixture failure/);assert.equal(t.ctx.liveRefreshing.value,false);assert.equal(t.unlistens,1)
})
