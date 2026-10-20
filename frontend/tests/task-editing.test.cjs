const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parse, compileScript } = require('vue/compiler-sfc')
const vue = require('vue')
const ts = require('typescript')
const { runInNewContext } = require('node:vm')

const taskSourcePath = resolve(__dirname, '../app/components/kanban/Task.vue')
const boardSourcePath = resolve(__dirname, '../app/components/kanban/Board.vue')

function setupTask(taskData, { openEditTaskDialog } = {}) {
  const taskSource = readFileSync(taskSourcePath, 'utf8')
  const { descriptor } = parse(taskSource)
  const compiled = compileScript(descriptor, { id: 'task-editing' })
  const js = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const calls = []
  const exports = {}

  runInNewContext(js, {
    exports,
    console,
    clearTimeout,
    setTimeout,
    require(name) {
      if (name === 'vue') {
        return {
          ...vue,
          inject(key) {
            return {
              openEditTaskDialog: (task) => {
                calls.push(task)
                if (openEditTaskDialog) openEditTaskDialog(task)
              },
            }
          },
        }
      }
      if (name === '~/api/kanban') return { kanbanContextKey: Symbol('kanbanContext') }
      return require(name)
    },
  })

  const component = exports.default
  const props = { task: JSON.parse(JSON.stringify(taskData)) }
  const exposed = {}
  const instance = component.setup(props, { emit: () => {}, slots: {}, expose: (val) => Object.assign(exposed, val) })

  return { instance, calls, props, taskSource, exposed }
}

