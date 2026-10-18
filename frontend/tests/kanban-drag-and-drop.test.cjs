const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parse, compileScript } = require('vue/compiler-sfc')
const vue = require('vue')
const ts = require('typescript')
const { runInNewContext } = require('node:vm')

const taskSource = readFileSync(resolve(__dirname, '../app/components/kanban/Task.vue'), 'utf8')
const columnSource = readFileSync(resolve(__dirname, '../app/components/kanban/Column.vue'), 'utf8')
const boardSource = readFileSync(resolve(__dirname, '../app/components/kanban/Board.vue'), 'utf8')

const normalize = (val) => JSON.parse(JSON.stringify(val))

function setupBoard(initialBoard, { mockMoveTask } = {}) {
  const { descriptor } = parse(boardSource)
  const compiled = compileScript(descriptor, { id: 'board' })
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
            moveTask: async (req) => {
              apiCalls.push(req)
              if (mockMoveTask) return mockMoveTask(req)
            },
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

  return {
    context: providedContext,
    apiCalls,
    component,
    props,
    exposed,
  }
}

test('Task component: renders task name and grab cursor without three-dot menu button or popup menu', () => {
  assert.equal(
    taskSource.includes('task-action-menu-button'),
    false,
    'Task component should no longer render task-action-menu-button',
  )
  assert.equal(
    taskSource.includes('<Menu'),
    false,
    'Task component should no longer render PrimeVue Menu component',
  )
  assert.ok(
    taskSource.includes('cursor-grab'),
    'Task component should include cursor-grab class for tactile cue',
  )
  assert.ok(
    taskSource.includes('data-testid="kanban-task"'),
    'Task component must retain data-testid="kanban-task"',
  )
})

test('Vertical drag within column: reorders task at designated index, re-indexes orders, and dispatches to API', async () => {
  const initialBoard = {
    id: 'board-1',
    name: 'Board',
    columns: [
      {
        id: 'col-1',
        name: 'To Do',
        order: 0,
        boardId: 'board-1',
        tasks: [
          { id: 't-1', name: 'Task 1', order: 0, columnId: 'col-1' },
          { id: 't-2', name: 'Task 2', order: 1, columnId: 'col-1' },
          { id: 't-3', name: 'Task 3', order: 2, columnId: 'col-1' },
        ],
      },
    ],
  }

  const { context, apiCalls, exposed } = setupBoard(initialBoard)

  // Move t-3 (originally at index 2) to top (targetOrder: 0)
  await context.moveTask({
    taskId: 't-3',
    fromColumnId: 'col-1',
    toColumnId: 'col-1',
    targetOrder: 0,
  })

  const calls = normalize(apiCalls)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    taskId: 't-3',
    fromColumnId: 'col-1',
    toColumnId: 'col-1',
    targetOrder: 0,
  })

  // Verify task reindexing in column 1
  const col1Tasks = normalize(exposed.localColumns.value[0].tasks)
  assert.equal(col1Tasks.length, 3)
  assert.deepEqual(col1Tasks.map(t => ({ id: t.id, order: t.order })), [
    { id: 't-3', order: 0 },
    { id: 't-1', order: 1 },
    { id: 't-2', order: 2 },
  ])
})

test('Horizontal drag between columns: moves task to target column at index, updates columnId, re-indexes both columns, and dispatches API', async () => {
  const initialBoard = {
    id: 'board-1',
    name: 'Board',
    columns: [
      {
        id: 'col-1',
        name: 'To Do',
        order: 0,
        boardId: 'board-1',
        tasks: [
          { id: 't-1', name: 'Task 1', order: 0, columnId: 'col-1' },
          { id: 't-2', name: 'Task 2', order: 1, columnId: 'col-1' },
        ],
      },
      {
        id: 'col-2',
        name: 'In Progress',
        order: 1,
        boardId: 'board-1',
        tasks: [
          { id: 't-3', name: 'Task 3', order: 0, columnId: 'col-2' },
          { id: 't-4', name: 'Task 4', order: 1, columnId: 'col-2' },
        ],
      },
    ],
  }

  const { context, apiCalls, exposed } = setupBoard(initialBoard)

  // Drag t-1 from col-1 to col-2 between t-3 and t-4 (targetOrder: 1)
  await context.moveTask({
    taskId: 't-1',
    fromColumnId: 'col-1',
    toColumnId: 'col-2',
    targetOrder: 1,
  })

  const calls = normalize(apiCalls)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    taskId: 't-1',
    fromColumnId: 'col-1',
    toColumnId: 'col-2',
    targetOrder: 1,
  })

  // Verify col-1 tasks updated and re-indexed
  const col1Tasks = normalize(exposed.localColumns.value[0].tasks)
  assert.equal(col1Tasks.length, 1)
  assert.deepEqual(col1Tasks.map(t => ({ id: t.id, order: t.order })), [
    { id: 't-2', order: 0 },
  ])

  // Verify col-2 tasks updated with inserted task, columnId updated, and re-indexed
  const col2Tasks = normalize(exposed.localColumns.value[1].tasks)
  assert.equal(col2Tasks.length, 3)
  assert.deepEqual(col2Tasks.map(t => ({ id: t.id, order: t.order, columnId: t.columnId })), [
    { id: 't-3', order: 0, columnId: 'col-2' },
    { id: 't-1', order: 1, columnId: 'col-2' },
    { id: 't-4', order: 2, columnId: 'col-2' },
  ])
})

