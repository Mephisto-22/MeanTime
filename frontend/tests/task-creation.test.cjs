const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parse, compileScript } = require('vue/compiler-sfc')
const vue = require('vue')
const ts = require('typescript')
const { runInNewContext } = require('node:vm')

const columnSourcePath = resolve(__dirname, '../app/components/kanban/Column.vue')
const boardSourcePath = resolve(__dirname, '../app/components/kanban/Board.vue')

function setupColumn(columnData, { openCreateTaskDialog } = {}) {
  const columnSource = readFileSync(columnSourcePath, 'utf8')
  const { descriptor } = parse(columnSource)
  const compiled = compileScript(descriptor, { id: 'column-creation' })
  const js = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const calls = []
  const exports = {}
  runInNewContext(js, {
    exports,
    console,
    require(name) {
      if (name === 'vue') {
        return {
          ...vue,
          inject(key) {
            return {
              openCreateTaskDialog: (colId) => {
                calls.push(colId)
                if (openCreateTaskDialog) openCreateTaskDialog(colId)
              },
            }
          },
        }
      }
      if (name === 'vue-draggable-plus') return { VueDraggable: {} }
      if (name === '~/api/kanban') return { kanbanContextKey: Symbol('kanbanContext') }
      return require(name)
    },
  })

  const component = exports.default
  const props = { column: JSON.parse(JSON.stringify(columnData)) }
  const exposed = {}
  const instance = component.setup(props, { emit: () => {}, slots: {}, expose: (val) => Object.assign(exposed, val) })

  return { instance, calls, props, columnSource, exposed }
}

test('Seam 1: Column renders "+ Add Task" button and clicking invokes openCreateTaskDialog(column.id)', () => {
  const columnSource = readFileSync(columnSourcePath, 'utf8')

  assert.ok(
    columnSource.includes('data-testid="add-task-button"'),
    'Column.vue must render a button with data-testid="add-task-button"',
  )
  assert.ok(
    columnSource.includes('+ Add Task'),
    'Column.vue must render an "+ Add Task" button',
  )

  const columnData = {
    id: 'col-xyz',
    title: 'To Do',
    position: 0,
    boardId: 'b-1',
    tasks: [],
  }

  const { instance, calls, exposed } = setupColumn(columnData)

  const handler = exposed.handleAddTask || instance?.handleAddTask || exposed.openCreateTaskDialog
  assert.equal(typeof handler, 'function', 'Column must expose handleAddTask function')

  handler()
  assert.equal(calls.length, 1, 'Clicking Add Task must invoke openCreateTaskDialog once')
  assert.equal(calls[0], 'col-xyz', 'openCreateTaskDialog must be called with column.id')
})

function setupBoard(initialBoard, { mockCreateTask } = {}) {
  const boardSource = readFileSync(boardSourcePath, 'utf8')
  const { descriptor } = parse(boardSource)
  const compiled = compileScript(descriptor, { id: 'board-creation' })
  const js = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const apiCalls = []
  let providedContext = null
  const exports = {}

  runInNewContext(js, {
    exports,
    console,
    require(name) {
      if (name === 'vue') {
        return {
          ...vue,
          provide(key, value) {
            providedContext = value
          },
        }
      }
      if (name === '~/api/kanban') {
        return {
          kanbanContextKey: Symbol('kanbanContext'),
          kanbanApi: {
            createTask: async (columnId, payload) => {
              apiCalls.push({ columnId, payload })
              if (mockCreateTask) return mockCreateTask(columnId, payload)
              return {
                id: 'srv-created-id',
                title: payload.title,
                description: payload.description,
                position: 1,
                columnId,
              }
            },
            moveTask: async () => {},
            updateTask: async () => {},
            deleteTask: async () => {},
          },
        }
      }
      return require(name)
    },
  })

  const component = exports.default
  const props = { board: JSON.parse(JSON.stringify(initialBoard)) }
  const exposed = {}
  component.setup(props, {
    emit: () => {},
    slots: {},
    expose: (val) => Object.assign(exposed, val),
  })

  return { context: providedContext, exposed, apiCalls, props, boardSource }
}

