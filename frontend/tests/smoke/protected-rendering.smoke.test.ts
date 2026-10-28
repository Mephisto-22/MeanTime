import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('Production SSR Smoke Check', () => {
  let server: ChildProcess
  let serverClosed: Promise<any[]>
  const isWindows = process.platform === 'win32'
  const socketPath = isWindows
    ? `\\\\.\\pipe\\meantime-smoke-${Date.now()}`
    : `/tmp/meantime-smoke-${Date.now()}.sock`

  function request(path: string): Promise<{ status: number; text: () => Promise<string> }> {
    return new Promise((resolvePromise, rejectPromise) => {
      const req = http.request(
        {
          socketPath,
          path,
          method: 'GET',
        },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            body += chunk
          })
          res.on('end', () => {
            resolvePromise({
              status: res.statusCode ?? 200,
              text: async () => body,
            })
          })
        },
      )
      req.on('error', rejectPromise)
      req.end()
    })
  }

  beforeAll(async () => {
    const serverEntry = resolve(__dirname, '../../.output/server/index.mjs')
    server = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        NITRO_UNIX_SOCKET: socketPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let logs = ''
    server.stdout?.on('data', (chunk) => {
      logs += chunk.toString()
    })
    server.stderr?.on('data', (chunk) => {
      logs += chunk.toString()
    })
    serverClosed = once(server, 'close')

    let started = false
    let lastError = ''
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const res = await request('/')
        if (res.status === 200) {
          started = true
          break
        }
      } catch (err: any) {
        lastError = err.message || String(err)
        if (server.exitCode !== null) {
          throw new Error(`Production server exited early with code ${server.exitCode}: ${logs}`)
        }
        await delay(150)
      }
    }

    if (!started) {
      server.kill('SIGTERM')
      throw new Error(`Production server failed to start within timeout. Last error: ${lastError}. Logs: ${logs}`)
    }
  }, 30000)

  afterAll(async () => {
    if (server) {
      server.kill('SIGTERM')
      await serverClosed
    }
  })

  it('verifies protected route withholds protected content and renders unhydrated SPA shell', async () => {
    const res = await request('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('data-ssr="false"')
    expect(html).not.toContain('Your boards')
    expect(html).not.toContain('Welcome to MeanTime')
    expect(html).not.toContain('data-testid="backend-status-badge"')
  })

  it('verifies public forms render correctly on login and register routes', async () => {
    for (const path of ['/login', '/register', '/forgot-password']) {
      const page = await request(path)
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('name="email"')
    }
  })

  it('renders the public reset-link page without requiring a session', async () => {
    const page = await request('/reset-password')
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Checking your reset link')
  })
})