test('Empty column drop mechanics: dropping task into empty column places it at index 0, updates columnId, and empties source', async () => {
  const initialBoard = {
    id: 'board-1',
    name: 'Board',
    columns: [
      {
        id: 'col-1',
        name: 'To Do',
        order: 0,
        boardId: 'board-1',
        tasks: [
          { id: 't-1', name: 'Task 1', order: 0, columnId: 'col-1' },
        ],
      },
      {
        id: 'col-empty',
        name: 'Empty Column',
        order: 1,
        boardId: 'board-1',
        tasks: [],
      },
    ],
  }

  const { context, apiCalls, exposed } = setupBoard(initialBoard)

  await context.moveTask({
    taskId: 't-1',
    fromColumnId: 'col-1',
    toColumnId: 'col-empty',
    targetOrder: 0,
  })

  const calls = normalize(apiCalls)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    taskId: 't-1',
    fromColumnId: 'col-1',
    toColumnId: 'col-empty',
    targetOrder: 0,
  })

  // Source column is now empty
  assert.equal(exposed.localColumns.value[0].tasks.length, 0)

  // Target column now contains the moved task at order 0
  const targetTasks = normalize(exposed.localColumns.value[1].tasks)
  assert.equal(targetTasks.length, 1)
  assert.deepEqual(targetTasks[0], {
    id: 't-1',
    name: 'Task 1',
    order: 0,
    columnId: 'col-empty',
  })
})

test('Persistence failure: logs warning without throwing or breaking local board state', async () => {
  const initialBoard = {
    id: 'board-1',
    name: 'Board',
    columns: [
      {
        id: 'col-1',
        name: 'To Do',
        order: 0,
        boardId: 'board-1',
        tasks: [
          { id: 't-1', name: 'Task 1', order: 0, columnId: 'col-1' },
        ],
      },
      {
        id: 'col-2',
        name: 'In Progress',
        order: 1,
        boardId: 'board-1',
        tasks: [],
      },
    ],
  }

  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args)

  try {
    const { context, exposed } = setupBoard(initialBoard, {
      mockMoveTask: async () => {
        throw new Error('Network error simulated')
      },
    })

    await context.moveTask({
      taskId: 't-1',
      fromColumnId: 'col-1',
      toColumnId: 'col-2',
      targetOrder: 0,
    })

    assert.equal(warnings.length, 1)
    assert.match(warnings[0][0], /Failed to persist task movement/)

    // State is optimistically maintained
    assert.equal(exposed.localColumns.value[0].tasks.length, 0)
    assert.equal(exposed.localColumns.value[1].tasks.length, 1)
  } finally {
    console.warn = originalWarn
  }
})