test('Seam 2: Board optimistically appends task to column and dispatches kanbanApi.createTask', async () => {
  const initialBoard = {
    id: 'b-1',
    title: 'Board 1',
    columns: [
      {
        id: 'col-1',
        title: 'To Do',
        position: 0,
        boardId: 'b-1',
        tasks: [
          { id: 't-1', title: 'Task 1', description: 'Desc 1', position: 0, columnId: 'col-1' },
        ],
      },
    ],
  }

  let resolveApiCall
  const pendingPromise = new Promise((resolve) => {
    resolveApiCall = resolve
  })

  const { exposed, apiCalls } = setupBoard(initialBoard, {
    mockCreateTask: async () => pendingPromise,
  })

  // Trigger task creation via board context / dialog save handler
  const createPromise = exposed.handleSaveTask({
    mode: 'create',
    columnId: 'col-1',
    title: 'Optimistic Task',
    description: 'Optimistic Description',
  })

  // Optimistic assertion: task is immediately present in column BEFORE server responds
  const colTasks = exposed.localColumns.value[0].tasks
  assert.equal(colTasks.length, 2, 'Task must be optimistically appended to column immediately')
  const optimisticTask = colTasks[1]
  assert.equal(optimisticTask.title, 'Optimistic Task')
  assert.equal(optimisticTask.description, 'Optimistic Description')
  assert.equal(optimisticTask.position, 1, 'Optimistic task must be at the bottom (position 1)')
  assert.equal(optimisticTask.columnId, 'col-1')
  assert.ok(optimisticTask.id, 'Optimistic task must have a temporary local ID')

  // Verify API was called
  const recordedCalls = JSON.parse(JSON.stringify(apiCalls))
  assert.equal(recordedCalls.length, 1)
  assert.equal(recordedCalls[0].columnId, 'col-1')
  assert.deepEqual(recordedCalls[0].payload, {
    title: 'Optimistic Task',
    description: 'Optimistic Description',
  })

  // Clean up promise
  resolveApiCall({
    id: 'server-id-999',
    title: 'Optimistic Task',
    description: 'Optimistic Description',
    position: 1,
    columnId: 'col-1',
  })
  await createPromise
})

test('Seam 3A: Successful creation reconciles temporary local task ID with server ID', async () => {
  const initialBoard = {
    id: 'b-1',
    title: 'Board 1',
    columns: [
      {
        id: 'col-1',
        title: 'To Do',
        position: 0,
        boardId: 'b-1',
        tasks: [
          { id: 't-1', title: 'Task 1', description: 'Desc 1', position: 0, columnId: 'col-1' },
        ],
      },
    ],
  }

  const { exposed } = setupBoard(initialBoard, {
    mockCreateTask: async (columnId, payload) => ({
      id: 42,
      title: payload.title,
      description: payload.description,
      position: 1,
      columnId,
    }),
  })

  await exposed.handleSaveTask({
    mode: 'create',
    columnId: 'col-1',
    title: 'Persistent Task',
    description: 'Will receive server ID',
  })

  const colTasks = exposed.localColumns.value[0].tasks
  assert.equal(colTasks.length, 2)
  const persistedTask = colTasks[1]
  assert.equal(persistedTask.id, 42, 'Local task ID must be reconciled with server database ID 42')
  assert.equal(persistedTask.title, 'Persistent Task')
  assert.equal(persistedTask.position, 1)
})

test('Seam 3B: Failed creation rolls back optimistic task, logs warning, and surfaces error notification', async () => {
  const initialBoard = {
    id: 'b-1',
    title: 'Board 1',
    columns: [
      {
        id: 'col-1',
        title: 'To Do',
        position: 0,
        boardId: 'b-1',
        tasks: [
          { id: 't-1', title: 'Task 1', description: 'Desc 1', position: 0, columnId: 'col-1' },
        ],
      },
    ],
  }

  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args)

  try {
    const { exposed, boardSource } = setupBoard(initialBoard, {
      mockCreateTask: async () => {
        throw new Error('Database unreachable')
      },
    })

    // Verify Board template includes error banner for surfacing notification
    assert.ok(
      boardSource.includes('data-testid="kanban-error-banner"'),
      'Board.vue must contain an error banner element with data-testid="kanban-error-banner"',
    )

    await exposed.handleSaveTask({
      mode: 'create',
      columnId: 'col-1',
      title: 'Doomed Task',
      description: 'Will fail and roll back',
    })

    // Verify task rollback: column has only original task
    const colTasks = exposed.localColumns.value[0].tasks
    assert.equal(colTasks.length, 1, 'Optimistically added task must be removed on failure')
    assert.equal(colTasks[0].id, 't-1')
    assert.equal(colTasks[0].position, 0)

    // Verify error warning logged
    assert.ok(warnings.length >= 1, 'An error warning must be logged via console.warn')
    const hasCreateWarning = warnings.some((args) =>
      args.some((arg) => typeof arg === 'string' && /Failed to create task/i.test(arg)),
    )
    assert.ok(hasCreateWarning, 'Warning message must indicate failure to create task')

    // Verify error notification surfaced in board state
    assert.ok(
      exposed.errorMessage && exposed.errorMessage.value,
      'Board must surface errorMessage in reactive state',
    )
    assert.match(
      exposed.errorMessage.value,
      /failed/i,
      'Surfaced error message must describe the failure',
    )
  } finally {
    console.warn = originalWarn
  }
})


