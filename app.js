const pageViews = document.querySelectorAll('.page-view');
const breadcrumbCurrent = document.querySelector('#breadcrumb-current');
const authScreen = document.querySelector('#auth-screen');
const appSidebar = document.querySelector('#app-sidebar');
const appMain = document.querySelector('#app-main');
const sessionKey = 'project-josh-session';
const sidebarStateKey = 'project-josh-sidebar-collapsed';
const adminAccount = { email: 'admin@projectjosh.gov', password: 'northstar', name: 'Jordan Smith', role: 'Administrator' };

let currentSession = JSON.parse(localStorage.getItem(sessionKey) || 'null');
let navItems = document.querySelectorAll('[data-view]');
let overviewReports = [];

function setSidebarState(isCollapsed) {
  document.body.classList.toggle('sidebar-collapsed', isCollapsed);
  const toggle = document.querySelector('#sidebar-toggle');
  if (!toggle) return;
  toggle.setAttribute('aria-expanded', String(!isCollapsed));
  toggle.setAttribute('aria-label', isCollapsed ? 'Expand navigation' : 'Collapse navigation');
  toggle.innerHTML = `<span>${isCollapsed ? '→' : '←'}</span>`;
}

function showView(viewName) {
  pageViews.forEach((view) => view.classList.toggle('active-view', view.id === `${viewName}-view`));
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  const activeItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  breadcrumbCurrent.textContent = activeItem ? activeItem.textContent.trim() : viewName.replace('-', ' ');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function api(action, options = {}) {
  const response = await fetch(`api.php?action=${action}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The server could not complete that request.');
  return data;
}

function getCurrentUser() {
  return currentSession || { name: 'Jordan Smith', role: 'admin', option: 'Public Administration' };
}

function fillProfileForm(user) {
  document.querySelector('#profile-edit-name').value = user.name || '';
  document.querySelector('#profile-edit-reg-no').value = user.regNo || '';
  document.querySelector('#profile-edit-option').value = user.option || 'Public Administration';
}

async function loadWorkspaceSettings() {
  if (!currentSession?.id) return;
  try {
    const { settings } = await api(`settings&accountId=${currentSession.id}`);
    const workspaceName = document.querySelector('#workspace-name');
    if (workspaceName) workspaceName.textContent = settings.workspaceName;
    const workspaceInput = document.querySelector('#settings-workspace-name');
    const defaultUnit = document.querySelector('#settings-default-unit');
    if (workspaceInput) workspaceInput.value = settings.workspaceName;
    if (defaultUnit) defaultUnit.value = settings.defaultUnit;
    const timezone = document.querySelector('#settings-timezone');
    const notifications = document.querySelector('#settings-email-notifications');
    if (timezone) timezone.value = settings.timezone;
    if (notifications) notifications.checked = Boolean(Number(settings.emailNotifications));
  } catch (error) { console.error(error); }
}

function setMessage(id, message, isError = false) {
  const element = document.querySelector(`#${id}`);
  element.textContent = message;
  element.classList.toggle('error-message', isError);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

async function renderOverview() {
  if (!currentSession) return;
  const isAdmin = currentSession.role === 'admin';
  const query = isAdmin ? '' : `&accountId=${currentSession.id}`;
  try {
    const { metrics, recentReports, activity, deadlines } = await api(`overview${query}`);
    overviewReports = recentReports;
    const now = new Date();
    document.querySelector('#overview-date').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now);
    document.querySelector('#overview-greeting').textContent = `${now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${currentSession.name.split(' ')[0]}.`;
    document.querySelector('#metric-total-reports').textContent = metrics.totalReports;
    document.querySelector('#metric-awaiting-review').textContent = metrics.awaitingReview;
    document.querySelector('#metric-published-reports').textContent = metrics.publishedReports;
    document.querySelector('#metric-active-officials').textContent = metrics.activeOfficials;
    const notificationButton = document.querySelector('#notification-button');
    const notificationCount = document.querySelector('#notification-count');
    notificationCount.textContent = metrics.awaitingReview;
    notificationCount.classList.toggle('hidden', metrics.awaitingReview < 1);
    notificationButton.setAttribute('aria-label', metrics.awaitingReview ? `${metrics.awaitingReview} reports awaiting review` : 'No pending notifications');
    const maxCount = Math.max(...activity.map((item) => Number(item.reportCount)), 1);
    document.querySelector('#activity-bars').innerHTML = activity.length ? activity.map((item) => `<i style="height:${Math.max(4, Number(item.reportCount) / maxCount * 100)}%" title="${item.reportCount} reports"></i>`).join('') : '<p class="data-empty">No report activity recorded yet.</p>';
    document.querySelector('#activity-labels').innerHTML = activity.map((item) => `<span>${new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2024, Number(item.monthNumber) - 1, 1))}</span>`).join('');
    document.querySelector('#deadline-list').innerHTML = deadlines.length ? deadlines.map((deadline) => `<div class="deadline-item"><div><strong>${deadline.title}</strong><span>${deadline.governmentUnit}</span></div><span class="status-badge blue-badge">${deadline.status}</span></div>`).join('') : '<p class="data-empty">No deadlines recorded yet.</p>';
    renderRecentReports(isAdmin ? 'Government workspace' : getCurrentUser().option);
  } catch (error) {
    document.querySelector('#recent-reports-body').innerHTML = '<tr><td colspan="5" class="data-empty">Overview data is unavailable.</td></tr>';
    console.error(error);
  }
}

function renderRecentReports(unitName = 'Government workspace') {
  const search = document.querySelector('#report-search')?.value.trim().toLowerCase() || '';
  const reports = overviewReports.filter((report) => report.title.toLowerCase().includes(search) || unitName.toLowerCase().includes(search));
  document.querySelector('#recent-reports-body').innerHTML = reports.length ? reports.map((report) => `<tr><td><strong>${report.title}</strong><span class="table-subtext">Report ID ${report.id}</span></td><td>${unitName}</td><td>${formatDate(report.updatedAt)}</td><td><span class="status-badge ${report.status === 'Approved' || report.status === 'Published' ? 'green-badge' : report.status === 'Draft' ? 'gray-badge' : 'blue-badge'}">${report.status}</span></td><td></td></tr>`).join('') : `<tr><td colspan="5" class="data-empty">${search ? 'No reports match your search.' : 'No reports have been created yet.'}</td></tr>`;
}

async function renderDirectory() {
  const { accounts } = await api('accounts');
  document.querySelector('#directory-count').textContent = `${accounts.length} account${accounts.length === 1 ? '' : 's'}`;
  document.querySelector('#user-directory-body').innerHTML = accounts.map((user) => `<tr><td><strong>${user.name}</strong><span class="table-subtext">Official identification on file</span></td><td>${user.regNo}</td><td>${user.option}</td><td><span class="status-badge green-badge">Active</span></td></tr>`).join('') || '<tr><td colspan="4" class="directory-empty">No standard accounts have registered yet.</td></tr>';
}

async function renderAdminWorkspace() {
  if (currentSession?.role !== 'admin') return;
  const { accounts } = await api('accounts');
  document.querySelector('#user-directory-body').innerHTML = accounts.map((account) => `<tr><td><strong>${account.name}</strong><span class="table-subtext">${account.regNo}</span></td><td>${account.option}</td><td>${account.role}</td><td><span class="status-badge ${account.status === 'active' ? 'green-badge' : 'tan-badge'}">${account.status}</span></td><td><button class="row-action" data-account-action="${account.status === 'active' ? 'deactivate' : 'activate'}" data-account-id="${account.id}">${account.status === 'active' ? 'Deactivate' : 'Activate'}</button><button class="row-action" data-account-action="role" data-account-id="${account.id}">${account.role === 'admin' ? 'Standard' : 'Admin'}</button><button class="row-action danger-action" data-account-action="delete" data-account-id="${account.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="data-empty">No accounts registered.</td></tr>';
  document.querySelector('#directory-count').textContent = `${accounts.length} account${accounts.length === 1 ? '' : 's'}`;
  const userAccounts = accounts.filter((account) => account.role === 'user' && account.status === 'active');
  document.querySelector('#task-account').innerHTML = '<option value="">Select an account</option>' + userAccounts.map((account) => `<option value="${account.id}">${account.name} · ${account.option}</option>`).join('');
  const { units } = await api('units');
  document.querySelector('#unit-list').innerHTML = units.map((unit) => `<div class="admin-list-row"><span>${unit.name}</span><button class="row-action danger-action" data-unit-id="${unit.id}">Delete</button></div>`).join('');
  const { reports } = await api('admin-reports');
  document.querySelector('#admin-report-list').innerHTML = reports.length ? reports.map((report) => `<form class="admin-report" data-report-id="${report.id}"><strong>${report.title}</strong><span>${report.accountName} · ${report.status}</span><textarea name="feedback" placeholder="Feedback">${report.feedback || ''}</textarea><div><select name="status"><option ${report.status === 'Draft' ? 'selected' : ''}>Draft</option><option ${report.status === 'Under review' ? 'selected' : ''}>Under review</option><option ${report.status === 'Approved' ? 'selected' : ''}>Approved</option><option ${report.status === 'Published' ? 'selected' : ''}>Published</option></select><select name="rating"><option value="">Rating</option>${[1,2,3,4,5].map((rating) => `<option value="${rating}" ${Number(report.rating) === rating ? 'selected' : ''}>${rating}/5</option>`).join('')}</select><button class="btn btn-outline" type="submit">Save review</button></div></form>`).join('') : '<p class="data-empty">No reports submitted yet.</p>';
  const { activity } = await api('activity');
  document.querySelector('#activity-list').innerHTML = activity.length ? activity.map((entry) => `<div class="admin-list-row"><span>${entry.name} · ${entry.regNo}</span><small>${entry.sessionCount} sign-in${Number(entry.sessionCount) === 1 ? '' : 's'} · ${formatDate(entry.lastUsedAt)}</small></div>`).join('') : '<p class="data-empty">No user activity recorded yet.</p>';
}

async function renderUserNotifications() {
  if (!currentSession || currentSession.role === 'admin') return;
  const { notifications } = await api(`user-notifications&accountId=${currentSession.id}`);
  document.querySelector('#notification-list').innerHTML = notifications.length ? notifications.map((item) => `<article class="notification-item"><span class="eyebrow">${item.type}</span><h2>${item.title}</h2><p>${item.message}</p><small>${formatDate(item.createdAt)}</small></article>`).join('') : '<div class="empty-state"><div class="empty-mark">*</div><h2>You are all caught up</h2><p>New activity will appear here.</p></div>';
}

async function renderUserTasks() {
  if (!currentSession || currentSession.role === 'admin') return;
  const { tasks } = await api(`user-tasks&accountId=${currentSession.id}`);
  document.querySelector('#user-task-list').innerHTML = tasks.length ? tasks.map((task) => `<div class="admin-list-row"><span><strong>${task.title}</strong><small>${task.details || 'No further details.'}</small></span><select class="task-status" data-task-id="${task.id}"><option value="assigned" ${task.status === 'assigned' ? 'selected' : ''}>Assigned</option><option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In progress</option><option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option></select></div>`).join('') : '<p class="data-empty">No tasks assigned yet.</p>';
}

async function updateShell() {
  const isSignedIn = Boolean(currentSession);
  if (!appSidebar || !appMain) return;
  authScreen.classList.toggle('hidden', isSignedIn);
  appSidebar.classList.toggle('hidden', !isSignedIn);
  appMain.classList.toggle('hidden', !isSignedIn);
  if (!isSignedIn) return;
  const isAdmin = currentSession.role === 'admin';
  document.querySelector('#sidebar-name').textContent = currentSession.name;
  document.querySelector('#sidebar-role').textContent = isAdmin ? 'Administrator' : 'Standard account';
  document.querySelector('#sidebar-avatar').textContent = currentSession.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const topAvatar = document.querySelector('#top-avatar');
  if (topAvatar) topAvatar.textContent = document.querySelector('#sidebar-avatar').textContent;
  const user = getCurrentUser();
  const profilePhoto = document.querySelector('#profile-photo');
  const profileAvatar = document.querySelector('#profile-avatar');
  if (profilePhoto && profileAvatar) {
    profilePhoto.src = user.photoData || '';
    profilePhoto.classList.toggle('visible', Boolean(user.photoData));
    profileAvatar.classList.toggle('hidden', Boolean(user.photoData));
  }
  document.querySelector('#profile-name').textContent = user.name;
  document.querySelector('#profile-details').textContent = `${isAdmin ? 'Administrator' : 'Standard account'} · ${user.option || 'Public Administration'}`;
  document.querySelectorAll('.admin-only').forEach((item) => item.classList.toggle('hidden', !isAdmin));
  document.querySelector('#user-home-view').classList.toggle('active-view', !isAdmin);
  if (!isAdmin) document.querySelector('#user-welcome').textContent = `Welcome, ${currentSession.name.split(' ')[0]}.`;
  try { await renderDirectory(); } catch (error) { console.error(error); }
  loadWorkspaceSettings();
  renderOverview();
  renderUserNotifications();
  renderUserTasks();
  renderAdminWorkspace();
  showView(isAdmin ? 'overview' : 'user-home');
}

const signupForm = document.querySelector('#signup-form');
if (signupForm) signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.querySelector('#signup-name').value.trim();
  const regNo = document.querySelector('#signup-reg-no').value.trim();
  const option = document.querySelector('#signup-option').value;
  const photo = document.querySelector('#signup-photo').files[0];
  const reader = new FileReader();
  reader.addEventListener('load', async () => {
    try {
      await api('signup', { method: 'POST', body: JSON.stringify({ name, regNo, option, photoData: reader.result }) });
      setMessage('signup-message', 'Account created. You can sign in now.');
      event.target.reset();
    } catch (error) { setMessage('signup-message', error.message, true); }
  });
  reader.readAsDataURL(photo);
});

const signinForm = document.querySelector('#signin-form');
if (signinForm) {
  const signinRole = document.querySelector('#signin-role');
  signinRole.addEventListener('change', (event) => {
    const isAdmin = event.target.value === 'admin';
    document.querySelector('#standard-signin-fields').classList.toggle('hidden-field', isAdmin);
    document.querySelector('#admin-signin-fields').classList.toggle('hidden-field', !isAdmin);
    document.querySelectorAll('#standard-signin-fields input').forEach((input) => { input.required = !isAdmin; });
    document.querySelectorAll('#admin-signin-fields input').forEach((input) => { input.required = isAdmin; });
  });

  signinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const isAdmin = signinRole.value === 'admin';
    try {
      const data = await api('signin', { method: 'POST', body: JSON.stringify({ role: isAdmin ? 'admin' : 'user', email: document.querySelector('#signin-email').value, password: document.querySelector('#signin-password').value, regNo: document.querySelector('#signin-reg-no').value, name: document.querySelector('#signin-name').value }) });
      currentSession = data.account;
      localStorage.setItem(sessionKey, JSON.stringify(currentSession));
      signinForm.reset();
      if (appSidebar && appMain) updateShell();
      else window.location.href = 'index.html';
    } catch (error) { setMessage('signin-message', error.message, true); }
  });
}

const reportForm = document.querySelector('#report-form');
if (reportForm) {
  const reportAttachments = document.querySelector('#report-attachments');
  const loadDraft = async () => {
    if (!currentSession?.id) return;
    try {
      const { draft } = await api(`draft&accountId=${currentSession.id}`);
      document.querySelector('#report-title').value = draft.title || '';
      document.querySelector('#report-content').value = draft.content || '';
    } catch (error) { console.error(error); }
  };
  loadDraft();
  reportAttachments.addEventListener('change', () => {
    const count = reportAttachments.files.length;
    document.querySelector('#attachment-summary').textContent = count ? `${count} file${count === 1 ? '' : 's'} selected` : 'No files attached';
  });
  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('draft', { method: 'POST', body: JSON.stringify({ accountId: currentSession.id, title: document.querySelector('#report-title').value.trim(), content: document.querySelector('#report-content').value.trim(), attachments: [...reportAttachments.files].map((file) => file.name) }) });
      document.querySelector('#editor-status').textContent = 'Saved just now';
      setMessage('report-message', 'Draft saved successfully.');
    } catch (error) { setMessage('report-message', error.message, true); }
  });
}

const profileForm = document.querySelector('#profile-form');
const profileSummary = document.querySelector('.profile-summary');
const editProfileButton = document.querySelector('#edit-profile-button');
if (profileForm && editProfileButton) {
  editProfileButton.addEventListener('click', () => {
    fillProfileForm(getCurrentUser());
    profileSummary.classList.add('hidden');
    profileForm.classList.remove('hidden');
  });
  document.querySelector('#cancel-profile-button').addEventListener('click', () => {
    profileForm.classList.add('hidden');
    profileSummary.classList.remove('hidden');
    setMessage('profile-message', '');
  });
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const photo = document.querySelector('#profile-edit-photo').files[0];
    const save = async (photoData = null) => {
      try {
        const data = await api('profile', { method: 'POST', body: JSON.stringify({ accountId: currentSession.id, name: document.querySelector('#profile-edit-name').value.trim(), regNo: document.querySelector('#profile-edit-reg-no').value.trim(), option: document.querySelector('#profile-edit-option').value, photoData }) });
        currentSession = data.account;
        localStorage.setItem(sessionKey, JSON.stringify(currentSession));
        profileForm.classList.add('hidden');
        profileSummary.classList.remove('hidden');
        setMessage('profile-message', 'Profile saved successfully.');
        updateShell();
      } catch (error) { setMessage('profile-message', error.message, true); }
    };
    if (!photo) save();
    else {
      const reader = new FileReader();
      reader.addEventListener('load', () => save(reader.result));
      reader.readAsDataURL(photo);
    }
  });
}

const settingsForm = document.querySelector('#settings-form');
if (settingsForm) {
  const loadSettings = async () => {
    await loadWorkspaceSettings();
  };
  loadSettings();
  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('settings', { method: 'POST', body: JSON.stringify({ accountId: currentSession.id, timezone: document.querySelector('#settings-timezone').value, emailNotifications: document.querySelector('#settings-email-notifications').checked }) });
      await loadWorkspaceSettings();
      setMessage('settings-message', 'Settings saved successfully.');
    } catch (error) { setMessage('settings-message', error.message, true); }
  });
}

const logoutButton = document.querySelector('#logout-button');
if (logoutButton) logoutButton.addEventListener('click', () => {
  currentSession = null;
  localStorage.removeItem(sessionKey);
  updateShell();
});

navItems.forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));

document.querySelectorAll('#new-report-button, #reports-new-button').forEach((button) => {
  button.addEventListener('click', () => showView('reports'));
});

const filterButton = document.querySelector('#filter-button');
if (filterButton) filterButton.addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.classList.toggle('selected');
  button.innerHTML = button.classList.contains('selected') ? 'Needs attention <span>v</span>' : 'All reports <span>v</span>';
});

const searchToggle = document.querySelector('#search-toggle');
const reportSearch = document.querySelector('#report-search');
if (searchToggle && reportSearch) {
  searchToggle.addEventListener('click', () => {
    reportSearch.classList.toggle('hidden');
    if (!reportSearch.classList.contains('hidden')) reportSearch.focus();
  });
  reportSearch.addEventListener('input', () => renderRecentReports(currentSession?.role === 'admin' ? 'Government workspace' : getCurrentUser().option));
}

const notificationButton = document.querySelector('#notification-button');
if (notificationButton) notificationButton.addEventListener('click', () => showView('notifications'));

const adminCreateForm = document.querySelector('#admin-create-form');
if (adminCreateForm) adminCreateForm.addEventListener('submit', async (event) => { event.preventDefault(); try { await api('admin-create', { method: 'POST', body: JSON.stringify({ name: document.querySelector('#admin-create-name').value, regNo: document.querySelector('#admin-create-reg-no').value, email: document.querySelector('#admin-create-email').value, password: document.querySelector('#admin-create-password').value }) }); setMessage('admin-create-message', 'Administrator account created.'); event.target.reset(); renderAdminWorkspace(); } catch (error) { setMessage('admin-create-message', error.message, true); } });
const unitForm = document.querySelector('#unit-form');
if (unitForm) unitForm.addEventListener('submit', async (event) => { event.preventDefault(); try { await api('unit', { method: 'POST', body: JSON.stringify({ name: document.querySelector('#unit-name').value }) }); event.target.reset(); renderAdminWorkspace(); } catch (error) { console.error(error); } });
const announcementForm = document.querySelector('#announcement-form');
if (announcementForm) announcementForm.addEventListener('submit', async (event) => { event.preventDefault(); try { await api('announcement', { method: 'POST', body: JSON.stringify({ title: document.querySelector('#announcement-title').value, message: document.querySelector('#announcement-message').value }) }); setMessage('announcement-status', 'Announcement published.'); event.target.reset(); } catch (error) { setMessage('announcement-status', error.message, true); } });
const taskForm = document.querySelector('#task-form');
if (taskForm) taskForm.addEventListener('submit', async (event) => { event.preventDefault(); try { await api('task', { method: 'POST', body: JSON.stringify({ accountId: document.querySelector('#task-account').value, title: document.querySelector('#task-title').value, details: document.querySelector('#task-details').value, dueAt: document.querySelector('#task-due').value }) }); setMessage('task-status', 'Task assigned.'); event.target.reset(); } catch (error) { setMessage('task-status', error.message, true); } });
document.addEventListener('click', async (event) => { const button = event.target.closest('[data-account-action], [data-unit-id]'); if (!button) return; try { if (button.dataset.unitId) await api('unit-delete', { method: 'POST', body: JSON.stringify({ unitId: button.dataset.unitId }) }); else if (button.dataset.accountAction === 'delete') await api('account-delete', { method: 'POST', body: JSON.stringify({ accountId: button.dataset.accountId }) }); else if (button.dataset.accountAction === 'role') await api('account-role', { method: 'POST', body: JSON.stringify({ accountId: button.dataset.accountId, role: button.textContent.trim() === 'Admin' ? 'admin' : 'user' }) }); else await api('account-status', { method: 'POST', body: JSON.stringify({ accountId: button.dataset.accountId, status: button.dataset.accountAction === 'activate' ? 'active' : 'inactive' }) }); renderAdminWorkspace(); } catch (error) { console.error(error); } });
document.addEventListener('submit', async (event) => { const form = event.target.closest('.admin-report'); if (!form) return; event.preventDefault(); try { await api('review', { method: 'POST', body: JSON.stringify({ reportId: form.dataset.reportId, feedback: form.feedback.value, status: form.status.value, rating: form.rating.value }) }); renderAdminWorkspace(); } catch (error) { console.error(error); } });
document.addEventListener('change', async (event) => { const select = event.target.closest('.task-status'); if (!select) return; try { await api('task-status', { method: 'POST', body: JSON.stringify({ taskId: select.dataset.taskId, status: select.value }) }); } catch (error) { console.error(error); } });

const sidebarToggle = document.querySelector('#sidebar-toggle');
if (sidebarToggle) {
  setSidebarState(localStorage.getItem(sidebarStateKey) === 'true');
  sidebarToggle.addEventListener('click', () => {
    const isCollapsed = !document.body.classList.contains('sidebar-collapsed');
    localStorage.setItem(sidebarStateKey, String(isCollapsed));
    setSidebarState(isCollapsed);
  });
}

updateShell();
