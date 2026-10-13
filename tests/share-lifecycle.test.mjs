import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import {parse,compileScript} from 'vue/compiler-sfc'
import {createRenderer,h,nextTick} from 'vue'
const require=createRequire(import.meta.url)
function loadTs(file,resolve){
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const module={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console})(resolve||require,module,module.exports);return module.exports
}
const insights=loadTs('../src/recentInsights.ts')
const source=readFileSync(new URL('../src/components/RecentGamesShare.vue',import.meta.url),'utf8')
const script=compileScript(parse(source).descriptor,{id:'share-test'})
const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const node=()=>({children:[]})
const renderer=createRenderer({createElement:node,createText:node,createComment:node,setText(){},setElementText(){},parentNode(){return null},nextSibling(){return null},insert(n,p){p?.children?.push(n)},remove(){},patchProp(){}})
function setup(){
 let calls=0,finish,shouldWrite;const notices=[];const module={exports:{}}
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console})(id=>{
  if(id==='../assetLoader')return {loadAssetDataUrl:async()=>''}
  if(id==='../recentInsights')return insights
  if(id==='./GameRecordList.vue')return {default:{render:()=>null}}
  if(id==='../imageShare')return {copyElementAsPng:(_element,options)=>{shouldWrite=options.shouldWrite;calls++;return new Promise(resolve=>finish=resolve)}}
  if(id==='../notifications')return {notifyKey:'notify'}
  if(id==='../utils')return {riotId:s=>s.gameName||'未知玩家'}
  return require(id)
 },module,module.exports)
 const component=module.exports.default;component.render=()=>null
 const stats={summoner:{puuid:'player-a',gameName:'A'},dataStatus:{source:'cache'},recentGames:[{gameId:1,gameCreation:1000,gameDuration:1000,queueId:420,win:true,itemIds:[],perkIds:[],augmentIds:[]}]}
 const vnode=h(component,{stats,champions:{},gameAssets:{items:[],augments:[],perks:[],summonerSpells:[]}});vnode.appContext={...renderer.createApp(component)._context,provides:{notify:n=>notices.push(n)}}
 renderer.render(vnode,node());const state=vnode.component.setupState
 return {state,stats,notices,get calls(){return calls},finish:()=>finish?.(),instance:vnode.component,canWrite:()=>shouldWrite?.()}
}
test('opening freezes the sample and defaults to anonymity on every reopen',()=>{
 const t=setup();t.state.open();t.stats.recentGames.push({gameId:2});assert.equal(t.state.rows.length,1)
 assert.equal(t.state.showName,false);t.state.showName=true;t.state.open();assert.equal(t.state.showName,false)
})
test('double copy is gated; completion restores controls',async()=>{
 const t=setup();t.state.open();t.state.card={};const a=t.state.copy();await nextTick();await new Promise(resolve=>setImmediate(resolve));const b=t.state.copy();assert.equal(t.calls,1);assert.equal(t.state.busy,true)
 t.finish();await Promise.all([a,b]);assert.equal(t.state.busy,false);assert.equal(t.notices[0].kind,'success')
})
test('switching player dismisses preview and clears named snapshot',async()=>{
 const t=setup();t.state.open();t.state.showName=true
 t.instance.props.stats={...t.stats,summoner:{puuid:'player-b',gameName:'B'}};await nextTick()
 assert.equal(t.state.opened,false);assert.equal(t.state.snapshot,null);assert.equal(t.state.showName,false)
})
test('a dismissed preview does not export and restores controls on failure',async()=>{
 const t=setup();t.state.open();t.state.card=null;await t.state.copy()
 assert.equal(t.calls,0);assert.equal(t.state.busy,false);assert.equal(t.notices[0].kind,'error')
})

test('busy reopen is ignored and player changes invalidate pending clipboard write',async()=>{
 const t=setup();t.state.open();const snapshot=t.state.snapshot;t.state.card={};const pending=t.state.copy()
 await new Promise(resolve=>setImmediate(resolve));assert.equal(t.canWrite(),true)
 t.state.open();assert.equal(t.state.snapshot,snapshot)
 t.instance.props.stats={...t.stats,dataStatus:{...t.stats.dataStatus,sgpServerId:'TENCENT_HN2'}}
 await nextTick();assert.equal(t.state.opened,false);assert.equal(t.canWrite(),false)
 t.finish();await pending
})

test('background refresh of the same identity keeps the frozen preview',async()=>{
 const t=setup();t.state.open();const snapshot=t.state.snapshot
 t.instance.props.stats={...t.stats,recentGames:[...t.stats.recentGames,{gameId:2}]};await nextTick()
 assert.equal(t.state.opened,true);assert.equal(t.state.snapshot,snapshot);assert.equal(t.state.rows.length,1)
})

test('list sharing freezes current filtered games and keeps visual equipment fields',()=>{
 const t=setup();t.instance.props.visibleGames=[{...t.stats.recentGames[0],itemIds:[1001],augmentIds:[1,2,3,4,5,6]}]
 t.state.open();assert.equal(t.state.listGames.length,1);assert.equal(t.state.listGames[0].itemIds[0],1001);assert.equal(t.state.listGames[0].augmentIds.length,6)
 t.instance.props.visibleGames=[];assert.equal(t.state.listGames.length,1)
})
