import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { dailyQuotes } from "./daily-quotes.js";

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const state = {
  auth: null,
  db: null,
  user: null,
  tasks: [],
  focusSeconds: 0,
  focusSessions: 0,
  timer: null,
  timerEnd: 0,
  timerStarted: null,
  timerTotal: 25 * 60,
  timerRemaining: null,
  timerCompleted: false,
  timerCompletionHandled: false,
  audioContext: null,
  toastTimer: null,
  progressPercent: null,
  progressAnimationFrame: null,
  progressComplete: false,
  dailyQuoteTimer: null,
  dailyQuoteListenersBound: false
};
const icons = {
  calendar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  leaf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 4c-9 0-15 3-15 10a6 6 0 0 0 6 6c7 0 9-7 9-16Z"/><path d="M4 20c3-5 7-8 12-10"/></svg>'
};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const initials = (name) => name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
const humanDate = () => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dailyQuoteIndex = (date) => {
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return ((dayNumber % dailyQuotes.length) + dailyQuotes.length) % dailyQuotes.length;
};
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};
const userCollection = (collectionName) => collection(state.db, "members", state.user.uid, collectionName);
const userDocument = (collectionName, id) => doc(state.db, "members", state.user.uid, collectionName, id);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function updateDailyQuote() {
  const quote = document.querySelector("#daily-quote");
  if (!quote || dailyQuotes.length !== 365) return;

  const now = new Date();
  const dateKey = localDateKey(now);
  if (quote.dataset.localDate !== dateKey) {
    quote.textContent = `“${dailyQuotes[dailyQuoteIndex(now)]}”`;
    quote.dataset.localDate = dateKey;
  }
  clearTimeout(state.dailyQuoteTimer);
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  state.dailyQuoteTimer = setTimeout(updateDailyQuote, Math.max(1, nextMidnight.getTime() - Date.now() + 25));

  if (!state.dailyQuoteListenersBound) {
    window.addEventListener("focus", updateDailyQuote);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) updateDailyQuote();
    });
    state.dailyQuoteListenersBound = true;
  }
}

function authShell({ title, subtitle, content, formId, buttonText, switchText, switchAction, mobileBrand = true }) {
  app.innerHTML = `
    <section class="auth-wrap">
      <div class="auth-art">
        <div class="auth-brand"><span class="brand-mark">s</span><span>stillpoint</span></div>
        <div class="auth-art-copy">
          <p class="eyebrow">A quieter kind of productivity</p>
          <h1>Make room<br>for what matters.</h1>
          <p>One thoughtful step at a time. Find your rhythm, protect your focus, and end the day a little lighter.</p>
        </div>
        <div class="auth-foot">A calm space for focused work.</div>
      </div>
      <div class="auth-panel">
        <div class="auth-card">
          ${mobileBrand ? '<div class="auth-brand mobile-only"><span class="brand-mark">s</span><span>stillpoint</span></div>' : ""}
          <h2>${title}</h2><p class="subhead">${subtitle}</p>
          ${formId ? `<form id="${formId}">${content || ""}<p class="form-error" id="form-error" role="alert"></p>${buttonText ? `<button class="primary-btn full" type="submit">${buttonText}</button>` : ""}</form>` : content || ""}
          ${switchText ? `<p class="auth-switch">${switchText} <button type="button" id="auth-switch">${switchAction}</button></p>` : ""}
        </div>
      </div>
    </section>`;
}

function setFormError(message) {
  const el = document.querySelector("#form-error");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
}

function friendlyAuthError(error) {
  if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
    return "Email or password is incorrect.";
  }
  if (error.code === "auth/too-many-requests") return "Too many attempts. Wait a little and try again.";
  if (error.code === "auth/network-request-failed") return "Unable to reach Firebase. Check your connection and try again.";
  if (error.code === "auth/invalid-email") return "Enter a valid email address.";
  if (error.code === "auth/user-disabled") return "This account has been disabled.";
  if (error.code === "auth/email-already-in-use") return "An account already uses this email. Try signing in instead.";
  if (error.code === "auth/weak-password") return "Choose a stronger password with at least 8 characters.";
  if (error.code === "auth/operation-not-allowed") return "Email and password sign-in is not enabled for this Firebase project.";
  if (error.code === "auth/api-key-not-valid" || error.code === "auth/invalid-api-key") {
    return "Firebase rejected this API key. In Firebase Project settings → General → Your apps, copy the web app's apiKey again (not a different Google API key) and confirm it belongs to stillpoint-productivity. Keep API restrictions limited to Identity Toolkit API and Token Service API.";
  }
  return error.message || "Something went wrong. Please try again.";
}

