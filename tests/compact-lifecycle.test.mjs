import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import {parse,compileScript} from 'vue/compiler-sfc'
import {createRenderer,h} from 'vue'
const require=createRequire(import.meta.url)
const src=readFileSync(new URL('../src/CompactApp.vue',import.meta.url),'utf8')
const compiled=compileScript(parse(src).descriptor,{id:'compact-test'})
const code=ts.transpileModule(compiled.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const node=()=>({children:[]})
const renderer=createRenderer({createElement:node,createText:node,createComment:node,setText(){},setElementText(){},parentNode(){return null},nextSibling(){return null},insert(n,p){p?.children?.push(n)},remove(){},patchProp(){}})
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function setup(){
 const events=new Map(),sent=[],calls=[],m={exports:{}};let cleanup=0
 const register=async(name,fn)=>{events.set(name,fn);return()=>{cleanup++;events.delete(name)}}
 const win={hide:async()=>calls.push('hide'),setAlwaysOnTop:async v=>calls.push(['pin',v]),center:async()=>calls.push('center'),setPosition:async()=>{},onCloseRequested:fn=>register('close',fn),onMoved:fn=>register('move',fn)}
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{console,localStorage:{getItem:()=>null,setItem(){}}})(id=>{
  if(id==='@tauri-apps/api/event')return{listen:register,emitTo:async(...args)=>sent.push(args)}
  if(id==='@tauri-apps/api/window')return{getCurrentWindow:()=>win,availableMonitors:async()=>[],PhysicalPosition:class{}}
  if(id==='./compactLive')return{positionVisible:()=>false}
  if(id==='./utils')return{phaseName:s=>s}
  if(id==='lucide-vue-next')return{}
  if(id==='vue')return require('vue')
  throw Error('Unexpected dependency (small window must not load history): '+id)
 },m,m.exports)
 const component=m.exports.default;component.render=()=>null;const vnode=h(component),root=node();renderer.render(vnode,root)
 return{state:vnode.component.setupState,events,sent,calls,get cleanup(){return cleanup},unmount:()=>renderer.render(null,root)}
}
test('small window asks for one snapshot and ignores older revisions without history API',async()=>{
 const t=setup();await tick();assert.deepEqual(t.sent,[['main','compact-ready']])
 const receive=t.events.get('compact-snapshot');receive({payload:{revision:4,teams:[{}]}});receive({payload:{revision:3,teams:[]}})
 assert.equal(t.state.snapshot.revision,4)
 receive({payload:{revision:5,phase:'Lobby',teams:[]}});assert.equal(t.state.snapshot.teams.length,0)
 t.unmount();assert.equal(t.events.size,0);assert.equal(t.cleanup,3)
})
test('native close hides instead of destroying; pin and return-main are explicit',async()=>{
 const t=setup();await tick();let prevented=false;t.events.get('close')({preventDefault(){prevented=true}});await tick()
 assert.equal(prevented,true);assert.ok(t.calls.includes('hide'))
 await t.state.pin();assert.equal(t.state.pinned,false);assert.deepEqual(t.calls.at(-1),['pin',false])
 await t.state.main();assert.deepEqual(t.sent.at(-1),['main','compact-open-main']);t.unmount()
})
test('unmount during asynchronous listener setup leaves no listeners or ready message',async()=>{
 const t=setup();t.unmount();await tick();assert.equal(t.events.size,0);assert.equal(t.sent.length,0)
})
