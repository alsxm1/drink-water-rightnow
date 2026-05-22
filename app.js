const STORAGE_KEY = "he-kou-shui-state-v1";
const quickAmounts = [100, 200, 300, 500];

const defaultState = {
  settings: {
    goal: 2000,
    interval: 60,
    start: "09:00",
    end: "22:30",
    reminders: false,
    weeklyGoal: 14000,
  },
  entries: {},
  lastReminderAt: null,
};

const els = {
  todayDate: document.querySelector("#todayDate"),
  todayAmount: document.querySelector("#todayAmount"),
  progressText: document.querySelector("#progressText"),
  remainingText: document.querySelector("#remainingText"),
  progressFill: document.querySelector("#progressFill"),
  goalText: document.querySelector("#goalText"),
  quickAmounts: document.querySelector("#quickAmounts"),
  customForm: document.querySelector("#customForm"),
  customAmount: document.querySelector("#customAmount"),
  timeline: document.querySelector("#timeline"),
  entryTemplate: document.querySelector("#entryTemplate"),
  undoEntry: document.querySelector("#undoEntry"),
  reminderToggle: document.querySelector("#reminderToggle"),
  reminderStatus: document.querySelector("#reminderStatus"),
  intervalMinutes: document.querySelector("#intervalMinutes"),
  dailyGoal: document.querySelector("#dailyGoal"),
  weeklyGoal: document.querySelector("#weeklyGoal"),
  wakeStart: document.querySelector("#wakeStart"),
  wakeEnd: document.querySelector("#wakeEnd"),
  saveSettings: document.querySelector("#saveSettings"),
  streakDays: document.querySelector("#streakDays"),
  weeklyAverage: document.querySelector("#weeklyAverage"),
  entryCount: document.querySelector("#entryCount"),
  weeklyChart: document.querySelector("#weeklyChart"),
  chartGoal: document.querySelector("#chartGoal"),
  resetDay: document.querySelector("#resetDay"),
  toast: document.querySelector("#toast"),
  waterCanvas: document.querySelector("#waterCanvas"),
  weeklyTotal: document.querySelector("#weeklyTotal"),
  weeklyRewardGoal: document.querySelector("#weeklyRewardGoal"),
  rewardStatus: document.querySelector("#rewardStatus"),
  rewardFill: document.querySelector("#rewardFill"),
};

let state = loadState();
let reminderTimer = null;
let toastTimer = null;
let animationFrame = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings },
      entries: parsed.entries || {},
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDay(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function todayEntries() {
  const key = todayKey();
  if (!Array.isArray(state.entries[key])) state.entries[key] = [];
  return state.entries[key];
}

function totalForDate(key) {
  return (state.entries[key] || []).reduce((sum, entry) => sum + entry.amount, 0);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function addWater(amount) {
  const safeAmount = Number(String(amount).trim());
  if (!Number.isInteger(safeAmount) || safeAmount <= 0) {
    showToast("请输入 1 到 2000 之间的整数");
    return;
  }

  if (safeAmount > 2000) {
    showToast("单次最多记录 2000 ml");
    return;
  }

  todayEntries().push({
    id: crypto.randomUUID(),
    amount: safeAmount,
    at: new Date().toISOString(),
  });
  state.lastReminderAt = new Date().toISOString();
  saveState();
  render();
  showToast(`已记录 ${safeAmount} ml`);
}

function undoLastEntry() {
  const entries = todayEntries();
  const removed = entries.pop();
  if (!removed) {
    showToast("今天还没有记录");
    return;
  }
  saveState();
  render();
  showToast(`已撤销 ${removed.amount} ml`);
}

function resetToday() {
  const entries = todayEntries();
  if (!entries.length) {
    showToast("今天还没有记录");
    return;
  }

  const shouldReset = window.confirm("确定清空今天的饮水记录吗？");
  if (!shouldReset) return;

  state.entries[todayKey()] = [];
  saveState();
  render();
  showToast("今日记录已清空");
}

function updateSettingsFromForm() {
  state.settings.goal = clamp(Number(els.dailyGoal.value) || 2000, 500, 6000);
  state.settings.weeklyGoal = clamp(Number(els.weeklyGoal.value) || state.settings.goal * 7, 1000, 42000);
  state.settings.interval = clamp(Number(els.intervalMinutes.value) || 60, 30, 120);
  state.settings.start = els.wakeStart.value || "09:00";
  state.settings.end = els.wakeEnd.value || "22:30";
  saveState();
  render();
  scheduleReminder();
  showToast("设置已保存");
}

async function toggleReminders() {
  state.settings.reminders = els.reminderToggle.checked;
  if (state.settings.reminders) {
    state.lastReminderAt = new Date().toISOString();
  }

  if (state.settings.reminders && "Notification" in window && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      showToast("浏览器通知未授权，仍会显示页面提醒");
    }
  }

  saveState();
  render();
  scheduleReminder();
}

function scheduleReminder() {
  window.clearInterval(reminderTimer);
  reminderTimer = null;

  if (!state.settings.reminders) return;

  reminderTimer = window.setInterval(checkReminder, 15 * 1000);
  checkReminder();
}

function checkReminder() {
  if (!state.settings.reminders || !isWithinActiveWindow()) {
    renderReminderStatus();
    return;
  }

  const last = state.lastReminderAt ? new Date(state.lastReminderAt).getTime() : 0;
  const intervalMs = state.settings.interval * 60 * 1000;
  const elapsed = Date.now() - last;

  if (!last || elapsed >= intervalMs) {
    state.lastReminderAt = new Date().toISOString();
    saveState();
    notifyHydration();
  }

  renderReminderStatus();
}

function notifyHydration() {
  showToast("该喝口水了");
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("喝口水", {
      body: "现在补一点水，今天的进度会更轻松。",
      icon: "./icon.svg",
    });
  }
}

