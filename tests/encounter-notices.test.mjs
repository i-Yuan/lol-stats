import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const js=ts.transpileModule(readFileSync(new URL('../src/encounterNotices.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {encounterNotices}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const id='abcdef12-1234-1234-1234-abcdef123456'
const note={sgpServerId:'TENCENT_HN1',puuid:id,displayName:'旧名',note:'test',favorite:true}
const game=(extra={})=>({sgpServerId:'TENCENT_HN1',teams:[{players:[{puuid:id,summoner:{gameName:'新名',tagLine:'123'}}]}],encounters:[],...extra})
test('renames keep note association but notes never imply an encounter',()=>{
 const rows=encounterNotices(game(),[note]);assert.equal(rows.length,1);assert.equal(rows[0].label,'新名#123');assert.equal(rows[0].encounter,undefined)
})
test('server and account identity prevent mismatches; unknown identity is not guessed',()=>{
 assert.equal(encounterNotices(game({sgpServerId:'TENCENT_HN2'}),[note]).length,0)
 assert.equal(encounterNotices(game({sgpServerId:undefined}),[note]).length,0)
 assert.equal(encounterNotices(game({observerPuuid:id}),[note]).length,0)
 assert.equal(encounterNotices(game({teams:[{players:[{puuid:'',summoner:{gameName:'旧名'}}]}]}),[note]).length,0)
})
test('duplicate and placeholder players do not duplicate notices',()=>{
 const g=game();g.teams[0].players.push({...g.teams[0].players[0],puuid:id.toUpperCase()});assert.equal(encounterNotices(g,[note]).length,1)
 g.teams[0].players.forEach(p=>p.isPlaceholder=true);assert.equal(encounterNotices(g,[note]).length,0)
})
test('previous co-play can be shown without a note',()=>{
 const rows=encounterNotices(game({encounters:[{puuid:id,previousGames:2,lastSeenAt:100}]}),[])
 assert.equal(rows[0].encounter.previousGames,2);assert.equal(rows[0].note,undefined)
 assert.equal(encounterNotices(game({encounters:[{puuid:id,previousGames:0,lastSeenAt:null}]}),[]).length,0)
})
