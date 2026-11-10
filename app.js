const today = new Date();
const dayKey = today.toLocaleDateString('en-CA');
const tasksKey = `focus-tasks-${dayKey}`;
const focusKey = `focus-note-${dayKey}`;

const taskList = document.querySelector('.task-list');
const taskCount = document.querySelector('.task-count');
const completedCount = document.querySelector('.completed-count');
const totalCount = document.querySelector('.total-count');
const progressTrack = document.querySelector('.progress-track');
const progressFill = progressTrack.querySelector('span');
const progressNote = document.querySelector('.progress-note');
const focusInput = document.querySelector('#focus-input');
const timerValue = document.querySelector('.timer-value');
const timerFace = document.querySelector('.timer-face');
const timerCaption = document.querySelector('.timer-caption');
const timerButton = document.querySelector('.start-button');
const resetButton = document.querySelector('.reset-button');
const dateLabel = document.querySelector('.topbar-date span:last-child');

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

function getStartingTasks() {
  return [...taskList.querySelectorAll('.task-row')].map((row) => ({
    id: `${Date.now()}-${Math.random()}`,
    text: row.querySelector('.task-name').textContent.trim(),
    completed: row.classList.contains('is-done'),
    detail: row.querySelector('.task-time')?.textContent.trim() ?? ''
  }));
}

function loadTasks() {
  const saved = readStorage(tasksKey);
  if (saved === null) return getStartingTasks();

  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every((task) => typeof task.text === 'string')) {
      return parsed;
    }
  } catch {
    return getStartingTasks();
  }

  return getStartingTasks();
}

let tasks = loadTasks();

function saveTasks() {
  writeStorage(tasksKey, JSON.stringify(tasks));
}

function makeTaskRow(task) {
  const row = document.createElement('li');
  row.className = `task-row${task.completed ? ' is-done' : ''}`;
  row.dataset.taskId = task.id;

  const checkButton = document.createElement('button');
  checkButton.className = 'check-button';
  checkButton.type = 'button';
  checkButton.setAttribute('aria-pressed', String(task.completed));
  checkButton.setAttribute('aria-label', `Mark ${task.text} ${task.completed ? 'incomplete' : 'complete'}`);
  const checkMark = document.createElement('span');
  if (task.completed) checkMark.textContent = '✓';
  checkButton.append(checkMark);

  const name = document.createElement('span');
  name.className = 'task-name';
  name.textContent = task.text;

  row.append(checkButton, name);
  if (task.detail) {
    const detail = document.createElement('span');
    detail.className = 'task-time';
    detail.textContent = task.detail;
    row.append(detail);
  }

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-button';
  removeButton.type = 'button';
  removeButton.setAttribute('aria-label', `Remove ${task.text}`);
  removeButton.textContent = '×';
  row.append(removeButton);

  return row;
}

function updateProgress() {
  const completed = tasks.filter((task) => task.completed).length;
  const total = tasks.length;
  taskCount.textContent = String(total).padStart(2, '0');
  completedCount.textContent = String(completed);
  totalCount.textContent = `/ ${total}`;
  progressTrack.setAttribute('aria-valuemax', String(total));
  progressTrack.setAttribute('aria-valuenow', String(completed));
  progressFill.style.width = `${total ? (completed / total) * 100 : 0}%`;
  progressNote.textContent = total === 0
    ? 'Add a task to get started.'
    : completed === total
      ? 'All clear. Nice work.'
      : 'You\'re finding your rhythm.';
}

function renderTasks() {
  taskList.replaceChildren(...tasks.map(makeTaskRow));
  if (tasks.length === 0) {
    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'task-row empty-message';
    emptyMessage.textContent = 'Nothing on your list yet.';
    taskList.append(emptyMessage);
  }
  updateProgress();
}

const taskForm = document.createElement('form');
taskForm.className = 'task-entry';
taskForm.hidden = true;
taskForm.innerHTML = '<input type="text" maxlength="120" aria-label="New task" placeholder="What needs doing?" required /><button type="submit">Add</button>';
document.querySelector('.tasks-panel').insertBefore(taskForm, document.querySelector('.add-task-button'));
const taskInput = taskForm.querySelector('input');

function openTaskForm() {
  taskForm.hidden = false;
  taskInput.focus();
}

function closeTaskForm() {
  taskForm.hidden = true;
  taskInput.value = '';
}

document.querySelectorAll('.add-task-button, .icon-button').forEach((button) => {
  button.addEventListener('click', openTaskForm);
});

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  tasks.push({ id: `${Date.now()}-${Math.random()}`, text, completed: false, detail: '' });
  saveTasks();
  renderTasks();
  closeTaskForm();
});

taskInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeTaskForm();
});

taskList.addEventListener('click', (event) => {
  const row = event.target.closest('.task-row[data-task-id]');
  if (!row) return;
  const task = tasks.find((item) => item.id === row.dataset.taskId);
  if (!task) return;

  if (event.target.closest('.check-button')) {
    task.completed = !task.completed;
  } else if (event.target.closest('.remove-button')) {
    tasks = tasks.filter((item) => item.id !== task.id);
  } else {
    return;
  }

  saveTasks();
  renderTasks();
});

renderTasks();

dateLabel.textContent = today.toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric'
}).toUpperCase();

focusInput.value = readStorage(focusKey) ?? focusInput.value;
focusInput.addEventListener('input', () => writeStorage(focusKey, focusInput.value));

const duration = 25 * 60;
let secondsRemaining = duration;
let timerInterval = null;
let deadline = null;

function displayTime() {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  timerValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  timerFace.setAttribute('aria-label', `${minutes} minutes and ${seconds} seconds remaining`);
}

function stopTimer() {
  window.clearInterval(timerInterval);
  timerInterval = null;
  deadline = null;
}

function tick() {
  secondsRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  displayTime();
  if (secondsRemaining === 0) {
    stopTimer();
    timerButton.innerHTML = '<span aria-hidden="true">▶</span> Start again';
    timerCaption.textContent = 'FOCUS COMPLETE';
  }
}

timerButton.addEventListener('click', () => {
  if (timerInterval) {
    secondsRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    stopTimer();
    timerButton.innerHTML = '<span aria-hidden="true">▶</span> Resume focus';
    displayTime();
    return;
  }

  if (secondsRemaining === 0) secondsRemaining = duration;
  deadline = Date.now() + secondsRemaining * 1000;
  timerInterval = window.setInterval(tick, 250);
  timerButton.innerHTML = '<span aria-hidden="true">Ⅱ</span> Pause focus';
  timerCaption.textContent = 'MINUTES OF FOCUS';
});

resetButton.addEventListener('click', () => {
  stopTimer();
  secondsRemaining = duration;
  displayTime();
  timerButton.innerHTML = '<span aria-hidden="true">▶</span> Start focus';
  timerCaption.textContent = 'MINUTES OF FOCUS';
});

displayTime();