test('Column component: configured with VueDraggable, animations, touch delay, ghost class, and permanent container', () => {
  assert.ok(
    columnSource.includes('VueDraggable') || columnSource.includes('vue-draggable-plus'),
    'Column should use VueDraggable from vue-draggable-plus',
  )
  assert.ok(
    columnSource.includes('group="kanban-tasks"'),
    'Column must set group="kanban-tasks"',
  )
  assert.ok(
    columnSource.includes(':animation="150"') || columnSource.includes('animation="150"'),
    'Column must configure animation transition of 150ms',
  )
  assert.ok(
    columnSource.includes('draggable="[data-testid=\'kanban-task\']"') ||
      columnSource.includes('draggable="[data-testid=&quot;kanban-task&quot;]"'),
    'Column must restrict draggable items to [data-testid=\'kanban-task\']',
  )
  assert.ok(
    columnSource.includes('ghost-class="kanban-task-ghost"') || columnSource.includes('ghostClass="kanban-task-ghost"'),
    'Column must define ghost-class="kanban-task-ghost"',
  )
  assert.ok(
    columnSource.includes('delay-on-touch-only') || columnSource.includes('delayOnTouchOnly'),
    'Column must configure delayOnTouchOnly',
  )
  assert.ok(
    columnSource.includes('min-h-[120px]'),
    'Column must permanently render drop container with min-h-[120px]',
  )
  assert.ok(
    columnSource.includes('data-testid="column-empty-placeholder"'),
    'Column must provide empty placeholder with data-testid="column-empty-placeholder"',
  )
  assert.ok(
    readFileSync(resolve(__dirname, '../app/assets/css/main.css'), 'utf8').includes('[data-testid="kanban-column"]:has(.kanban-task-ghost)'),
    'Column must support drop-target highlight',
  )
})

function setupColumn(columnData, { moveTask } = {}) {
  const { descriptor } = parse(columnSource)
  const compiled = compileScript(descriptor, { id: 'column' })
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
              moveTask: (req) => {
                calls.push(req)
                if (moveTask) moveTask(req)
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
  const instance = component.setup(props, { emit: () => {}, slots: {}, expose: () => {} })

  return { instance, calls, props }
}

test('Column component event dispatching: onUpdate within column dispatches moveTask to kanbanContext', () => {
  const columnData = {
    id: 'col-1',
    name: 'To Do',
    order: 0,
    boardId: 'b1',
    tasks: [
      { id: 't-1', name: 'Task 1', order: 0, columnId: 'col-1' },
      { id: 't-2', name: 'Task 2', order: 1, columnId: 'col-1' },
    ],
  }

  const { instance, calls } = setupColumn(columnData)

  // Simulate Sortable update moving t-2 to index 0
  instance.onUpdate({
    item: { getAttribute: (attr) => (attr === 'data-task-id' ? 't-2' : null) },
    newDraggableIndex: 0,
  })

  const recordedCalls = normalize(calls)
  assert.equal(recordedCalls.length, 1)
  assert.deepEqual(recordedCalls[0], {
    taskId: 't-2',
    fromColumnId: 'col-1',
    toColumnId: 'col-1',
    targetOrder: 0,
  })
})

test('Column component event dispatching: onAdd across columns dispatches moveTask to kanbanContext', () => {
  const columnData = {
    id: 'col-2',
    name: 'In Progress',
    order: 1,
    boardId: 'b1',
    tasks: [],
  }

  const { instance, calls } = setupColumn(columnData)

  // Simulate Sortable add receiving t-1 from col-1 dropped at index 0
  instance.onAdd({
    item: { getAttribute: (attr) => (attr === 'data-task-id' ? 't-1' : null) },
    from: {
      getAttribute: (attr) => (attr === 'data-column-id' ? 'col-1' : null),
      closest: () => null,
    },
    newDraggableIndex: 0,
  })

  const recordedCalls = normalize(calls)
  assert.equal(recordedCalls.length, 1)
  assert.deepEqual(recordedCalls[0], {
    taskId: 't-1',
    fromColumnId: 'col-1',
    toColumnId: 'col-2',
    targetOrder: 0,
  })
})

test('Column drag states and placeholder styling: CSS hides empty placeholder when ghost card is present and activates drop target outline', () => {
  const cssSource = readFileSync(resolve(__dirname, '../app/assets/css/main.css'), 'utf8')
  assert.ok(
    cssSource.includes(':has(.kanban-task-ghost)') && cssSource.includes('[data-testid="column-empty-placeholder"]'),
    'main.css must hide column-empty-placeholder when a ghost card is hovering',
  )
  assert.ok(
    cssSource.includes('[data-testid="kanban-column"]:has(.kanban-task-ghost)'),
    'main.css must apply drop-target outline when a ghost card is hovering over the column',
  )
  assert.ok(
    cssSource.includes('.kanban-task-ghost') && cssSource.includes('dashed'),
    'main.css must define dashed translucent ghost placeholder',
  )
  assert.ok(
    cssSource.includes('.kanban-task-drag') && cssSource.includes('rotate'),
    'main.css must define active dragged card tilt and elevated shadow',
  )
})

