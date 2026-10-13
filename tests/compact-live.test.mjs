import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
function load(path,deps={}) {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const m={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'})',{})(id=>deps[id],m,m.exports);return m.exports
}
const insights=load('../src/recentInsights.ts')
const {compactSnapshot,positionVisible}=load('../src/compactLive.ts',{'./recentInsights':insights})
const {choiceStatus}=load('../src/choiceStatus.ts')
const game=()=>({phase:'InProgress',queueId:2400,sgpServerId:'TENCENT_HN1',diagnostics:{stage:'complete'},teams:[{name:'我方',side:'蓝色方',players:[{puuid:'player-a',championId:1,summoner:{gameName:'玩家',puuid:'secret'},stats:{recentGames:[{gameId:1,queueId:2400,gameDuration:900,gameCreation:1000,win:false,kills:1,deaths:1,assists:1},{gameId:2,queueId:450,gameDuration:900,gameCreation:1100,win:true,kills:9,deaths:1,assists:1}]}}]}]})
test('compact window keeps exact-queue zero-win samples and excludes identifiers/full histories',()=>{
 const data=compactSnapshot(game(),'InProgress',{1:{name:'英雄'}},[],5);const p=data.teams[0].players[0]
 assert.equal(p.count,1);assert.equal(p.winRate,0);assert.equal(p.champion,'英雄');assert.equal(data.revision,5);assert.equal(data.teams[0].side,'蓝色方')
 const json=JSON.stringify(data);assert.doesNotMatch(json,/puuid|secret|recentGames|player-a/)
})
test('disconnect, end of game and mismatched stage clear the compact roster',()=>{
 for(const phase of [null,'Lobby','EndOfGame','ChampSelect'])assert.equal(compactSnapshot(game(),phase,{},[],1).teams.length,0)
 assert.equal(compactSnapshot(null,'ChampSelect',{},[],1).teams.length,0)
})
test('notes stay scoped to server and player; unavailable data is not zero percent',()=>{
 const g=game();g.teams[0].players[0].stats=undefined
 let data=compactSnapshot(g,'InProgress',{},[{sgpServerId:'TENCENT_HN2',puuid:'player-a',note:'wrong server'}],1)
 assert.equal(data.teams[0].players[0].note,'');assert.equal(data.teams[0].players[0].winRate,null)
 data=compactSnapshot(g,'InProgress',{},[{sgpServerId:'tencent_hn1',puuid:'PLAYER-A',note:'正确备注',favorite:true}],2)
 assert.equal(data.teams[0].players[0].note,'正确备注')
})
test('selection assistant states explain unsupported queues and stale snapshots',()=>{
 assert.equal(choiceStatus(null,null).active,false)
 const g=game();g.phase='ChampSelect';assert.equal(choiceStatus(g,'ChampSelect').active,true)
 g.queueId=3270;assert.match(choiceStatus(g,'ChampSelect').detail,/3270/);assert.equal(choiceStatus(g,'ChampSelect').active,false)
 assert.equal(choiceStatus(g,'InProgress').title,'选人阶段已结束')
 assert.equal(choiceStatus(game(),'ChampSelect').title,'正在识别模式')
 assert.equal(choiceStatus(g,null).active,false)
})
test('restore position rejects offscreen, NaN and removed monitors',()=>{
 const monitors=[{workArea:{position:{x:0,y:0},size:{width:1920,height:1080}}}]
 assert.equal(positionVisible({x:100,y:100},monitors),true)
 for(const p of [{x:NaN,y:0},{x:3000,y:100},{x:1900,y:1050},{x:-100,y:0}])assert.equal(positionVisible(p,monitors),false)
})

test('interrupted compact snapshots explain manual recovery, not endless progress',()=>{
 const g=game();g.diagnostics.stage='interrupted';g.teams[0].players[0].stats=undefined
 const s=compactSnapshot(g,'InProgress',{},[],1)
 assert.match(s.status,/中断/);assert.equal(s.teams[0].players[0].state,'等待手动刷新')
})
