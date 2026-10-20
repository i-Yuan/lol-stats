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
const recent=loadTs('../src/recentInsights.ts');const insights=loadTs('../src/hexInsights.ts',()=>recent)
const source=readFileSync(new URL('../src/components/BuildShare.vue',import.meta.url),'utf8')
const script=compileScript(parse(source).descriptor,{id:'share-test'})
const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const node=()=>({children:[]})
const renderer=createRenderer({createElement:node,createText:node,createComment:node,setText(){},setElementText(){},parentNode(){return null},nextSibling(){return null},insert(n,p){p?.children?.push(n)},remove(){},patchProp(){}})
function setup(){
 let calls=0,finish,shouldWrite;const notices=[];const module={exports:{}}
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console})(id=>{
  if(id==='../hexInsights')return insights
  if(id==='../imageShare')return {copyElementAsPng:(_element,options)=>{shouldWrite=options.shouldWrite;calls++;return new Promise(resolve=>finish=resolve)}}
  if(id==='../notifications')return {notifyKey:'notify'}
  if(id==='../utils')return {championName:(_map,id)=>`英雄 ${id}`}
  return require(id)
 },module,module.exports)
 const component=module.exports.default;component.render=()=>null
 const stats={gameId:1,championId:1,queueId:2400,gameCreation:1000,itemIds:[1],augmentIds:[1,2,3,4,5,6],win:true,kills:1,deaths:2,assists:3}

 const vnode=h(component,{game:stats,champions:{},assets:{items:[],augments:[]},identity:"one",server:"TENCENT_HN1"});vnode.appContext={...renderer.createApp(component)._context,provides:{notify:n=>notices.push(n)}}
 const root=node();renderer.render(vnode,root);const state=vnode.component.setupState
 return {state,stats,notices,get calls(){return calls},finish:()=>finish?.(),instance:vnode.component,unmount:()=>renderer.render(null,root),canWrite:()=>shouldWrite?.()}
}

test('build preview is anonymous and freezes all six augments',()=>{
 const t=setup();t.state.open();t.stats.augmentIds.push(7)
 assert.equal(t.state.snapshot.augmentIds.length,6);assert.equal('identity' in t.state.snapshot,false)
})
test('build export gates repeat clicks and switching identity cancels write',async()=>{
 const t=setup();t.state.open();t.state.card={};const pending=t.state.copy()
 await new Promise(resolve=>setImmediate(resolve));await t.state.copy();assert.equal(t.calls,1)
 t.instance.props.identity='two';await nextTick();assert.equal(t.state.snapshot,null);assert.equal(t.canWrite(),false)
 t.finish();await pending;assert.equal(t.state.busy,false)
})
test('closing or unmounting invalidates a pending build export',async()=>{
 const t=setup();t.state.open();t.state.card={};const pending=t.state.copy()
 await new Promise(resolve=>setImmediate(resolve));t.unmount();assert.equal(t.canWrite(),false);t.finish();await pending
})

test('late asset refresh cannot change an already opened build preview',async()=>{
 const t=setup();t.state.open();const snap=t.state.snapshot
 assert.equal(snap.augmentLabels[0],'强化 1')
 t.instance.props.assets={items:[{id:1,name:'新版装备'}],augments:[{id:1,name:'新版强化'}]};await nextTick()
 assert.equal(t.state.snapshot,snap);assert.equal(snap.augmentLabels[0],'强化 1');assert.equal(snap.itemLabels[0],'装备 1')
 t.state.open();assert.equal(t.state.snapshot.augmentLabels[0],'新版强化')
})

test('leaving details hides the teleported preview and invalidates its pending copy',async()=>{
 const t=setup();t.state.open();t.state.card={};const pending=t.state.copy()
 await new Promise(resolve=>setImmediate(resolve));assert.equal(t.canWrite(),true)
 t.instance.props.active=false;await nextTick()
 assert.equal(t.state.snapshot,null);assert.equal(t.canWrite(),false)
 t.state.open();assert.equal(t.state.snapshot,null)
 t.finish();await pending
})
