const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parse, compileScript } = require('vue/compiler-sfc')
const vue = require('vue')
const ts = require('typescript')
const { runInNewContext } = require('node:vm')

const taskDialogPath = resolve(__dirname, '../app/components/kanban/TaskDialog.vue')

function setupTaskDialog(initialProps, { onEmit } = {}) {
  const taskDialogSource = readFileSync(taskDialogPath, 'utf8')
  const { descriptor } = parse(taskDialogSource)
  const compiled = compileScript(descriptor, { id: 'task-dialog' })
  const js = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const emitted = []
  const exports = {}

  runInNewContext(js, {
    exports,
    console,
    require(name) {
      if (name === 'vue') return vue
      return require(name)
    },
  })

  const component = exports.default
  const props = vue.reactive({ ...initialProps })
  const exposed = {}

  const instance = component.setup(props, {
    emit: (event, ...args) => {
      emitted.push({ event, args })
      if (onEmit) onEmit(event, ...args)
      if (event === 'update:visible') {
        props.visible = args[0]
      }
    },
    slots: {},
    expose: (val) => Object.assign(exposed, val),
  })

  return { instance, props, exposed, emitted, taskDialogSource }
}

test('TaskDialog template structure: renders PrimeVue Dialog, autofocused title InputText, and description Textarea', () => {
  const taskDialogSource = readFileSync(taskDialogPath, 'utf8')

  assert.ok(
    taskDialogSource.includes('<Dialog') && taskDialogSource.includes('data-testid="task-dialog"'),
    'TaskDialog must render PrimeVue Dialog with data-testid="task-dialog"',
  )
  assert.ok(
    taskDialogSource.includes('<InputText') &&
      taskDialogSource.includes('data-testid="task-title-input"') &&
      taskDialogSource.includes('autofocus'),
    'TaskDialog must render an autofocused InputText with data-testid="task-title-input"',
  )
  assert.ok(
    taskDialogSource.includes('<Textarea') && taskDialogSource.includes('data-testid="task-description-input"'),
    'TaskDialog must render Textarea with data-testid="task-description-input"',
  )
  assert.ok(
    taskDialogSource.includes('data-testid="task-save-button"'),
    'TaskDialog must render a Save button with data-testid="task-save-button"',
  )
  assert.ok(
    taskDialogSource.includes('data-testid="task-cancel-button"'),
    'TaskDialog must render a Cancel button with data-testid="task-cancel-button"',
  )
})

test('TaskDialog in create mode: initializes blank and disables Save button when title is empty or whitespace', () => {
  const { exposed } = setupTaskDialog({
    visible: true,
    mode: 'create',
    columnId: 'col-1',
    task: null,
  })

  assert.equal(exposed.title.value, '', 'Title must initialize blank in create mode')
  assert.equal(exposed.description.value, '', 'Description must initialize blank in create mode')
  assert.equal(exposed.isSaveDisabled.value, true, 'Save button must be disabled when title is empty')

  exposed.title.value = '   '
  assert.equal(exposed.isSaveDisabled.value, true, 'Save button must be disabled when title is whitespace-only')

  exposed.title.value = 'Valid Title'
  assert.equal(exposed.isSaveDisabled.value, false, 'Save button must be enabled when title is non-empty')
})

test('TaskDialog in edit mode: populates fields from active task and enables Save', () => {
  const sampleTask = {
    id: 't-100',
    title: 'Existing Task Title',
    description: 'Existing Task Description',
    position: 0,
    columnId: 'col-1',
  }

  const { exposed } = setupTaskDialog({
    visible: true,
    mode: 'edit',
    columnId: 'col-1',
    task: sampleTask,
  })

  assert.equal(exposed.title.value, 'Existing Task Title')
  assert.equal(exposed.description.value, 'Existing Task Description')
  assert.equal(exposed.isSaveDisabled.value, false)

  exposed.title.value = ''
  assert.equal(exposed.isSaveDisabled.value, true, 'Clearing title in edit mode must disable Save')
})

test('TaskDialog discard behavior: cancelling or closing discards changes without mutating active task', () => {
  const originalTask = {
    id: 't-200',
    title: 'Immutable Title',
    description: 'Immutable Description',
    position: 0,
    columnId: 'col-1',
  }

  const { exposed, emitted, props } = setupTaskDialog({
    visible: true,
    mode: 'edit',
    columnId: 'col-1',
    task: originalTask,
  })

  // Mutate local form fields
  exposed.title.value = 'Dirty Unsaved Title'
  exposed.description.value = 'Dirty Unsaved Description'

  // Trigger cancel
  exposed.cancel()

  // Original task object must remain untouched
  assert.equal(originalTask.title, 'Immutable Title')
  assert.equal(originalTask.description, 'Immutable Description')

  // Cancel emitted and dialog visibility closed
  assert.equal(props.visible, false)
  const cancelEvents = emitted.filter((e) => e.event === 'cancel')
  assert.equal(cancelEvents.length, 1)
})

test('TaskDialog save submission: emits save payload with trimmed data and closes dialog', () => {
  const { exposed, emitted, props } = setupTaskDialog({
    visible: true,
    mode: 'create',
    columnId: 'col-1',
    task: null,
  })

  exposed.title.value = '   New Task Title   '
  exposed.description.value = '  Some description text  '

  exposed.save()

  assert.equal(props.visible, false)
  const saveEvents = emitted.filter((e) => e.event === 'save')
  assert.equal(saveEvents.length, 1)
  const payload = JSON.parse(JSON.stringify(saveEvents[0].args[0]))
  assert.deepEqual(payload, {
    title: 'New Task Title',
    description: 'Some description text',
    mode: 'create',
    columnId: 'col-1',
    taskId: null,
  })
})

