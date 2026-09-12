const LANES = {
  bugatti:  { name: 'Bugatti',  tag: 'Quick sprints — short tasks you can finish fast', color: '#1c3fae' },
  porsche:  { name: 'Porsche',  tag: 'Deep focus — tasks that need your full attention', color: '#c1121f' },
  defender: { name: 'Defender', tag: 'Long haul — ongoing or heavy tasks', color: '#5c6142' },
  jaguar:   { name: 'Jaguar',   tag: 'Polish — refine and finish things properly', color: '#0e3b2e' },
};
const PRIO_COLOR = { high: '#ff4d4d', medium: '#e8a23d', low: '#3ec97a' };
const STORAGE_KEY = 'garage-tasks-v1';

let tasks = [];
let dismissedAlerts = new Set();
let notifyEnabled = false;

const $ = (id) => document.getElementById(id);

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch (e) {
    tasks = [];
  }
  renderAll();
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.error('Could not save tasks', e);
  }
}

function isToday(ts) {
  const d = new Date(ts), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function formatCountdown(deadline) {
  const diff = deadline - Date.now();
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hrs = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  let str;
  if (days > 0) str = `${days}d ${hrs}h`;
  else if (hrs > 0) str = `${hrs}h ${mins}m`;
  else str = `${mins}m`;
  return overdue ? `Overdue ${str}` : `Due in ${str}`;
}

document.addEventListener('DOMContentLoaded', () => {
  $('taskDeadline').min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  $('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const deadlineVal = $('taskDeadline').value;
    const task = {
      id: Date.now().toString(),
      title: $('taskTitle').value.trim(),
      deadline: new Date(deadlineVal).getTime(),
      duration: parseFloat($('taskDuration').value),
      priority: $('taskPriority').value,
      lane: $('taskLane').value,
      completed: false,
      completedAt: null,
      notified: false,
    };
    tasks.push(task);
    e.target.reset();
    $('taskDuration').value = 1;
    $('taskPriority').value = 'medium';
    saveTasks();
    renderAll();
  });

  $('clearDoneBtn').addEventListener('click', () => {
    tasks = tasks.filter(t => !t.completed);
    saveTasks();
    renderAll();
  });

  $('notifyToggle').addEventListener('click', async () => {
    try {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        notifyEnabled = perm === 'granted';
      }
    } catch (e) {
      notifyEnabled = false;
    }
    $('notifyToggle').textContent = notifyEnabled ? 'Browser alerts on' : 'Browser alerts unavailable here';
    $('notifyToggle').classList.toggle('on', notifyEnabled);
  });

  loadTasks();
  setInterval(checkReminders, 30000);
});

window.toggleComplete = (id) => {
  tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed, completedAt: !t.completed ? Date.now() : null } : t);
  saveTasks();
  renderAll();
};

window.deleteTask = (id) => {
  tasks = tasks.filter(t => t.id !== id);
  dismissedAlerts.delete(id);
  saveTasks();
  renderAll();
};

window.dismissAlert = (id) => {
  dismissedAlerts.add(id);
  renderAlerts();
};

function renderGauges() {
  const active = tasks.filter(t => !t.completed);
  const dueToday = active.filter(t => isToday(t.deadline)).length;
  const hours = active.reduce((s, t) => s + t.duration, 0);
  const doneToday = tasks.filter(t => t.completed && t.completedAt && isToday(t.completedAt)).length;
  $('gauges').innerHTML = `
    <div class="gauge"><div class="num mono">${active.length}</div><div class="lbl">Active tasks</div></div>
    <div class="gauge"><div class="num mono">${dueToday}</div><div class="lbl">Due today</div></div>
    <div class="gauge"><div class="num mono">${hours}</div><div class="lbl">Hours queued</div></div>
    <div class="gauge"><div class="num mono">${doneToday}</div><div class="lbl">Finished today</div></div>
  `;
}

function renderAlerts() {
  const now = Date.now();
  const urgent = tasks.filter(t => !t.completed && (t.deadline - now) <= 15 * 60000 && !dismissedAlerts.has(t.id));
  const strip = $('alertStrip');
  if (urgent.length === 0) {
    strip.classList.remove('show');
    strip.innerHTML = '';
    return;
  }
  strip.classList.add('show');
  strip.innerHTML = urgent.map(t => `
    <div class="alert-item">
      <span>${escapeHtml(t.title)} — ${formatCountdown(t.deadline)}</span>
      <button onclick="dismissAlert('${t.id}')">Dismiss</button>
    </div>
  `).join('');
}

function renderBoard() {
  const board = $('board');
  board.innerHTML = Object.keys(LANES).map(laneKey => {
    const lane = LANES[laneKey];
    const laneTasks = tasks
      .filter(t => t.lane === laneKey)
      .sort((a, b) => (a.completed - b.completed) || (a.deadline - b.deadline));
    const body = laneTasks.length === 0
      ? `<div class="bay-empty">No tasks queued here yet — add one above and assign it to this bay.</div>`
      : laneTasks.map(t => `
        <div class="task-card ${t.completed ? 'done' : ''}" style="--prio-color:${PRIO_COLOR[t.priority]}">
          <div class="title">${escapeHtml(t.title)}</div>
          <div class="meta">
            <span class="prio-pill"><span class="prio-dot"></span>${t.priority}</span>
            <span class="countdown ${(!t.completed && t.deadline < Date.now()) ? 'overdue' : ''}">${t.completed ? 'Done' : formatCountdown(t.deadline)}</span>
          </div>
          <div class="task-actions">
            <button onclick="toggleComplete('${t.id}')">${t.completed ? 'Undo' : 'Mark done'}</button>
            <button class="del" onclick="deleteTask('${t.id}')">Delete</button>
          </div>
        </div>
      `).join('');
    return `
      <div class="bay" style="--lane-color:${lane.color}">
        <div class="bay-head">
          <div class="name">${lane.name}</div>
          <div class="tag">${lane.tag}</div>
        </div>
        <div class="bay-body">${body}</div>
      </div>
    `;
  }).join('');
}

function renderQueue() {
  const active = tasks.filter(t => !t.completed).sort((a, b) => a.deadline - b.deadline).slice(0, 10);
  const list = $('queueList');
  if (active.length === 0) {
    list.innerHTML = `<div class="empty-note">No active tasks on the queue.</div>`;
    return;
  }
  const maxHours = Math.max(...active.map(t => t.duration), 1);
  list.innerHTML = active.map(t => {
    const widthPct = Math.max((t.duration / maxHours) * 100, 12);
    const lane = LANES[t.lane];
    return `
      <div class="queue-row">
        <div class="queue-label">${escapeHtml(t.title)}</div>
        <div class="queue-track">
          <div class="queue-bar" style="width:${widthPct}%; --lane-color:${lane.color}">${t.duration}h</div>
        </div>
        <div class="queue-time">${formatCountdown(t.deadline)}</div>
      </div>
    `;
  }).join('');
}

function checkReminders() {
  const now = Date.now();
  let changed = false;
  tasks.forEach(t => {
    if (!t.completed && (t.deadline - now) > 0 && (t.deadline - now) <= 15 * 60000 && !t.notified) {
      t.notified = true;
      changed = true;
      if (notifyEnabled) {
        try {
          new Notification(`Due soon: ${t.title}`, { body: 'Less than 15 minutes left.' });
        } catch (e) {}
      }
    }
  });
  if (changed) saveTasks();
  renderAll();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderAll() {
  renderGauges();
  renderAlerts();
  renderBoard();
  renderQueue();
}
