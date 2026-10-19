const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')

function setupKanbanApi() {
  const calls = []
  const exports = {}
  const source = readFileSync(resolve(__dirname, '../app/api/kanban.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const mockApiService = {
    get(url, query, options) {
      calls.push({ method: 'GET', url, data: query, options })
      return Promise.resolve({ url, query, options })
    },
    post(url, body, options) {
      calls.push({ method: 'POST', url, data: body, options })
      return Promise.resolve({ url, body, options })
    },
    patch(url, body, options) {
      calls.push({ method: 'PATCH', url, data: body, options })
      return Promise.resolve({ url, body, options })
    },
    delete(url, options) {
      calls.push({ method: 'DELETE', url, options })
      return Promise.resolve({ url, options })
    },
  }

  runInNewContext(compiled, {
    exports,
    Symbol,
    require(name) {
      if (name === '~/services/ApiService') {
        return { apiService: mockApiService }
      }
      if (name === 'vue') {
        return { computed: () => {}, ref: () => {} }
      }
      return require(name)
    },
  })

  return { kanbanApi: exports.kanbanApi, calls }
}

test('KanbanApi routes all 5 Board CRUD methods to correct paths, verbs, and payloads', async () => {
  const { kanbanApi, calls } = setupKanbanApi()

  // 1. listBoards
  await kanbanApi.listBoards()
  assert.deepEqual(calls[calls.length - 1], {
    method: 'GET',
    url: '/api/kanban/boards',
    data: undefined,
    options: undefined,
  })

  // 2. getBoard
  await kanbanApi.getBoard(42)
  assert.deepEqual(calls[calls.length - 1], {
    method: 'GET',
    url: '/api/kanban/boards/42',
    data: undefined,
    options: undefined,
  })

  // 3. createBoard
  await kanbanApi.createBoard({ title: 'New Board', description: 'Test Desc' })
  assert.deepEqual(calls[calls.length - 1], {
    method: 'POST',
    url: '/api/kanban/boards',
    data: { title: 'New Board', description: 'Test Desc' },
    options: undefined,
  })

  // 4. updateBoard
  await kanbanApi.updateBoard(42, { title: 'Renamed Board' })
  assert.deepEqual(calls[calls.length - 1], {
    method: 'PATCH',
    url: '/api/kanban/boards/42',
    data: { title: 'Renamed Board' },
    options: undefined,
  })

  // 5. deleteBoard
  await kanbanApi.deleteBoard(42)
  assert.deepEqual(calls[calls.length - 1], {
    method: 'DELETE',
    url: '/api/kanban/boards/42',
    options: undefined,
  })
})

test('KanbanApi routes all 3 Column CRUD methods to correct paths, verbs, and payloads', async () => {
  const { kanbanApi, calls } = setupKanbanApi()

  // 6. createColumn
  await kanbanApi.createColumn(10, { title: 'Backlog', position: 0 })
  assert.deepEqual(calls[calls.length - 1], {
    method: 'POST',
    url: '/api/kanban/boards/10/columns',
    data: { title: 'Backlog', position: 0 },
    options: undefined,
  })

  // 7. updateColumn
  await kanbanApi.updateColumn(101, { title: 'In Review', position: 2 })
  assert.deepEqual(calls[calls.length - 1], {
    method: 'PATCH',
    url: '/api/kanban/columns/101',
    data: { title: 'In Review', position: 2 },
    options: undefined,
  })

  // 8. deleteColumn
  await kanbanApi.deleteColumn(101)
  assert.deepEqual(calls[calls.length - 1], {
    method: 'DELETE',
    url: '/api/kanban/columns/101',
    options: undefined,
  })
})

test('KanbanApi routes all 4 Task methods including move to correct paths, verbs, and payloads', async () => {
  const { kanbanApi, calls } = setupKanbanApi()

  // 9. createTask
  await kanbanApi.createTask(101, { title: 'New Task', description: 'Details' })
  assert.deepEqual(calls[calls.length - 1], {
    method: 'POST',
    url: '/api/kanban/columns/101/tasks',
    data: { title: 'New Task', description: 'Details' },
    options: undefined,
  })

  // 10. updateTask
  await kanbanApi.updateTask(505, { title: 'Updated Title', description: 'Updated Details' })
  assert.deepEqual(calls[calls.length - 1], {
    method: 'PATCH',
    url: '/api/kanban/tasks/505',
    data: { title: 'Updated Title', description: 'Updated Details' },
    options: undefined,
  })

  // 11. deleteTask
  await kanbanApi.deleteTask(505)
  assert.deepEqual(calls[calls.length - 1], {
    method: 'DELETE',
    url: '/api/kanban/tasks/505',
    options: undefined,
  })

  // 12. moveTask
  await kanbanApi.moveTask(505, { to_column_id: 102, target_position: 1 })
  assert.deepEqual(calls[calls.length - 1], {
    method: 'POST',
    url: '/api/kanban/tasks/505/move',
    data: { to_column_id: 102, target_position: 1 },
    options: undefined,
  })
})

test('frontend/app/api/kanban.ts does not import or contain mock fixtures or simulated delays', () => {
  const source = readFileSync(resolve(__dirname, '../app/api/kanban.ts'), 'utf8')
  assert.equal(source.includes('mockKanbanBoard'), false, 'mockKanbanBoard must be removed')
  assert.equal(source.includes('~/mocks/kanban'), false, 'mock fixtures import must be removed')
  assert.equal(source.includes('setTimeout'), false, 'simulated delays must not be present')
})
