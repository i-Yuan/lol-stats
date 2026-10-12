import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const code=ts.transpileModule(readFileSync(new URL('../src/imageShare.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
function setup(){
 let complete,writes=0;const result=new Promise(resolve=>complete=resolve);const module={exports:{}}
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{document:{fonts:{ready:Promise.resolve()}},Uint8Array})(id=>id==='html-to-image'?{toBlob:()=>result}:{copyPngToClipboard:async()=>{writes++}},module,module.exports)
 return {...module.exports,complete,get writes(){return writes}}
}
const blob={arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}
test('an invalidated export never reaches clipboard IPC',async()=>{
 const t=setup();let active=true;const pending=t.copyElementAsPng({}, {shouldWrite:()=>active});active=false;t.complete(blob)
 await assert.rejects(pending,/未写入剪贴板/);assert.equal(t.writes,0)
})
test('an active export reaches the existing clipboard path once',async()=>{
 const t=setup();const pending=t.copyElementAsPng({}, {shouldWrite:()=>true});t.complete(blob);await pending;assert.equal(t.writes,1)
})
test('an empty rasterization result never reaches clipboard IPC',async()=>{
 const t=setup();const pending=t.copyElementAsPng({});t.complete(null);await assert.rejects(pending,/图片生成失败/);assert.equal(t.writes,0)
})
