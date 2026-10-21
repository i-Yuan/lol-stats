import {test,expect} from '@playwright/test'
async function holdCanvas(page){
 await page.evaluate(()=>{
  window.__heldCanvas=[]
  const original=HTMLCanvasElement.prototype.toBlob
  HTMLCanvasElement.prototype.toBlob=function(callback,...args){original.call(this,blob=>window.__heldCanvas.push(()=>callback(blob)),...args)}
 })
}
async function pending(page){await expect.poll(()=>page.evaluate(()=>window.__heldCanvas.length)).toBeGreaterThan(0)}
async function release(page){await page.evaluate(()=>window.__heldCanvas.splice(0).forEach(fn=>fn()))}
async function switchPage(page,name){await page.locator('.side-nav').getByRole('button',{name,exact:true}).click()}
for(const kind of ['recent','statistics']){
 test(`${kind} export cannot copy after leaving and returning`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/tests/ui/?app=1')
  const view=page.locator('.record-view:visible').first()
  await expect(view.locator('.record-row')).toHaveCount(12)
  if(kind==='recent')await view.getByRole('button',{name:'分享最近对局',exact:true}).click()
  else {
   await view.getByRole('button',{name:'数据统计',exact:true}).click()
   await view.locator('.queue-picker button').filter({hasText:'海克斯大乱斗'}).click()
   await expect(view.locator('.champion-row')).toHaveCount(1)
   await expect(page.locator('.progress-overlay')).toHaveCount(0)
  }
  await holdCanvas(page)
  if(kind==='recent')await view.locator('.share-preview').getByRole('button',{name:'复制图片',exact:true}).click()
  else await view.locator('.panel-heading-actions .share-action').click()
  await pending(page)
  await switchPage(page,'查战绩');await switchPage(page,'当前角色')
  await release(page)
  await expect(page.getByText('分享图片生成失败',{exact:true}).or(page.getByText('单英雄战绩图片生成失败',{exact:true}))).toBeVisible()
  expect(await page.evaluate(()=>window.__copiedPng)).toBeUndefined()
  if(kind==='recent')await expect(view.locator('.share-preview')).toHaveCount(0)
  expect(errors).toEqual([])
 })
}
for(const kind of ['tier','hextech']){
 test(`${kind} export cannot copy after hiding tool`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://aramkit.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>外部页面模拟</p>'}))
  await page.goto('/tests/ui/?normal=1')
  await switchPage(page,'工具')
  const notice=page.locator('.aramkit-notice-dialog')
  if(await notice.isVisible())await notice.getByRole('button',{name:'关闭',exact:true}).last().click()
  await page.locator('.tool-tabs').getByRole('button',{name:kind==='tier'?'由夯到拉':'海克斯设计',exact:true}).click()
  await holdCanvas(page)
  if(kind==='tier')await page.locator('.tier-actions:visible').getByRole('button',{name:'导出',exact:true}).click()
  else await page.locator('.designer-actions').getByRole('button',{name:'分享',exact:true}).click()
  await pending(page)
  await switchPage(page,'当前角色');await switchPage(page,'工具')
  await release(page)
  await expect(page.getByText('分享已取消，未写入剪贴板',{exact:false})).toBeVisible()
  expect(await page.evaluate(()=>window.__copiedPng)).toBeUndefined()
  expect(errors).toEqual([])
 })
}