function isWithinActiveWindow(date = new Date()) {
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const [startHour, startMinute] = state.settings.start.split(":").map(Number);
  const [endHour, endMinute] = state.settings.end.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  if (start <= end) return minutesNow >= start && minutesNow <= end;
  return minutesNow >= start || minutesNow <= end;
}

function render() {
  const entries = todayEntries();
  const todayTotal = totalForDate(todayKey());
  const goal = state.settings.goal;
  const percent = clamp(Math.round((todayTotal / goal) * 100), 0, 100);
  const remaining = Math.max(goal - todayTotal, 0);

  els.todayDate.textContent = formatDay(new Date());
  els.todayAmount.textContent = todayTotal.toLocaleString("zh-CN");
  els.progressText.textContent = `目标 ${percent}%`;
  els.remainingText.textContent = remaining ? `还差 ${remaining.toLocaleString("zh-CN")} ml` : "今日已达标";
  els.progressFill.style.width = `${percent}%`;
  els.goalText.textContent = `${goal.toLocaleString("zh-CN")} ml`;
  els.chartGoal.textContent = `目标线 ${goal.toLocaleString("zh-CN")} ml`;
  els.entryCount.textContent = `${entries.length} 次`;
  els.undoEntry.disabled = entries.length === 0;

  els.reminderToggle.checked = state.settings.reminders;
  els.intervalMinutes.value = String(state.settings.interval);
  els.dailyGoal.value = String(state.settings.goal);
  els.weeklyGoal.value = String(state.settings.weeklyGoal);
  els.wakeStart.value = state.settings.start;
  els.wakeEnd.value = state.settings.end;

  renderTimeline(entries);
  renderStats();
  renderReward();
  renderWeeklyChart();
  renderReminderStatus();
  drawWater(percent / 100);
}

function renderTimeline(entries) {
  els.timeline.textContent = "";

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "今天第一杯还在路上";
    els.timeline.append(empty);
    return;
  }

  [...entries].reverse().forEach((entry) => {
    const node = els.entryTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("time").textContent = formatTime(entry.at);
    node.querySelector("strong").textContent = `${entry.amount} ml`;
    els.timeline.append(node);
  });
}

function renderStats() {
  const days = recentDays(7);
  const totals = days.map((day) => totalForDate(day.key));
  const average = Math.round(totals.reduce((sum, item) => sum + item, 0) / days.length);

  els.weeklyAverage.textContent = `${average.toLocaleString("zh-CN")} ml`;
  els.streakDays.textContent = `${calculateStreak()} 天`;
}

function renderReward() {
  const week = currentWeekDays();
  const total = week.reduce((sum, day) => sum + totalForDate(day.key), 0);
  const goal = state.settings.weeklyGoal;
  const percent = clamp(Math.round((total / goal) * 100), 0, 100);
  const remaining = Math.max(goal - total, 0);
  const isSunday = new Date().getDay() === 0;

  els.weeklyTotal.textContent = `${total.toLocaleString("zh-CN")} ml`;
  els.weeklyRewardGoal.textContent = `目标 ${goal.toLocaleString("zh-CN")} ml`;
  els.rewardFill.style.width = `${percent}%`;

  if (total >= goal) {
    els.rewardStatus.textContent = isSunday
      ? "本周目标达成，今天可以认真挑一杯奶茶"
      : "奶茶券已解锁，周日来兑现这一杯";
    return;
  }

  els.rewardStatus.textContent = isSunday
    ? `今天结算，还差 ${remaining.toLocaleString("zh-CN")} ml`
    : `还差 ${remaining.toLocaleString("zh-CN")} ml，慢慢补，周日有盼头`;
}

