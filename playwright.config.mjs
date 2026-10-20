import { defineConfig } from '@playwright/test'
export default defineConfig({
 testDir:'./tests/ui', testMatch:'*.spec.mjs', timeout:30000, workers:1,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:1420',screenshot:'only-on-failure',trace:'retain-on-failure',
  launchOptions:process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}},
 webServer:{command:'npm run dev -- --host 127.0.0.1',url:'http://127.0.0.1:1420/tests/ui/',reuseExistingServer:!process.env.CI}
})
