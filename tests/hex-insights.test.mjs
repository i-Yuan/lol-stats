import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(file,resolve){const m={exports:{}};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext('(function(require,module,exports){'+js+'})',{})(resolve,m,m.exports);return m.exports}
const recent=load('../src/recentInsights.ts',()=>({}))
const {championChoices,buildSnapshot,plainDescription}=load('../src/hexInsights.ts',()=>recent)
const game=(id,extra={})=>({gameId:id,championId:1,gameCreation:id*1000,gameDuration:900,queueId:2400,win:true,kills:2,deaths:1,assists:5,itemIds:[100],augmentIds:[1,2,3,4,5,6],...extra})
test('choices use only personal hex effective history and dedupe current/bench',()=>{
 const rows=championChoices([game(1),game(1),game(2,{queueId:450}),game(3,{gameDuration:60})],1,[1,2,2,0])
 assert.equal(rows.length,2);assert.equal(rows[0].summary.count,1);assert.equal(rows[0].current,true);assert.equal(rows[1].summary.winRate,null)
})
test('missing bench does not invent alternatives; latest outcomes are ordered',()=>{
 const rows=championChoices([game(1),game(2,{win:false})],1,null)
 assert.equal(rows.length,1);assert.deepEqual(Array.from(rows[0].recent),[false,true]);assert.equal(championChoices([],0,null).length,0)
})
test('build snapshot preserves six augments and strips identities with independent arrays',()=>{
 const input=game(1,{puuid:'private',note:'secret',teamPuuids:['private']});const snap=buildSnapshot(input)
 assert.equal(snap.augmentIds.length,6);assert.equal('puuid' in snap,false);assert.equal('note' in snap,false);assert.equal('teamPuuids' in snap,false)
 input.augmentIds.push(7);input.itemIds.push(200);assert.equal(snap.augmentIds.length,6);assert.equal(snap.itemIds.length,1)
})
test('descriptions are displayed as plain text rather than injected HTML',()=>{
 assert.equal(plainDescription('<b>效果</b><br>提升&nbsp;伤害'),'效果 提升 伤害')
})

test('zero wins is distinct from unavailable champion history',()=>{
 const rows=championChoices([game(1,{win:false})],1,[2])
 assert.equal(rows[0].summary.winRate,0);assert.equal(rows[1].summary.winRate,null)
})
test('changing the current champion recalculates personal results without borrowing old hero history',()=>{
 const games=[game(1),game(2,{championId:2,win:false})]
 const first=championChoices(games,1,[2]);const next=championChoices(games,2,[1])
 assert.equal(first[0].summary.winRate,1);assert.equal(next[0].id,2);assert.equal(next[0].summary.winRate,0)
})