function renderWeeklyChart() {
  const days = recentDays(7);
  const maxValue = Math.max(state.settings.goal, ...days.map((day) => totalForDate(day.key)), 1);

  els.weeklyChart.textContent = "";
  days.forEach((day) => {
    const total = totalForDate(day.key);
    const item = document.createElement("div");
    item.className = "bar-item";
    item.title = `${day.label}: ${total} ml`;

    const rail = document.createElement("div");
    rail.className = "bar-rail";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.height = `${clamp((total / maxValue) * 100, 2, 100)}%`;
    if (total >= state.settings.goal) fill.style.background = "linear-gradient(180deg, #f7c948, #0f766e)";
    rail.append(fill);

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = day.label;

    item.append(rail, label);
    els.weeklyChart.append(item);
  });
}

function recentDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - index - 1));
    const label = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
    return { key: todayKey(date), label };
  });
}

function currentWeekDays() {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { key: todayKey(date) };
  });
}

function calculateStreak() {
  let streak = 0;
  const date = new Date();

  for (let index = 0; index < 365; index += 1) {
    const key = todayKey(date);
    if (totalForDate(key) < state.settings.goal) break;
    streak += 1;
    date.setDate(date.getDate() - 1);
  }

  return streak;
}

function renderReminderStatus() {
  if (!state.settings.reminders) {
    els.reminderStatus.textContent = "提醒未开启";
    return;
  }

  if (!isWithinActiveWindow()) {
    els.reminderStatus.textContent = `休息中，${state.settings.start} 后恢复提醒`;
    return;
  }

  const last = state.lastReminderAt ? new Date(state.lastReminderAt).getTime() : Date.now();
  const next = new Date(last + state.settings.interval * 60 * 1000);
  els.reminderStatus.textContent = `下一次 ${formatTime(next)}，每 ${state.settings.interval} 分钟`;
}

function drawWater(progress) {
  window.cancelAnimationFrame(animationFrame);
  const canvas = els.waterCanvas;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const size = 360;
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const renderFrame = (time) => {
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size / 2, size / 2);

    ctx.beginPath();
    ctx.ellipse(0, 0, 118, 150, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#17211f";
    ctx.stroke();

    ctx.clip();
    const waterHeight = clamp(progress, 0.05, 1) * 286;
    const waterTop = 144 - waterHeight;
    const wave = Math.sin(time / 700) * 7;

    const gradient = ctx.createLinearGradient(0, waterTop, 0, 150);
    gradient.addColorStop(0, "#38bdf8");
    gradient.addColorStop(1, "#0f766e");

    ctx.beginPath();
    ctx.moveTo(-126, waterTop + wave);
    for (let x = -126; x <= 126; x += 8) {
      const y = waterTop + Math.sin(x / 18 + time / 420) * 8 + wave;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(126, 160);
    ctx.lineTo(-126, 160);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.ellipse(-42, waterTop + 46, 42, 12, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();

    ctx.beginPath();
    ctx.arc(84, 66, 24, 0, Math.PI * 2);
    ctx.fillStyle = progress >= 1 ? "#f7c948" : "#9ee6d8";
    ctx.fill();

    animationFrame = window.requestAnimationFrame(renderFrame);
  };

  animationFrame = window.requestAnimationFrame(renderFrame);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2400);
}

function bindEvents() {
  quickAmounts.forEach((amount) => {
    const button = document.createElement("button");
    button.className = "quick-button";
    button.type = "button";
    button.innerHTML = `<span>+${amount}</span><small>ml</small>`;
    button.addEventListener("click", () => addWater(amount));
    els.quickAmounts.append(button);
  });

  els.customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addWater(els.customAmount.value);
    els.customAmount.value = "";
  });

  els.undoEntry.addEventListener("click", undoLastEntry);
  els.resetDay.addEventListener("click", resetToday);
  els.saveSettings.addEventListener("click", updateSettingsFromForm);
  els.reminderToggle.addEventListener("change", toggleReminders);
  window.addEventListener("resize", () => drawWater(totalForDate(todayKey()) / state.settings.goal));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkReminder();
  });
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

bindEvents();
render();
scheduleReminder();
