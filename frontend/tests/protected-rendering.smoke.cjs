// Run after `pnpm build` to verify the actual production HTML.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { setTimeout: delay } = require('node:timers/promises')
const { resolve } = require('node:path')

async function main() {
  const server = spawn(process.execPath, [resolve(__dirname, '../.output/server/index.mjs')], {
    env: { ...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: '3217' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let errors = ''
  server.stderr.on('data', chunk => { errors += chunk })
  const closed = once(server, 'close')
  try {
    let home
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        home = await fetch('http://127.0.0.1:3217/')
        break
      } catch {
        if (server.exitCode !== null) throw new Error(errors)
        await delay(100)
      }
    }
    assert.ok(home, `Production server did not start: ${errors}`)
    assert.equal(home.status, 200)
    const html = await home.text()
    // Latest dev serves the dashboard as an SPA shell, without protected markup.
    assert.doesNotMatch(html, /<h2[^>]*>\s*Your boards/)
    assert.doesNotMatch(html, /data-testid="new-board-button"/)
    for (const path of ['/login', '/register', '/forgot-password']) {
      const page = await fetch(`http://127.0.0.1:3217${path}`)
      assert.equal(page.status, 200)
      assert.match(await page.text(), /name="email"/)
    }
    const reset = await fetch('http://127.0.0.1:3217/reset-password')
    assert.equal(reset.status, 200)
    assert.match(await reset.text(), /Checking your reset link/)
    console.log('Production smoke check passed: protected content withheld; public forms rendered.')
  } finally {
    server.kill('SIGTERM')
    await closed
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
