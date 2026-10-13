// Main authenticated app: household switching, membership management, lists and items.
// DOM-building helpers always use textContent for user-supplied strings (never innerHTML),
// per the project's XSS-prevention decision in the status file.

let currentUser = null;
let households = [];
let activeHouseholdId = Number(localStorage.getItem('houselist.activeHouseholdId')) || null;
let activeListId = null;

const el = {
  householdSelect: document.getElementById('household-select'),
  currentUserSpan: document.getElementById('current-user'),
  globalError: document.getElementById('global-error'),
  noHousehold: document.getElementById('no-household'),
  householdView: document.getElementById('household-view'),
  listsUl: document.getElementById('lists-ul'),
  listDetail: document.getElementById('list-detail'),
  listDetailTitle: document.getElementById('list-detail-title'),
  listFinishedBadge: document.getElementById('list-finished-badge'),
  itemsUl: document.getElementById('items-ul'),
  membersUl: document.getElementById('members-ul'),
  joinCodeBox: document.getElementById('join-code-box'),
  joinCodeValue: document.getElementById('join-code-value'),
  deleteHouseholdBtn: document.getElementById('btn-delete-household'),
};

function showError(message) {
  el.globalError.textContent = message || '';
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

async function init() {
  try {
    const { user } = await api('GET', '/api/auth/me');
    currentUser = user;
  } catch {
    window.location.href = 'index.html';
    return;
  }
  el.currentUserSpan.textContent = currentUser.name;
  await loadHouseholds();
}

async function loadHouseholds() {
  const data = await api('GET', '/api/households');
  households = data.households;

  clearChildren(el.householdSelect);
  for (const h of households) {
    const opt = document.createElement('option');
    opt.value = String(h.id);
    opt.textContent = h.name + (h.isAdmin ? ' (admin)' : '');
    el.householdSelect.appendChild(opt);
  }

  if (households.length === 0) {
    activeHouseholdId = null;
    el.householdSelect.classList.add('hidden');
    el.noHousehold.classList.remove('hidden');
    el.householdView.classList.add('hidden');
    return;
  }

  if (!activeHouseholdId || !households.some((h) => h.id === activeHouseholdId)) {
    activeHouseholdId = households[0].id;
  }
  el.householdSelect.value = String(activeHouseholdId);
  localStorage.setItem('houselist.activeHouseholdId', String(activeHouseholdId));

  el.householdSelect.classList.remove('hidden');
  el.noHousehold.classList.add('hidden');
  el.householdView.classList.remove('hidden');
  await Promise.all([loadMembers(), loadLists(), loadJoinCode()]);
}

function currentMembership() {
  return households.find((h) => h.id === activeHouseholdId);
}

async function loadMembers() {
  const data = await api('GET', `/api/households/${activeHouseholdId}/members`);
  const isAdmin = !!currentMembership()?.isAdmin;
  el.deleteHouseholdBtn.classList.toggle('hidden', !isAdmin);

  clearChildren(el.membersUl);
  for (const m of data.members) {
    const li = document.createElement('li');

    const label = document.createElement('span');
    label.textContent = `${m.name} (${m.email})${m.isAdmin ? ' — admin' : ''}`;
    li.appendChild(label);

    if (isAdmin && !m.isAdmin) {
      const promoteBtn = document.createElement('button');
      promoteBtn.type = 'button';
      promoteBtn.textContent = 'Promote';
      promoteBtn.addEventListener('click', () => promoteMember(m.id));
      li.appendChild(promoteBtn);
    }

    if (isAdmin && m.id !== currentUser.id) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeMember(m.id));
      li.appendChild(removeBtn);
    }

    el.membersUl.appendChild(li);
  }
}

async function loadJoinCode() {
  const isAdmin = !!currentMembership()?.isAdmin;
  if (!isAdmin) {
    el.joinCodeBox.classList.add('hidden');
    return;
  }
  const data = await api('GET', `/api/households/${activeHouseholdId}/join-code`);
  el.joinCodeValue.textContent = data.joinCode;
  el.joinCodeBox.classList.remove('hidden');
}

async function loadLists() {
  const data = await api('GET', `/api/households/${activeHouseholdId}/lists`);
  clearChildren(el.listsUl);
  for (const list of data.lists) {
    const li = document.createElement('li');
    li.classList.toggle('finished', list.finished);

    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'list-open';
    link.textContent = `${list.title} (${list.itemCount} item${list.itemCount === 1 ? '' : 's'})${list.finished ? ' — finished' : ''}`;
    link.addEventListener('click', () => selectList(list.id));
    li.appendChild(link);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteList(list.id));
    li.appendChild(deleteBtn);

    el.listsUl.appendChild(li);
  }
  if (activeListId && !data.lists.some((l) => l.id === activeListId)) {
    activeListId = null;
    el.listDetail.classList.add('hidden');
  }
}

