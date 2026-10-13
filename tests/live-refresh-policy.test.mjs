import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const js=ts.transpileModule(readFileSync(new URL('../src/liveRefreshPolicy.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {shouldAutoRefreshHistory:p}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
test('in-game results remain stable even when cache TTL expires or result is partial',()=>{
 for(const stage of ['complete','interrupted']) assert.equal(p('InProgress',{phase:'InProgress',diagnostics:{stage}},100),false)
})
test('entering game loads new roster with bounded automatic attempts',()=>{
 assert.equal(p('InProgress',{phase:'ChampSelect'},0),true);assert.equal(p('InProgress',null,1),true);assert.equal(p('InProgress',null,2),false)
})
test('champion select refreshes while lobby and ended matches do not',()=>{
 assert.equal(p('ChampSelect',null,5),true);assert.equal(p('Lobby',{phase:'InProgress'},0),false);assert.equal(p('EndOfGame',{phase:'InProgress'},0),false)
})