function renderLogin(error = "") {
  authShell({
    title: "Welcome back",
    subtitle: "Sign in to your private focus space.",
    formId: "login-form",
    buttonText: "Sign in",
    switchText: "New to Stillpoint?",
    switchAction: "Create an account",
    content: `
      <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required maxlength="254"></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Your password" required maxlength="200"></div>
      <button class="text-btn forgot-password" id="forgot-password" type="button">Forgot your password?</button>`
  });
  if (error) setFormError(error);
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      await signInWithEmailAndPassword(state.auth, String(form.get("email")).trim(), String(form.get("password")));
    } catch (authError) {
      setFormError(friendlyAuthError(authError));
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });
  document.querySelector("#forgot-password").addEventListener("click", async () => {
    const email = document.querySelector("#email").value.trim();
    if (!email) return setFormError("Enter your email address first, then choose password reset.");
    try {
      await sendPasswordResetEmail(state.auth, email);
      setFormError("If this email belongs to an account, Firebase will send password reset instructions.");
    } catch (authError) {
      setFormError(friendlyAuthError(authError));
    }
  });
  document.querySelector("#auth-switch").addEventListener("click", () => renderSignup());
}

function renderSignup(error = "") {
  authShell({
    title: "Make room for focus",
    subtitle: "Create your private Stillpoint account.",
    formId: "signup-form",
    buttonText: "Create account",
    switchText: "Already have an account?",
    switchAction: "Sign in",
    content: `
      <div class="field"><label for="signup-name">Your name</label><input id="signup-name" name="name" type="text" autocomplete="name" placeholder="Your name" required maxlength="100"></div>
      <div class="field"><label for="signup-email">Email address</label><input id="signup-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254"></div>
      <div class="field"><label for="signup-password">Password</label><input id="signup-password" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" required minlength="8" maxlength="200"></div>
      <div class="field"><label for="signup-confirm">Confirm password</label><input id="signup-confirm" name="confirm" type="password" autocomplete="new-password" placeholder="Enter your password again" required minlength="8" maxlength="200"></div>`
  });
  if (error) setFormError(error);
  document.querySelector("#signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (!name || name.length > 100) return setFormError("Enter a name between 1 and 100 characters.");
    if (password !== form.get("confirm")) return setFormError("Those passwords don’t match.");
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "Creating account…";
    try {
      const credential = await createUserWithEmailAndPassword(state.auth, email, password);
      await updateProfile(credential.user, { displayName: name });
    } catch (authError) {
      setFormError(friendlyAuthError(authError));
      button.disabled = false;
      button.textContent = "Create account";
    }
  });
  document.querySelector("#auth-switch").addEventListener("click", () => renderLogin());
}

function renderSetupNeeded() {
  authShell({
    title: "One small setup step",
    subtitle: "Add your Firebase web app settings to firebase-config.js to connect Stillpoint to your project.",
    mobileBrand: true,
    content: '<p class="form-error visible">The Firebase web configuration has not been filled in. It is safe to put Firebase’s public web-app values in this file; never add service-account keys or passwords.</p>'
  });
}

async function loadDashboard() {
  const taskSnapshot = await getDocs(query(userCollection("tasks"), where("dueDate", "==", today())));
  state.tasks = taskSnapshot.docs.map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data() }));
  state.tasks.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return aTime - bTime;
  });
  const focusSnapshot = await getDocs(query(userCollection("focusSessions"), where("focusDate", "==", today())));
  state.focusSessions = focusSnapshot.size;
  state.focusSeconds = focusSnapshot.docs.reduce((seconds, session) => seconds + session.data().durationSeconds, 0);
  renderDashboard();
}

async function onSignedIn(user) {
  if (state.user?.uid !== user.uid) {
    if (state.progressAnimationFrame !== null) cancelAnimationFrame(state.progressAnimationFrame);
    state.progressPercent = null;
    state.progressAnimationFrame = null;
    state.progressComplete = false;
  }
  state.user = user;
  app.innerHTML = '<div class="loading-screen"><span class="brand-mark">s</span><p>Making a little room…</p></div>';
  try {
    await loadDashboard();
  } catch (error) {
    renderDataError(error);
  }
}

