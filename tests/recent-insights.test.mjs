import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../src/recentInsights.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {orderedGames,recentTrend,recentShareRows}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const game=(id,extra={})=>({gameId:id,gameCreation:id*1000,gameDuration:1200,queueId:420,championId:1,win:true,kills:5,deaths:2,assists:5,...extra})
test('hex aram trend cannot borrow normal aram or ranked samples',()=>{
 const games=Array.from({length:20},(_,i)=>game(i+1,{queueId:2400}))
 games.push(...Array.from({length:40},(_,i)=>game(i+21,{queueId:i%2?450:420,win:false})))
 const t=recentTrend(games,2400)
 assert.equal(t.current.count,20);assert.equal(t.current.winRate,1)
 assert.equal(t.previous.count,0);assert.equal(t.comparable,false);assert.equal(t.winRateDelta,null)
})
test('trend sorts, deduplicates and keeps queues separate',()=>{
 const games=Array.from({length:40},(_,i)=>game(i+1,{win:i>=20}));games.push(game(40),game(100,{queueId:440}))
 const t=recentTrend(games.reverse(),420)
 assert.equal(t.current.count,20);assert.equal(t.previous.count,20)
 assert.equal(t.current.oldestAt,21000);assert.equal(t.previous.newestAt,20000)
 assert.equal(t.winRateDelta,1);assert.equal(t.kdaDelta,0);assert.equal(t.comparable,true)
})
test('insufficient and empty samples do not fabricate a delta or zero performance',()=>{
 const t=recentTrend([game(1)],420);assert.equal(t.comparable,false);assert.equal(t.winRateDelta,null)
 assert.equal(t.previous.winRate,null);assert.equal(t.previous.kda,null)
 assert.equal(recentTrend([],420).current.count,0)
})
test('invalid game identities and short records are excluded',()=>{
 assert.equal(orderedGames([game(0),game(1,{gameDuration:479}),game(2,{gameCreation:NaN}),game(3)]).length,1)
})
test('zero deaths uses aggregate denominator one',()=>{
 assert.equal(recentTrend([game(1,{deaths:0}),game(2,{deaths:0})],420).current.kda,20)
})
test('share limits are bounded and fields explicitly exclude private identity',()=>{
 const games=Array.from({length:30},(_,i)=>game(i+1,{puuid:'secret-id',note:'private',tag:'private',teamPuuids:['other'],token:'secret'}))
 for(const [limit,expected] of [[5,5],[10,10],[20,20],[999,5]]){
   const rows=recentShareRows(games,limit);assert.equal(rows.length,expected);assert.equal(rows[0].gameId,30)
   assert.deepEqual(Object.keys(rows[0]).sort(),['gameId','championId','queueId','win','kills','deaths','assists','gameCreation','gameDuration'].sort())
 }
})
test('share input remains unchanged and duplicate rows cannot inflate results',()=>{
 const games=[game(1),game(3),game(3),game(2)];const before=JSON.stringify(games)
 assert.deepEqual(recentShareRows(games,5).map(g=>g.gameId),[3,2,1]);assert.equal(JSON.stringify(games),before)
})
