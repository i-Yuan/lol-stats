import { test, expect } from '@playwright/test'
async function openDetail(page,query=""){
 await page.goto('/tests/ui/'+query)
 await page.getByRole('button',{name:'刷新',exact:true}).first().click()
 await page.locator('.record-row.interactive').first().click()
 await expect(page.locator('.overview-panel .detail-row')).toHaveCount(10)
}
for(const [width,height] of [[1363,836],[1040,680],[1920,1080]]){
 test(`actual App detail layout ${width}x${height}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height});await openDetail(page)
  const problems=await page.locator('.overview-panel').evaluate(panel=>{
   const errors=[]
   for(const team of panel.querySelectorAll('.team-block')){
    const head=team.querySelector('.team-header'), row=team.querySelector('.detail-row')
    const headerStats=[...head.children].slice(-6),rowStats=[...row.children].slice(-6)
    headerStats.forEach((el,i)=>{if(Math.abs(el.getBoundingClientRect().x-rowStats[i].getBoundingClientRect().x)>1)errors.push('header misaligned')})
    for(const r of team.querySelectorAll('.detail-row')){
     const box=r.getBoundingClientRect()
     for(const el of r.querySelectorAll('.augment-tag,.build-share')){
      const b=el.getBoundingClientRect();if(b.bottom>box.bottom||b.top<box.top)errors.push('row crops content')
      if(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)errors.push('tag clipped')
     }
    }
   }
   if(document.documentElement.scrollWidth>innerWidth)errors.push('whole page overflows')
   return errors
  })
  expect(problems).toEqual([])
  await expect(page.locator('.detail-row').first().locator('.augment-tag')).toHaveCount(6)
  await page.screenshot({path:testInfo.outputPath('detail-left.png'),fullPage:true})
  const team=page.locator('.team-block').first()
  if(await team.evaluate(el=>el.scrollWidth>el.clientWidth)){
   await team.hover()
   await page.mouse.wheel(1400,0)
   await expect.poll(()=>team.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
  }
  await expect(team.locator('.score-cell').first()).toBeInViewport()
  await page.screenshot({path:testInfo.outputPath('detail-right.png'),fullPage:true})
  await page.locator('.workspace').evaluate(el=>el.scrollTop=el.scrollHeight)
  await expect(page.locator('.team-block').last().locator('.detail-row').last()).toBeInViewport()
  await page.screenshot({path:testInfo.outputPath('detail-bottom.png'),fullPage:true})
  await page.locator('.workspace').evaluate(el=>el.scrollTop=0)
  await team.evaluate(el=>el.scrollLeft=0)
  await page.locator('.build-share button').first().click()
  const dialog=page.getByRole('dialog',{name:'构筑分享预览'})
  await expect(dialog).toBeFocused()
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0)
  await expect(page.locator('.build-share button').first()).toBeFocused()
  await page.keyboard.press('Enter');await expect(dialog).toBeVisible()
  for(let i=0;i<6;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true)}
  await page.screenshot({path:testInfo.outputPath('share-modal.png'),fullPage:true})
  await dialog.getByRole('button',{name:'关闭',exact:true}).click()
  await page.locator('.overview-actions').getByRole('button',{name:'分享',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__copiedPng?.length||0)).toBeGreaterThan(100)
  expect(await page.evaluate(()=>window.__exportFits)).toBe(true)
  const png=await page.evaluate(()=>window.__copiedPng)
  await testInfo.attach('full-detail-export',{body:Buffer.from(png),contentType:'image/png'})
  const buffer=Buffer.from(png);expect(buffer.readUInt32BE(16)).toBeGreaterThanOrEqual(2302)
  await page.locator('.build-share button').first().click()
  // Simulate switching the active page (navigation is covered separately below).
  await page.locator('.side-nav button').filter({hasText:'当前角色'}).click({force:true})
  await expect(dialog).toHaveCount(0)
 })
}
test('detail navigation and repeated modal dismissal',async({page})=>{
 await openDetail(page)
 for(let i=0;i<3;i++){
  await page.locator('.build-share button').first().click()
  await page.locator('.build-overlay').click({position:{x:5,y:5}})
  await expect(page.locator('.build-overlay')).toHaveCount(0)
 }
 await page.locator('.detail-row').first().click()
 await expect(page.locator('.drill-tabs button')).toHaveCount(2)
 await page.getByRole('button',{name:'后退',exact:true}).click()
 await expect(page.locator('.overview-panel')).toBeVisible()
 await page.getByRole('button',{name:'前进',exact:true}).click()
 await expect(page.locator('.overview-panel')).toBeHidden()
})

test('realistic six-augment density at default window',async({page},testInfo)=>{
 await page.setViewportSize({width:1363,height:836});await openDetail(page,'?normal=1')
 await page.screenshot({path:testInfo.outputPath('realistic-detail.png'),fullPage:true})
 await expect(page.locator('.detail-row').first().locator('.augment-tag')).toHaveCount(6)
 const height=await page.locator('.detail-row').first().evaluate(el=>el.getBoundingClientRect().height)
 expect(height).toBeLessThan(130)
})
