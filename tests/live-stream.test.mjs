import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
const script=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
const ast=ts.createSourceFile('App.ts',script,ts.ScriptTarget.Latest,true)
const policyJs=ts.transpileModule(readFileSync(new URL('../src/liveRefreshPolicy.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {shouldAutoRefreshHistory}=await import('data:text/javascript;base64,'+Buffer.from(policyJs).toString('base64'))
const names=new Set(['refreshLiveGame','startLiveAutoRefresh','stopLiveAutoRefresh','createRequestId'])
const code=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function setup(){
 const result=deferred(),events=[],calls=[],ref=value=>({value});let unlistens=0
 const ctx=vm.createContext({Math,Date,activeLiveRequestId:'',liveRefreshTimer:1,LIVE_STATS_DEPTH:50,
  liveGame:ref(null),liveLoading:ref(false),liveRefreshing:ref(false),liveError:ref(''),
  observedLivePhase:'InProgress',livePhaseRefreshAttempts:0,activePage:ref('live'),LIVE_AUTO_REFRESH_MS:15000,shouldAutoRefreshHistory,
  window:{clearInterval(){},setInterval(fn){this.tick=fn;return 1}},navigateToPage(){},ensureClientReady:async()=>{},errorMessage:String,notifyError(){},
  listen:async(name,handler)=>{events.push(handler);return ()=>unlistens++},
  cancelStatsLoad:async()=>{},
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

test('production auto-refresh timer does not repeat in-game history after first load',async()=>{
 const t=setup();t.ctx.liveRefreshTimer=null;t.ctx.startLiveAutoRefresh();await tick()
 t.result.resolve({...snapshot('complete'),phase:'InProgress'});await tick()
 for(let i=0;i<100;i++)t.ctx.window.tick()
 await tick();assert.equal(t.calls.length,1)
 await t.ctx.refreshLiveGame({forceRefresh:true});assert.equal(t.calls.length,2);assert.equal(t.calls[1][2],true)
})

test('returning to the live page in-game does not automatically restart history',async()=>{
 const t=setup();t.ctx.liveGame.value={...snapshot('complete'),phase:'InProgress'};t.ctx.liveRefreshTimer=null
 t.ctx.startLiveAutoRefresh();await tick();assert.equal(t.calls.length,0)
})

test('gameflow includes selection, coalesces slow reads, and clears old roster on exit',async()=>{
 const functionNames=new Set(['checkGameflowForAutoLive','shouldAutoOpenLive'])
 const extra=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&functionNames.has(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const phases=script.match(/const AUTO_LIVE_PHASES = new Set\((\[[^\]]*\])/)[1]
 let reads=0,resolve
 const ctx=vm.createContext({missingGameflowReads:0,gameflowReadInFlight:false,compactDisposed:false,loadGameflowPhase:()=>{reads++;return new Promise(r=>resolve=r)},observedLivePhase:'InProgress',livePhaseRefreshAttempts:1,activeLiveRequestId:'old',liveGame:{value:{phase:'InProgress'}},liveLoading:{value:true},liveRefreshing:{value:true},liveError:{value:'old'},livePhase:{value:null},autoLiveSessionActive:true,LIVE_DATA_PHASES:new Set(['ChampSelect','InProgress']),cancelStatsLoad:async()=>{},checkAutoAccept(){},navigateToPage(){},refreshLiveGame:async()=>{}})
 vm.runInContext('const AUTO_LIVE_PHASES = new Set('+phases+');'+extra,ctx)
 assert.equal(ctx.shouldAutoOpenLive('ChampSelect'),true)
 const pending=ctx.checkGameflowForAutoLive();await ctx.checkGameflowForAutoLive();assert.equal(reads,1)
 resolve('Lobby');await pending;assert.equal(ctx.liveGame.value,null);assert.equal(ctx.activeLiveRequestId,'');assert.equal(ctx.livePhase.value,'Lobby');assert.equal(ctx.livePhaseRefreshAttempts,0)
})

test('reopening compact window reuses its handle and never starts another history query',async()=>{
 const functions=new Set(['openCompact'])
 const js=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&functions.has(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 let shows=0,publications=0,lookups=0
 const ctx=vm.createContext({compactOpening:{value:false},TauriWindow:{getByLabel:async()=>{lookups++;return{show:async()=>shows++,setFocus:async()=>{}}}},loadPlayerNotes:async()=>{},publishCompact:async()=>publications++,notifyError(){throw Error('Unexpected failure')}})
 vm.runInContext(js,ctx)
 const first=ctx.openCompact();await ctx.openCompact();await first;assert.equal(lookups,1)
 await ctx.openCompact();assert.equal(shows,2);assert.equal(publications,2);assert.equal(ctx.compactOpening.value,false)
})

test('leaving live page marks partial display interrupted instead of loading forever',()=>{
 const t=setup();t.ctx.activeLiveRequestId='pending';t.ctx.liveGame.value=snapshot('history')
 t.ctx.stopLiveAutoRefresh();assert.equal(t.ctx.liveGame.value.diagnostics.stage,'interrupted');assert.match(t.ctx.liveError.value,/刷新/)
})

test('one failed phase probe does not cause another history query after recovery',async()=>{
 const names=new Set(['checkGameflowForAutoLive','shouldAutoOpenLive'])
 const js=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 let phase=null,queries=0
 const ctx=vm.createContext({missingGameflowReads:0,gameflowReadInFlight:false,compactDisposed:false,loadGameflowPhase:async()=>phase,observedLivePhase:'InProgress',livePhaseRefreshAttempts:0,activeLiveRequestId:'',liveGame:{value:{phase:'InProgress'}},liveLoading:{value:false},liveRefreshing:{value:false},liveError:{value:''},livePhase:{value:'InProgress'},autoLiveSessionActive:true,LIVE_DATA_PHASES:new Set(['ChampSelect','InProgress']),AUTO_LIVE_PHASES:new Set(['ChampSelect','InProgress']),cancelStatsLoad:async()=>{},checkAutoAccept(){},navigateToPage(){},refreshLiveGame:async()=>queries++})
 vm.runInContext(js,ctx);await ctx.checkGameflowForAutoLive();assert.equal(ctx.livePhase.value,null);assert.ok(ctx.liveGame.value)
 phase='InProgress';await ctx.checkGameflowForAutoLive();assert.equal(queries,0);assert.equal(ctx.missingGameflowReads,0)
 phase=null;await ctx.checkGameflowForAutoLive();await ctx.checkGameflowForAutoLive();await ctx.checkGameflowForAutoLive();assert.equal(ctx.liveGame.value,null)
})


test('leaving live page sends cancellation for exactly the active backend request',()=>{
 const t=setup(), cancelled=[];t.ctx.cancelStatsLoad=async id=>cancelled.push(id);t.ctx.activeLiveRequestId='live-active';t.ctx.stopLiveAutoRefresh();t.ctx.stopLiveAutoRefresh();assert.deepEqual(cancelled,['live-active']);
})

test('selection-to-game transition resumes live view after visiting another page',async()=>{
 const names=new Set(['checkGameflowForAutoLive','shouldAutoOpenLive'])
 const js=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const cancelled=[],opened=[];let queries=0
 const ctx=vm.createContext({missingGameflowReads:0,gameflowReadInFlight:false,compactDisposed:false,loadGameflowPhase:async()=>'InProgress',observedLivePhase:'ChampSelect',livePhaseRefreshAttempts:4,activeLiveRequestId:'live-selection',liveGame:{value:{phase:'ChampSelect'}},liveLoading:{value:false},liveRefreshing:{value:true},liveError:{value:''},livePhase:{value:'ChampSelect'},autoLiveSessionActive:true,LIVE_DATA_PHASES:new Set(['ChampSelect','InProgress']),AUTO_LIVE_PHASES:new Set(['ChampSelect','InProgress']),cancelStatsLoad:async id=>cancelled.push(id),checkAutoAccept(){},navigateToPage:page=>opened.push(page),refreshLiveGame:async()=>queries++})
 vm.runInContext(js,ctx);await ctx.checkGameflowForAutoLive()
 assert.deepEqual(opened,['live']);assert.equal(queries,1);assert.deepEqual(cancelled,['live-selection']);assert.equal(ctx.liveGame.value,null)
 await ctx.checkGameflowForAutoLive();assert.equal(queries,1)
})
