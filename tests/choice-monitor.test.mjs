import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const code=ts.transpileModule(readFileSync(new URL('../src/choiceMonitor.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const m={exports:{}};vm.runInNewContext('(function(module,exports){'+code+'})',{})(m,m.exports)
const {createChoiceMonitor}=m.exports
function setup(){let resolve,reject,reads=0,key='account-a';const published=[];const monitor=createChoiceMonitor(()=>{reads++;return new Promise((yes,no)=>{resolve=yes;reject=no})},()=>key,(...v)=>published.push(v));monitor.start();return{monitor,published,get reads(){return reads},resolve:v=>resolve(v),reject:()=>reject(Error('network')),scope:v=>key=v}}
test('slow reads never overlap or start history work',async()=>{const t=setup();const pending=t.monitor.tick();await t.monitor.tick();await t.monitor.tick();assert.equal(t.reads,1);t.resolve({championId:1});await pending;assert.equal(t.published.length,1)})
test('stop during initial read does not publish or restart monitoring',async()=>{const t=setup();const pending=t.monitor.tick();t.monitor.stop();t.resolve({championId:1});await pending;await t.monitor.tick();assert.equal(t.published.length,0);assert.equal(t.reads,1)})
test('account changes discard late results',async()=>{const t=setup();const pending=t.monitor.tick();t.scope('account-b');t.resolve({championId:1});await pending;assert.equal(t.published.length,0)})
test('stop and restart cannot resurrect previous generations',async()=>{const t=setup();const pending=t.monitor.tick();t.monitor.stop();t.monitor.start();t.resolve({championId:1});await pending;assert.equal(t.published.length,0);const next=t.monitor.tick();t.resolve({championId:2});await next;assert.equal(t.published[0][0].championId,2)})
test('failure clears obsolete choices and later reads can recover',async()=>{const t=setup();const a=t.monitor.tick();t.reject();await a;assert.equal(t.published[0][0],null);assert.match(t.published[0][1],/刷新失败/);const b=t.monitor.tick();t.resolve(null);await b;assert.equal(t.published[1][0],null);assert.equal(t.published[1][1],'')})