async function selectList(listId) {
  activeListId = listId;
  const data = await api('GET', `/api/households/${activeHouseholdId}/lists/${listId}`);
  el.listDetailTitle.textContent = data.list.title;
  el.listFinishedBadge.classList.toggle('hidden', !data.list.finished);
  el.listDetail.classList.remove('hidden');

  clearChildren(el.itemsUl);
  for (const item of data.list.items) {
    const li = document.createElement('li');
    li.classList.toggle('bought', item.bought);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.bought;
    checkbox.addEventListener('change', () => toggleBought(item.id, checkbox.checked));
    li.appendChild(checkbox);

    const label = document.createElement('span');
    let text = item.name;
    if (item.amount) text += ` — ${item.amount}`;
    if (item.comment) text += ` (${item.comment})`;
    label.textContent = text;
    li.appendChild(label);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteItem(item.id));
    li.appendChild(deleteBtn);

    el.itemsUl.appendChild(li);
  }
}

async function toggleBought(itemId, bought) {
  try {
    await api('PATCH', `/api/households/${activeHouseholdId}/items/${itemId}`, { bought });
    await Promise.all([selectList(activeListId), loadLists()]);
  } catch (err) {
    showError(err.message);
  }
}

async function deleteItem(itemId) {
  try {
    await api('DELETE', `/api/households/${activeHouseholdId}/items/${itemId}`);
    await Promise.all([selectList(activeListId), loadLists()]);
  } catch (err) {
    showError(err.message);
  }
}

async function deleteList(listId) {
  try {
    await api('DELETE', `/api/households/${activeHouseholdId}/lists/${listId}`);
    if (activeListId === listId) {
      activeListId = null;
      el.listDetail.classList.add('hidden');
    }
    await loadLists();
  } catch (err) {
    showError(err.message);
  }
}

async function promoteMember(userId) {
  try {
    await api('POST', `/api/households/${activeHouseholdId}/members/${userId}/promote`);
    await loadMembers();
  } catch (err) {
    showError(err.message);
  }
}

async function removeMember(userId) {
  try {
    await api('DELETE', `/api/households/${activeHouseholdId}/members/${userId}`);
    await loadMembers();
  } catch (err) {
    showError(err.message);
  }
}

// --- Event wiring -----------------------------------------------------

document.getElementById('household-select').addEventListener('change', async (e) => {
  activeHouseholdId = Number(e.target.value);
  activeListId = null;
  el.listDetail.classList.add('hidden');
  localStorage.setItem('houselist.activeHouseholdId', String(activeHouseholdId));
  await Promise.all([loadMembers(), loadLists(), loadJoinCode()]);
});

document.getElementById('btn-new-household').addEventListener('click', () => {
  el.noHousehold.classList.remove('hidden');
  el.householdView.classList.add('hidden');
});

document.getElementById('create-household-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  try {
    const nameInput = document.getElementById('new-household-name');
    const data = await api('POST', '/api/households', { name: nameInput.value });
    nameInput.value = '';
    activeHouseholdId = data.household.id;
    await loadHouseholds();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('join-household-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  try {
    const codeInput = document.getElementById('join-code-input');
    const data = await api('POST', '/api/households/join', { code: codeInput.value });
    codeInput.value = '';
    activeHouseholdId = data.household.id;
    await loadHouseholds();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('create-list-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  try {
    const titleInput = document.getElementById('new-list-title');
    await api('POST', `/api/households/${activeHouseholdId}/lists`, { title: titleInput.value });
    titleInput.value = '';
    await loadLists();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('add-item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  try {
    const nameInput = document.getElementById('new-item-name');
    const amountInput = document.getElementById('new-item-amount');
    const commentInput = document.getElementById('new-item-comment');
    await api('POST', `/api/households/${activeHouseholdId}/lists/${activeListId}/items`, {
      name: nameInput.value,
      amount: amountInput.value,
      comment: commentInput.value,
    });
    nameInput.value = '';
    amountInput.value = '';
    commentInput.value = '';
    await Promise.all([selectList(activeListId), loadLists()]);
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('btn-regenerate-code').addEventListener('click', async () => {
  try {
    const data = await api('POST', `/api/households/${activeHouseholdId}/join-code/regenerate`);
    el.joinCodeValue.textContent = data.joinCode;
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('btn-leave-household').addEventListener('click', async () => {
  if (!confirm('Leave this household?')) return;
  try {
    await api('DELETE', `/api/households/${activeHouseholdId}/members/${currentUser.id}`);
    activeHouseholdId = null;
    await loadHouseholds();
  } catch (err) {
    showError(err.message);
  }
});

el.deleteHouseholdBtn.addEventListener('click', async () => {
  if (!confirm('Delete this household? This removes all its lists, items and memberships for everyone.')) return;
  try {
    await api('DELETE', `/api/households/${activeHouseholdId}`);
    activeHouseholdId = null;
    await loadHouseholds();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout');
  window.location.href = 'index.html';
});

init();
