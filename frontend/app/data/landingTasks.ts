import type { KanbanTaskDto } from '~/api/kanban'

// Local illustration data only. These IDs are never sent to the API.
export const landingTasks = {
  plan: {
    id: 'landing-plan', columnId: 'landing-todo', position: 0,
    title: 'Plan a weekend project', description: 'A few ideas for the garden.',
    priority: 'MEDIUM', tags: [{ id: 'landing-home', name: 'Home' }], totalSeconds: 1200,
  },
  hobby: {
    id: 'landing-hobby', columnId: 'landing-todo', position: 1,
    title: 'Try a new recipe', description: 'Something good for Sunday lunch.',
    priority: 'LOW', tags: [{ id: 'landing-personal', name: 'Personal' }],
  },
  focus: {
    id: 'landing-focus', columnId: 'landing-progress', position: 0,
    title: 'Sketch the next idea', description: 'Make a little time to create.',
    priority: 'MEDIUM', tags: [{ id: 'landing-creative', name: 'Creative' }], totalSeconds: 600,
    timer: {
      taskId: 'landing-focus', mode: 'COUNT_DOWN', targetDurationSeconds: 1500,
      state: 'PAUSED', startedAt: null, lastResumedAt: null, elapsedSeconds: 300,
    },
  },
  done: {
    id: 'landing-done', columnId: 'landing-done-column', position: 0,
    title: 'Pick a place to start', description: 'One small step, done.',
    priority: null, tags: [{ id: 'landing-personal', name: 'Personal' }], totalSeconds: 900,
  },
  shared: {
    id: 'landing-shared', columnId: 'landing-shared-column', position: 0,
    title: 'Plan a weekend away', description: 'Collect a few ideas with friends.',
    priority: 'LOW', tags: [{ id: 'landing-together', name: 'Together' }, { id: 'landing-weekend', name: 'Weekend' }],
    totalSeconds: 1800,
  },
} satisfies Record<string, KanbanTaskDto>