function renderDataError(error) {
  const message = friendlyDataError(error);
  app.innerHTML = `<div class="center-screen"><span class="brand-mark">s</span><p>${escapeHtml(message)}</p><div class="error-actions"><button class="secondary-btn" data-action="retry">Try again</button><button class="text-btn" data-action="logout">Sign out</button></div></div>`;
  app.querySelector('[data-action="retry"]').addEventListener("click", () => onSignedIn(state.user));
  app.querySelector('[data-action="logout"]').addEventListener("click", () => signOut(state.auth).catch((signOutError) => showToast(friendlyAuthError(signOutError))));
}

function renderDashboard() {
  const tasks = state.tasks;
  const completed = tasks.filter((task) => task.completed).length;
  const percent = tasks.length && completed === tasks.length
    ? 100
    : tasks.length ? (completed / tasks.length) * 100 : 0;
  const percentLabel = percent === 100 ? 100 : Math.min(99, Math.round(percent));
  const focusMinutes = Math.floor(state.focusSeconds / 60);
  const name = state.user.displayName || state.user.email.split("@")[0];
  const taskMarkup = tasks.length ? tasks.map((task) => `
    <div class="task-row ${task.completed ? "done" : ""}">
      <input class="task-check" type="checkbox" aria-label="Mark ${escapeHtml(task.title)} complete" data-task-check="${escapeHtml(task.id)}" ${task.completed ? "checked" : ""}>
      <span class="task-title">${escapeHtml(task.title)}</span>
      <button class="icon-btn delete-task" aria-label="Delete task" data-task-delete="${escapeHtml(task.id)}">×</button>
    </div>`).join("") : '<div class="empty-tasks">Your list is clear. Add one small thing to begin.</div>';
  app.innerHTML = `
    <div class="dashboard">
      <header class="topbar">
        <a class="topbar-brand" href="./" aria-label="Stillpoint home"><span class="brand-mark">s</span><span>stillpoint</span></a>
        <div class="top-actions">
          <div class="user-chip"><span class="avatar">${escapeHtml(initials(name))}</span><span>${escapeHtml(name)}</span></div>
          <button class="text-btn" data-action="logout">Sign out</button>
        </div>
      </header>
      <section class="welcome-row">
        <div><p class="eyebrow">${escapeHtml(greeting())}, ${escapeHtml(name.split(/\s+/)[0])}</p><h1>What deserves your focus?</h1></div>
        <div class="date-pill">${icons.calendar}<span>${escapeHtml(humanDate())}</span></div>
      </section>
      <div class="dashboard-grid">
        <div class="left-column">
          <section class="card focus-card">
            <div class="card-heading"><div><p class="eyebrow">Your quiet moment</p><h2>Focus session</h2></div><span class="quote-icon">${icons.leaf}</span></div>
            <div class="timer-body">
              <div class="timer-ring" id="timer-ring"><div class="timer-display"><strong id="timer-display">25:00</strong><span id="timer-caption">ready when you are</span></div></div>
              <div class="timer-controls">
                <button class="primary-btn" id="timer-toggle">Start focus</button>
                <button class="text-btn" id="timer-reset">Reset timer</button>
                <label class="timer-note" for="duration">Session length</label>
                <select class="duration-select" id="duration" aria-label="Focus session length">
                  <option value="25">25 minutes</option><option value="50">50 minutes</option><option value="90">90 minutes</option>
                </select>
              </div>
            </div>
            <p class="timer-completion" id="timer-completion" role="status" aria-live="polite" ${state.timerCompleted ? "" : "hidden"}>Your Stillpoint session is complete</p>
          </section>
          <section class="card tasks-card">
            <div class="card-heading"><div><h2>Today’s priorities</h2><p>A short list is a kind list.</p></div><span class="eyebrow compact-eyebrow">${completed}/${tasks.length} done</span></div>
            <form class="task-form" id="task-form"><input class="task-input" name="title" maxlength="160" placeholder="Add a task to today…" aria-label="New task" required><button class="primary-btn" type="submit">Add task</button></form>
            <div class="task-list">${taskMarkup}</div>
          </section>
        </div>
        <div class="right-column">
          <section class="card progress-card">
            <div class="card-heading"><div><h2>Your progress</h2><p>A little progress adds up.</p></div></div>
            <div class="progress-content">
              <div class="progress-ring" id="progress-ring" role="img" aria-label="${percentLabel}% complete">
                <svg class="progress-ring-svg" viewBox="0 0 100 100" aria-hidden="true">
                  <circle class="progress-track" cx="50" cy="50" r="43"></circle>
                  <circle class="progress-fill" id="progress-fill" cx="50" cy="50" r="43"></circle>
                </svg>
                <svg class="progress-check" id="progress-check" viewBox="0 0 40 40" aria-hidden="true"><path d="m9 20 7 7 15-16"></path></svg>
              </div>
              <div class="progress-copy"><strong id="progress-percent-text">${percentLabel}% complete</strong><span>${tasks.length ? `${completed} of ${tasks.length} priorities${completed === tasks.length ? " · You made space for what matters." : " · Keep your attention on one thing at a time."}` : "A fresh start"}</span></div>
            </div>
            <div class="mini-stats"><div class="mini-stat"><span>Focus today</span><strong>${focusMinutes}<small class="stat-unit"> min</small></strong></div><div class="mini-stat"><span>Sessions</span><strong>${state.focusSessions}</strong></div></div>
          </section>
          <aside class="card quote-card"><span class="quote-icon">${icons.leaf}</span><div><p id="daily-quote"></p><span>Pause. Breathe. Begin again.</span></div></aside>
        </div>
      </div>
      <footer class="dashboard-footer">Your space, your pace. Your work stays yours.</footer>
    </div>`;
  bindDashboard();
  animateProgressIndicator(percent);
  updateDailyQuote();
  updateTimerDisplay();
}