const boardSourcePath = resolve(__dirname, '../app/components/kanban/Board.vue')

function setupBoard(initialBoard) {
  const boardSource = readFileSync(boardSourcePath, 'utf8')
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
            moveTask: async (taskId, payload) => {
              apiCalls.push({ type: 'moveTask', taskId, payload })
            },
            createTask: async (columnId, payload) => {
              apiCalls.push({ type: 'createTask', columnId, payload })
            },
            updateTask: async (taskId, payload) => {
              apiCalls.push({ type: 'updateTask', taskId, payload })
            },
            deleteTask: async (taskId) => {
              apiCalls.push({ type: 'deleteTask', taskId })
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
    boardSource,
  }
}

test('Board mounts TaskDialog component in template', () => {
  const boardSource = readFileSync(boardSourcePath, 'utf8')
  assert.ok(
    boardSource.includes('<TaskDialog') || boardSource.includes('<KanbanTaskDialog'),
    'Board.vue must mount TaskDialog component',
  )
})

test('Board provides openCreateTaskDialog, openEditTaskDialog, and task CRUD handlers on kanbanContext', () => {
  const initialBoard = {
    id: 'b-1',
    title: 'Board 1',
    columns: [{ id: 'col-1', title: 'To Do', position: 0, boardId: 'b-1', tasks: [] }],
  }

  const { context } = setupBoard(initialBoard)

  assert.ok(context, 'kanbanContext must be provided')
  assert.equal(typeof context.openCreateTaskDialog, 'function', 'openCreateTaskDialog must be a function')
  assert.equal(typeof context.openEditTaskDialog, 'function', 'openEditTaskDialog must be a function')
  assert.equal(typeof context.createTask, 'function', 'createTask must be a function')
  assert.equal(typeof context.updateTask, 'function', 'updateTask must be a function')
  assert.equal(typeof context.deleteTask, 'function', 'deleteTask must be a function')
})

test('Board openCreateTaskDialog initializes create state and discard issues zero backend calls', () => {
  const initialBoard = {
    id: 'b-1',
    title: 'Board 1',
    columns: [{ id: 'col-1', title: 'To Do', position: 0, boardId: 'b-1', tasks: [] }],
  }

  const { context, exposed, apiCalls } = setupBoard(initialBoard)

  context.openCreateTaskDialog('col-1')

  assert.equal(exposed.isTaskDialogOpen.value, true)
  assert.equal(exposed.dialogMode.value, 'create')
  assert.equal(exposed.activeColumnId.value, 'col-1')
  assert.equal(exposed.activeTask.value, null)

  // Discard / close dialog without saving
  exposed.isTaskDialogOpen.value = false

  assert.equal(apiCalls.length, 0, 'Closing create dialog must make 0 backend API calls')
  assert.equal(exposed.localColumns.value[0].tasks.length, 0, 'No tasks should be created on discard')
})

test('Board openEditTaskDialog initializes edit state and discard issues zero backend calls and preserves task', () => {
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
          { id: 't-1', title: 'Original Task Title', description: 'Original Description', position: 0, columnId: 'col-1' },
        ],
      },
    ],
  }

  const { context, exposed, apiCalls } = setupBoard(initialBoard)
  const task = exposed.localColumns.value[0].tasks[0]

  context.openEditTaskDialog(task)

  assert.equal(exposed.isTaskDialogOpen.value, true)
  assert.equal(exposed.dialogMode.value, 'edit')
  assert.equal(exposed.activeTask.value.id, 't-1')

  // Discard / close dialog without saving
  exposed.isTaskDialogOpen.value = false

  assert.equal(apiCalls.length, 0, 'Closing edit dialog must make 0 backend API calls')
  assert.equal(exposed.localColumns.value[0].tasks[0].title, 'Original Task Title')
  assert.equal(exposed.localColumns.value[0].tasks[0].description, 'Original Description')
})

test('TaskDialog opening and closing transitions reset form cleanly on reopen', async () => {
  const { exposed, props } = setupTaskDialog({
    visible: true,
    mode: 'create',
    columnId: 'col-1',
    task: null,
  })

  // Dirty fields in create mode
  exposed.title.value = 'Abandoned draft'
  exposed.description.value = 'Abandoned note'

  // Transition to closed
  props.visible = false
  await vue.nextTick()
  assert.equal(exposed.isVisible.value, false)

  // Re-open in create mode
  props.visible = true
  await vue.nextTick()
  assert.equal(exposed.isVisible.value, true)
  assert.equal(exposed.title.value, '', 'Re-opening create mode must reset title to blank')
  assert.equal(exposed.description.value, '', 'Re-opening create mode must reset description to blank')
  assert.equal(exposed.isSaveDisabled.value, true, 'Save button must be disabled upon reopen')
})

test('TaskDialog updates form dynamically when active task prop changes while dialog is open', async () => {
  const task1 = { id: 't-1', title: 'Task 1', description: 'Desc 1', position: 0, columnId: 'col-1' }
  const task2 = { id: 't-2', title: 'Task 2', description: 'Desc 2', position: 1, columnId: 'col-1' }

  const { exposed, props } = setupTaskDialog({
    visible: true,
    mode: 'edit',
    columnId: 'col-1',
    task: task1,
  })

  assert.equal(exposed.title.value, 'Task 1')
  assert.equal(exposed.description.value, 'Desc 1')

  // Switch active task prop while open
  props.task = task2
  await vue.nextTick()
  assert.equal(exposed.title.value, 'Task 2')
  assert.equal(exposed.description.value, 'Desc 2')
})