function setupBoard(initialBoard, { mockUpdateTask, mockDeleteTask } = {}) {
  const boardSource = readFileSync(boardSourcePath, 'utf8')
  const { descriptor } = parse(boardSource)
  const compiled = compileScript(descriptor, { id: 'board-editing' })
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
            updateTask: async (taskId, payload) => {
              apiCalls.push({ type: 'updateTask', taskId, payload })
              if (mockUpdateTask) return mockUpdateTask(taskId, payload)
              return { id: taskId, ...payload }
            },
            deleteTask: async (taskId) => {
              apiCalls.push({ type: 'deleteTask', taskId })
              if (mockDeleteTask) return mockDeleteTask(taskId)
              return { success: true }
            },
            createTask: async () => {},
            moveTask: async () => {},
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

function createSampleBoard() {
  return {
    id: 'b-1',
    title: 'Test Board',
    columns: [
      {
        id: 'col-1',
        title: 'To Do',
        position: 0,
        boardId: 'b-1',
        tasks: [
          { id: 't-1', title: 'Task Alpha', description: 'Alpha description', position: 0, columnId: 'col-1' },
          { id: 't-2', title: 'Task Beta', description: 'Beta description', position: 1, columnId: 'col-1' },
          { id: 't-3', title: 'Task Gamma', description: 'Gamma description', position: 2, columnId: 'col-1' },
        ],
      },
      {
        id: 'col-2',
        title: 'Done',
        position: 1,
        boardId: 'b-1',
        tasks: [],
      },
    ],
  }
}

test('Task card click: clicking a Task.vue card opens TaskDialog in edit mode populated with current task', () => {
  const taskData = {
    id: 't-1',
    title: 'Clickable Task',
    description: 'Detailed description',
    position: 0,
    columnId: 'col-1',
  }

  const { exposed, calls } = setupTask(taskData)

  // Trigger click without drag gesture
  exposed.handleClick()

  assert.equal(calls.length, 1, 'openEditTaskDialog must be called once on click')
  assert.equal(calls[0].id, 't-1')
  assert.equal(calls[0].title, 'Clickable Task')
  assert.equal(calls[0].description, 'Detailed description')
})

test('Task drag disambiguation: gesture guard suppresses click after drag-and-drop movement', () => {
  const taskData = {
    id: 't-1',
    title: 'Draggable Task',
    position: 0,
    columnId: 'col-1',
  }

  const { exposed, calls } = setupTask(taskData)

  // Step 1: Pointer down at (50, 50)
  exposed.handlePointerDown({ clientX: 50, clientY: 50 })
  assert.equal(exposed.isDragging.value, false, 'isDragging should be false on pointer down')

  // Step 2: Pointer move exceeding threshold (> 5px) to (50, 80)
  exposed.handlePointerMove({ clientX: 50, clientY: 80, buttons: 1 })
  assert.equal(exposed.isDragging.value, true, 'isDragging must be true when movement exceeds drag threshold')

  // Step 3: Mouseup / click event fires upon drop
  exposed.handleClick()

  // Guard must prevent openEditTaskDialog from being called
  assert.equal(calls.length, 0, 'openEditTaskDialog must NOT be invoked when dropping a dragged card')
  assert.equal(exposed.isDragging.value, false, 'isDragging must be reset after suppressed click')

  // Step 4: Subsequent normal stationary click works properly
  exposed.handlePointerDown({ clientX: 50, clientY: 50 })
  exposed.handlePointerMove({ clientX: 51, clientY: 51, buttons: 1 }) // Small shift below threshold
  exposed.handleClick()

  assert.equal(calls.length, 1, 'Subsequent normal click must trigger openEditTaskDialog')
  assert.equal(calls[0].id, 't-1')
})

test('Task drag disambiguation: HTML5 dragstart and dragend guard suppresses click', () => {
  const taskData = {
    id: 't-2',
    title: 'HTML5 Drag Task',
    position: 1,
    columnId: 'col-1',
  }

  const { exposed, calls } = setupTask(taskData)

  exposed.handleDragStart()
  assert.equal(exposed.isDragging.value, true, 'isDragging must be true after dragstart')

  // Click immediately after drag release
  exposed.handleClick()
  assert.equal(calls.length, 0, 'Click immediately following drag must be suppressed')
})

test('Board optimistic update: saving modifications updates local card immediately and calls kanbanApi.updateTask', async () => {
  const initialBoard = createSampleBoard()

  let resolveApiCall
  const pendingPromise = new Promise((resolve) => {
    resolveApiCall = resolve
  })

  const { exposed, apiCalls } = setupBoard(initialBoard, {
    mockUpdateTask: async () => pendingPromise,
  })

  // Trigger save in edit mode
  const updatePromise = exposed.handleSaveTask({
    mode: 'edit',
    taskId: 't-2',
    title: 'Updated Task Beta',
    description: 'Updated description for beta',
    columnId: 'col-1',
  })

  // Verify optimistic update: local task reflects new title and description BEFORE API resolves
  const updatedLocal = exposed.localColumns.value[0].tasks.find((t) => t.id === 't-2')
  assert.ok(updatedLocal)
  assert.equal(updatedLocal.title, 'Updated Task Beta', 'Local task title must update optimistically')
  assert.equal(updatedLocal.description, 'Updated description for beta', 'Local task description must update optimistically')

  // Verify API call payload
  const recordedCalls = JSON.parse(JSON.stringify(apiCalls))
  assert.equal(recordedCalls.length, 1)
  assert.equal(recordedCalls[0].type, 'updateTask')
  assert.equal(recordedCalls[0].taskId, 't-2')
  assert.deepEqual(recordedCalls[0].payload, {
    title: 'Updated Task Beta',
    description: 'Updated description for beta',
  })

  // Resolve API
  resolveApiCall({
    id: 't-2',
    title: 'Updated Task Beta',
    description: 'Updated description for beta',
    position: 1,
    columnId: 'col-1',
  })
  await updatePromise
})

test('Board update rollback: network failure restores original title and description, surfaces error notification and warning', async () => {
  const initialBoard = createSampleBoard()

  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args)

  try {
    const { exposed, boardSource } = setupBoard(initialBoard, {
      mockUpdateTask: async () => {
        throw new Error('Server update failed')
      },
    })

    assert.ok(boardSource.includes('data-testid="board-error-banner"'))

    await exposed.handleSaveTask({
      mode: 'edit',
      taskId: 't-1',
      title: 'Doomed Title Change',
      description: 'Doomed Description Change',
      columnId: 'col-1',
    })

    // Verify rollback: task reverts to original snapshot
    const rolledBackTask = exposed.localColumns.value[0].tasks.find((t) => t.id === 't-1')
    assert.equal(rolledBackTask.title, 'Task Alpha', 'Task title must roll back to original')
    assert.equal(rolledBackTask.description, 'Alpha description', 'Task description must roll back to original')

    // Verify error warning logged
    assert.ok(warnings.length >= 1, 'console.warn must be called on failure')
    const hasWarning = warnings.some((args) =>
      args.some((arg) => typeof arg === 'string' && /Failed to update task/i.test(arg)),
    )
    assert.ok(hasWarning, 'Warning message must indicate failure to update task')

    // Verify error notification surfaced in board state
    assert.ok(exposed.errorMessage.value, 'errorMessage must be surfaced')
    assert.match(exposed.errorMessage.value, /failed to update task/i)
  } finally {
    console.warn = originalWarn
  }
})