function animateProgressIndicator(targetPercent) {
  const ring = document.querySelector("#progress-ring");
  const fill = document.querySelector("#progress-fill");
  const percentText = document.querySelector("#progress-percent-text");
  const check = document.querySelector("#progress-check path");
  if (!ring || !fill || !percentText || !check) return;

  if (state.progressAnimationFrame !== null) cancelAnimationFrame(state.progressAnimationFrame);
  state.progressAnimationFrame = null;
  const previousPercent = state.progressPercent ?? targetPercent;
  const startPercent = targetPercent < 100 ? Math.min(previousPercent, 99) : previousPercent;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAnimate = !reducedMotion && state.progressPercent !== null && startPercent !== targetPercent;
  const animateCheck = !reducedMotion && targetPercent === 100 && !state.progressComplete;
  const completesProgress = targetPercent === 100 && state.progressPercent !== null && previousPercent < 100 && !state.progressComplete;
  if (targetPercent < 100) {
    ring.classList.remove("complete");
    state.progressComplete = false;
  }

  const circumference = 2 * Math.PI * 43;
  const setProgress = (percent) => {
    state.progressPercent = percent;
    const percentLabel = percent === 100 ? 100 : Math.min(99, Math.round(percent));
    fill.style.strokeDasharray = String(circumference);
    fill.style.strokeDashoffset = String(circumference * (1 - percent / 100));
    percentText.textContent = `${percentLabel}% complete`;
    ring.setAttribute("aria-label", `${percentLabel}% complete`);
  };
  const showCheck = (animated) => {
    check.style.strokeDashoffset = animated ? "32" : "0";
    if (animated) requestAnimationFrame(() => { check.style.strokeDashoffset = "0"; });
  };

  if (!shouldAnimate) {
    setProgress(targetPercent);
    check.style.strokeDashoffset = "0";
    if (targetPercent === 100) {
      ring.classList.add("complete");
      state.progressComplete = true;
      if (completesProgress) playProgressCompleteChime();
    }
    return;
  }

  setProgress(startPercent);
  if (targetPercent < 100) check.style.strokeDashoffset = "32";
  const startedAt = performance.now();
  const duration = 850;
  const animate = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    setProgress(startPercent + (targetPercent - startPercent) * eased);
    if (progress < 1) {
      state.progressAnimationFrame = requestAnimationFrame(animate);
    } else {
      state.progressAnimationFrame = null;
      setProgress(targetPercent);
      if (targetPercent === 100) {
        ring.classList.add("complete");
        if (animateCheck) showCheck(true);
        state.progressComplete = true;
        if (completesProgress) playProgressCompleteChime();
      }
    }
  };
  state.progressAnimationFrame = requestAnimationFrame(animate);
}

