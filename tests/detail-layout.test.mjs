import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse} from 'vue/compiler-sfc'
import postcss from 'postcss'
const read=name=>readFileSync(new URL(`../src/components/${name}.vue`,import.meta.url),'utf8')
function declarations(source,selector){
 const css=postcss.parse(parse(source).descriptor.styles[0].content), result={}
 css.walkRules(rule=>{if(rule.selector.split(',').map(x=>x.trim()).includes(selector))rule.walkDecls(d=>result[d.prop]=d.value)})
 return result
}
test('overview rows grow for six full augments and the share action',()=>{
 const source=read('MatchOverviewPanel'), row=declarations(source,'.detail-row')
 assert.equal(row.height,'auto');assert.equal(row['max-height'],undefined)
 assert.equal(row.overflow,'visible')
 assert.match(source,/v-for="augmentId in player.augmentIds"/)
 assert.equal(declarations(source,'.champion-cell')['grid-template-columns'],'42px minmax(0, 1fr)')
})
test('overview headers and player rows have equal tracks and border insets',()=>{
 const source=read('MatchOverviewPanel'),header=declarations(source,'.team-header'),row=declarations(source,'.detail-row')
 assert.equal(header['grid-template-columns'],row['grid-template-columns'])
 assert.equal(header['border-left-width'],row['border-left-width'])
 assert.equal(row['min-width'],'1151px') // tracks 1091 + gaps 40 + padding 14 + borders 6
 assert.equal(header['min-width'],row['min-width'])
})
test('fallback match dialog does not crop six augments or drift its columns',()=>{
 const source=read('GameRecordList'),header=declarations(source,'.match-detail-team-header'),row=declarations(source,'.detail-row')
 assert.equal(row.height,'auto');assert.equal(row['max-height'],undefined)
 assert.equal(header['grid-template-columns'],row['grid-template-columns'])
 assert.equal(header['border-left-width'],'5px')
 assert.equal(header['min-width'],'1246px')
 assert.match(source,/v-for="augmentId in player.augmentIds"/)
 assert.equal(declarations(source,'.detail-record-list').overflow,'visible')
})
test('build preview is teleported outside hover-filtered rows and closed on hidden pages',()=>{
 const source=read('BuildShare')
 assert.match(source,/<Teleport to="body">[\s\S]*class="build-overlay"/)
 assert.match(source,/onDeactivated\(/)
 assert.match(source,/watch\(\(\)=>props.active/)
 assert.equal(declarations(source,'.build-overlay').position,'fixed')
})