test('Board optimistic delete: confirming deletion removes card optimistically from column and calls kanbanApi.deleteTask', async () => {
  const initialBoard = createSampleBoard()

  let resolveApiCall
  const pendingPromise = new Promise((resolve) => {
    resolveApiCall = resolve
  })

  const { exposed, apiCalls } = setupBoard(initialBoard, {
    mockDeleteTask: async () => pendingPromise,
  })

  // Initially 3 tasks in column 1
  assert.equal(exposed.localColumns.value[0].tasks.length, 3)

  // Dispatch deletion of t-2 (originally at index 1)
  const deletePromise = exposed.handleDeleteTask('t-2')

  // Optimistic verification: t-2 is removed immediately, remaining tasks reindexed
  const colTasks = exposed.localColumns.value[0].tasks
  assert.equal(colTasks.length, 2, 'Task must be optimistically removed from column immediately')
  assert.deepEqual(
    JSON.parse(JSON.stringify(colTasks.map((t) => ({ id: t.id, position: t.position })))),
    [
      { id: 't-1', position: 0 },
      { id: 't-3', position: 1 },
    ],
    'Remaining tasks must be reindexed after deletion',
  )

  // Verify API call dispatched
  const recordedCalls = JSON.parse(JSON.stringify(apiCalls))
  assert.equal(recordedCalls.length, 1)
  assert.equal(recordedCalls[0].type, 'deleteTask')
  assert.equal(recordedCalls[0].taskId, 't-2')

  resolveApiCall({ success: true })
  await deletePromise
})

test('Board delete rollback: network failure restores task to original column and position, logs warning, surfaces error notification', async () => {
  const initialBoard = createSampleBoard()

  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args)

  try {
    const { exposed } = setupBoard(initialBoard, {
      mockDeleteTask: async () => {
        throw new Error('Database delete error')
      },
    })

    // Attempt to delete t-2 (index 1 in col-1)
    await exposed.handleDeleteTask('t-2')

    // Task t-2 must be restored back into col-1 at position 1
    const colTasks = exposed.localColumns.value[0].tasks
    assert.equal(colTasks.length, 3, 'Column must have all 3 tasks restored on failure')
    assert.equal(colTasks[0].id, 't-1')
    assert.equal(colTasks[1].id, 't-2', 't-2 must be restored at index 1')
    assert.equal(colTasks[1].position, 1)
    assert.equal(colTasks[2].id, 't-3')
    assert.equal(colTasks[2].position, 2)

    // Verify error warning logged
    assert.ok(warnings.length >= 1, 'console.warn must log error')
    const hasDeleteWarning = warnings.some((args) =>
      args.some((arg) => typeof arg === 'string' && /Failed to delete task/i.test(arg)),
    )
    assert.ok(hasDeleteWarning, 'Warning message must indicate failure to delete task')

    // Verify error notification surfaced in board state
    assert.ok(exposed.errorMessage.value, 'errorMessage must be surfaced')
    assert.match(exposed.errorMessage.value, /failed to delete task/i)
  } finally {
    console.warn = originalWarn
  }
})
