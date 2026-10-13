import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'vue/compiler-sfc'
function template(name){return parse(readFileSync(new URL('../src/components/'+name+'.vue',import.meta.url),'utf8')).descriptor.template.content}
test('live roster precedes optional profiles, team averages and diagnostics',()=>{
 const t=template('LiveGamePanel')
 const roster=t.indexOf('class="roster-overview"')
 for(const marker of ['class="teams"','class="team-averages"','class="live-diagnostics"','<EncounterNotice'])assert.ok(roster<t.indexOf(marker),marker)
 assert.match(t,/<div class="teams" v-if="detailsOpen">/)
 assert.doesNotMatch(t,/<details[^>]*\sopen(?:\s|>)/)
 assert.match(t,/class="roster-signals"[\s\S]*sampleWarning\(view.player\)/)
 assert.match(t,/view.games.length \? statPercent/)
})
test('selection assistant only expands during selection and explanation is secondary',()=>{
 const t=template('LiveGamePanel'),c=template('ChampionChoicePanel')
 assert.match(t,/<ChampionChoicePanel v-if="[^\"]*ChampSelect/)
 assert.match(t,/<details v-else class="choice-entry">/)
 assert.ok(c.indexOf('class="choice-grid"')<c.indexOf('class="choice-help"'))
 assert.doesNotMatch(c,/<footer>/)
})
test('recent history keeps trend and ranked detail collapsed without hiding stale warning',()=>{
 const t=template('RecordView')
 assert.match(t,/<details class="record-secondary"[^>]*><summary>近期趋势/)
 assert.match(t,/<details class="record-secondary"[^>]*><summary>排位段位/)
 assert.match(t,/class="record-data-warning"/)
 assert.doesNotMatch(t,/<details class="record-secondary"[^>]*\sopen(?:\s|>)/)
})