function bindDashboard() {
  document.querySelector('[data-action="logout"]').addEventListener("click", async () => {
    try {
      await signOut(state.auth);
      resetTimerState();
    } catch (error) {
      showToast(friendlyAuthError(error));
    }
  });
  document.querySelector("#task-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.title;
    const title = input.value.trim();
    if (!title || title.length > 160) return;
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await addDoc(userCollection("tasks"), {
        title,
        dueDate: today(),
        completed: false,
        createdAt: serverTimestamp(),
        completedAt: null
      });
      await loadDashboard();
      showToast("Added to today’s priorities.");
    } catch (error) {
      showToast(friendlyDataError(error));
      button.disabled = false;
    }
  });
  document.querySelectorAll("[data-task-check]").forEach((checkbox) => checkbox.addEventListener("change", async () => {
    if (checkbox.checked) prepareAudioContext();
    try {
      await updateDoc(userDocument("tasks", checkbox.dataset.taskCheck), {
        completed: checkbox.checked,
        completedAt: checkbox.checked ? serverTimestamp() : null
      });
      await loadDashboard();
    } catch (error) {
      showToast(friendlyDataError(error));
      checkbox.checked = !checkbox.checked;
    }
  }));
  document.querySelectorAll("[data-task-delete]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await deleteDoc(userDocument("tasks", button.dataset.taskDelete));
      await loadDashboard();
    } catch (error) {
      showToast(friendlyDataError(error));
    }
  }));
  const duration = document.querySelector("#duration");
  duration.value = String(state.timerTotal / 60);
  duration.disabled = Boolean(state.timer);
  document.querySelector("#timer-toggle").textContent = state.timer ? "Pause" : state.timerRemaining !== null ? "Resume focus" : "Start focus";
  if (state.timer) document.querySelector("#timer-caption").textContent = "you’re doing great";
  else if (state.timerRemaining !== null) document.querySelector("#timer-caption").textContent = "paused";
  duration.addEventListener("change", () => {
    if (state.timer) return;
    state.timerTotal = Number(duration.value) * 60;
    state.timerRemaining = null;
    updateTimerDisplay(state.timerTotal);
  });
  document.querySelector("#timer-toggle").addEventListener("click", toggleTimer);
  document.querySelector("#timer-reset").addEventListener("click", resetTimer);
}

function friendlyDataError(error) {
  if (error.code === "permission-denied") return "You don’t have permission to change this data.";
  if (error.code === "unavailable") return "Stillpoint can’t reach Firebase right now. Check your connection and try again.";
  return error.message || "Something went wrong. Please try again.";
}

function updateTimerDisplay(seconds = state.timer ? Math.max(0, Math.ceil((state.timerEnd - Date.now()) / 1000)) : state.timerRemaining ?? state.timerTotal) {
  const display = document.querySelector("#timer-display");
  if (!display) return;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  display.textContent = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  const ring = document.querySelector("#timer-ring");
  const elapsed = state.timerTotal - seconds;
  ring.style.setProperty("--progress", `${Math.min(360, Math.max(0, elapsed / state.timerTotal * 360))}deg`);
}

function toggleTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
    state.timerRemaining = Math.max(0, Math.ceil((state.timerEnd - Date.now()) / 1000));
    document.querySelector("#timer-toggle").textContent = "Resume focus";
    document.querySelector("#timer-caption").textContent = "paused";
    document.querySelector("#duration").disabled = false;
    updateTimerDisplay(state.timerRemaining);
    return;
  }
  if (state.timerRemaining === null) {
    state.timerRemaining = state.timerTotal;
    state.timerStarted = new Date();
    state.timerCompleted = false;
    state.timerCompletionHandled = false;
    document.querySelector("#timer-completion").hidden = true;
    requestTimerNotificationPermission();
  }
  prepareTimerFeedback();
  state.timerEnd = Date.now() + state.timerRemaining * 1000;
  document.querySelector("#timer-toggle").textContent = "Pause";
  document.querySelector("#timer-caption").textContent = "you’re doing great";
  document.querySelector("#duration").disabled = true;
  state.timer = setInterval(async () => {
    const remaining = Math.max(0, Math.ceil((state.timerEnd - Date.now()) / 1000));
    updateTimerDisplay(remaining);
    if (remaining === 0) await finishTimer();
  }, 250);
}

function requestTimerNotificationPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch((error) => {
        console.warn("Unable to request notification permission.", error);
      });
    }
  } catch (error) {
    console.warn("Unable to request notification permission.", error);
  }
}

function prepareTimerFeedback() {
  prepareAudioContext();
}

function prepareAudioContext() {
  try {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    state.audioContext ??= new AudioContextConstructor();
    if (state.audioContext.state === "suspended") {
      void state.audioContext.resume().catch((error) => {
        console.warn("Unable to enable the session chime.", error);
      });
    }
  } catch (error) {
    console.warn("Unable to enable the session chime.", error);
  }
}

function playProgressCompleteChime() {
  const context = state.audioContext;
  if (!context) return;

  const play = () => {
    try {
      const now = context.currentTime;
      const tones = [
        { frequency: 880, volume: 0.035, start: 0 },
        { frequency: 1174.66, volume: 0.012, start: 0.025 }
      ];
      for (const tone of tones) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + tone.start;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.3);
      }
    } catch (error) {
      console.warn("Unable to play the progress completion sound.", error);
    }
  };

  try {
    if (context.state === "running") {
      play();
      return;
    }
    void context.resume().then(play).catch((error) => {
      console.warn("Unable to play the progress completion sound.", error);
    });
  } catch (error) {
    console.warn("Unable to play the progress completion sound.", error);
  }
}

function playCompletionChime() {
  const context = state.audioContext;
  if (!context) return;

  const play = () => {
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.setValueAtTime(880, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.4);
    } catch (error) {
      console.warn("Unable to play the session chime.", error);
    }
  };

  try {
    if (context.state === "running") {
      play();
      return;
    }
    void context.resume().then(play).catch((error) => {
      console.warn("Unable to play the session chime.", error);
    });
  } catch (error) {
    console.warn("Unable to play the session chime.", error);
  }
}

function showCompletionNotification() {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification("Stillpoint", { body: "Your Stillpoint session is complete" });
  } catch (error) {
    console.warn("Unable to show the session notification.", error);
  }
}

async function finishTimer() {
  if (state.timerCompletionHandled) return;
  state.timerCompletionHandled = true;
  clearInterval(state.timer);
  state.timer = null;
  state.timerCompleted = true;
  document.querySelector("#timer-completion").hidden = false;
  playCompletionChime();
  showCompletionNotification();
  const durationSeconds = state.timerTotal;
  const startedAt = state.timerStarted || new Date(Date.now() - durationSeconds * 1000);
  state.timerStarted = null;
  state.timerRemaining = null;
  const selectedMinutes = Number(document.querySelector("#duration")?.value || 25);
  state.timerTotal = selectedMinutes * 60;
  const button = document.querySelector("#timer-toggle");
  if (button) button.textContent = "Start focus";
  const caption = document.querySelector("#timer-caption");
  if (caption) caption.textContent = "well deserved";
  const length = document.querySelector("#duration");
  if (length) length.disabled = false;
  updateTimerDisplay(state.timerTotal);
  try {
    await addDoc(userCollection("focusSessions"), {
      durationSeconds,
      startedAt: Timestamp.fromDate(startedAt),
      focusDate: today(),
      completedAt: serverTimestamp()
    });
    await loadDashboard();
    showToast("Focus session complete. Take a gentle break.");
  } catch (error) {
    showToast(friendlyDataError(error));
  }
}

function resetTimer() {
  clearInterval(state.timer);
  state.timer = null;
  const duration = document.querySelector("#duration");
  if (duration) {
    duration.disabled = false;
    state.timerTotal = Number(duration.value) * 60;
  }
  state.timerRemaining = null;
  state.timerStarted = null;
  state.timerCompleted = false;
  state.timerCompletionHandled = false;
  const completionMessage = document.querySelector("#timer-completion");
  if (completionMessage) completionMessage.hidden = true;
  const button = document.querySelector("#timer-toggle");
  const caption = document.querySelector("#timer-caption");
  if (button) button.textContent = "Start focus";
  if (caption) caption.textContent = "ready when you are";
  updateTimerDisplay(state.timerTotal);
}

function resetTimerState() {
  clearInterval(state.timer);
  state.timer = null;
  state.timerRemaining = null;
  state.timerStarted = null;
  state.timerTotal = 25 * 60;
  state.timerCompleted = false;
  state.timerCompletionHandled = false;
}

function configIsReady(config) {
  return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_");
  });
}

if (!configIsReady(firebaseConfig)) {
  renderSetupNeeded();
} else {
  const firebaseApp = initializeApp(firebaseConfig);
  state.auth = getAuth(firebaseApp);
  state.db = getFirestore(firebaseApp);
  onAuthStateChanged(state.auth, (user) => {
    if (!user) {
      state.user = null;
      state.tasks = [];
      state.focusSeconds = 0;
      state.focusSessions = 0;
      resetTimerState();
      renderLogin();
      return;
    }
    onSignedIn(user);
  });
}
