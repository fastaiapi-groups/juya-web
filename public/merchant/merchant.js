(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const statusLabels = { valid: '有效', disabled: '已禁用', expired: '已过期' };
  const roles = { admin: '平台管理员', merchant: '商户', agent: '代理' };
  const state = { user: null, csrf: '', tab: 'cards', page: 1, accountPage: 1, pageSize: 20, accountPageSize: 20, agents: [], cards: [], accounts: [], request: 0 };
  const shop = new URLSearchParams(location.search).get('shop') || '';
  let modalAction;
  let toastTimer;
  let resettingFilters = false;
  function resetFilters() {
    resettingFilters = true;
    $('#filter-form').reset();
    resettingFilters = false;
  }

  async function api(path, options = {}) {
    const { body, ...rest } = options;
    const response = await fetch(`/api/merchant${path}`, {
      credentials: 'same-origin', ...rest,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': state.csrf },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('商户服务暂时不可用，请稍后重试'); }
    if (!response.ok) {
      if (response.status === 401 && state.user) showLogin(data.error || '登录已失效，请重新登录');
      throw new Error(data.error || '请求失败，请稍后重试');
    }
    return data;
  }
  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
  }
  function pageError(error) {
    $('#page-error').textContent = error.message || '操作未完成，请稍后重试';
    $('#page-error').hidden = false;
  }
  async function busy(form, callback, errorTarget = pageError) {
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try { await callback(); } catch (error) { errorTarget(error); } finally { button.disabled = false; }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('已复制'); }
    catch { openModal('复制内容', `<label>请选择并复制<input value="${esc(text)}" readonly></label>`, null, '关闭'); }
  }
  function date(value) {
    return value === null ? '永久有效' : new Date(value).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function entry(merchantId) { return `${location.origin}/hub/home/merchant/?shop=${encodeURIComponent(merchantId)}`; }
  function showLogin(message = '') {
    state.request++;
    state.user = null;
    state.csrf = '';
    state.cards = state.accounts = state.agents = [];
    for (const selector of ['#cards-body', '#accounts-body', '#summary']) $(selector).replaceChildren();
    $('#dashboard').hidden = true;
    $('#startup').hidden = true;
    $('#login-view').hidden = false;
    $('#login-error').textContent = message;
    $('#modal').close();
  }
  async function showDashboard(session) {
    state.user = session.user;
    state.csrf = session.csrf;
    $('#login-view').hidden = true;
    $('#startup').hidden = true;
    $('#dashboard').hidden = false;
    $('#current-user').textContent = state.user.display_name;
    $('#role-badge').textContent = roles[state.user.role];
    const admin = state.user.role === 'admin';
    const merchant = state.user.role === 'merchant';
    for (const name of ['password', 'confirm_password']) $('#password-form').elements[name].minLength = admin ? 8 : 12;
    $('#password-form').elements.password.placeholder = `${admin ? 8 : 12}–128 位`;
    $('#workspace-title').textContent = admin ? '平台管理' : `${state.user.display_name}的工作台`;
    $('#workspace-description').textContent = admin ? '查看全部商户的卡密情况，审批商户和各级代理。' : '管理每一张卡密，连接每一位创作者。';
    $('#generate-section').hidden = !merchant;
    $('#copy-entry').hidden = admin;
    $('[data-tab="cards"]').textContent = admin ? '全部商户卡密' : '卡密管理';
    $('#cards-merchant-heading').hidden = !admin;
    $('#cards-actions-heading').hidden = admin;
    $('#cards-description').textContent = admin ? '查看所属商户、代理、有效期、设备使用及销售状态；概览统计随商户筛选。' : '查看卡密状态与销售进度。';
    $('#accounts-tab').hidden = false;
    $('#accounts-tab').textContent = admin ? '注册审批' : '下级代理';
    $('#accounts-heading').textContent = admin ? '商户与代理账号' : '下级代理';
    $('#accounts-description').textContent = admin ? '审核商户与各级代理的注册申请，通过后即可使用。' : '可继续创建或邀请下级代理，分配卡密；新账号需管理员审批。';
    $('#create-account').textContent = admin ? '＋ 开通商户' : '＋ 注册代理';
    $('#filter-agent-label').hidden = admin;
    $('#filter-agent').disabled = admin;
    $('#filter-merchant-label').hidden = !admin;
    $('#filter-merchant').disabled = !admin;
    $('#copy-invite').hidden = admin;
    state.page = state.accountPage = 1;
    resetFilters();
    await switchTab('cards');
  }
  function agentOptions(selected = '', includeDisabled = false) {
    return state.agents.filter((item) => includeDisabled || (item.enabled && item.approval_status === 'approved')).map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.display_name)}${item.enabled ? '' : '（已停用）'}</option>`).join('');
  }
  async function loadAgents() {
    const admin = state.user.role === 'admin';
    const agents = [];
    for (let page = 1; ; page++) {
      const data = await api(`/accounts?page=${page}&page_size=100${admin ? '&role=merchant' : ''}`);
      agents.push(...data.items);
      if (agents.length >= data.total) break;
    }
    if (admin) {
      const selected = $('#filter-merchant').value;
      $('#filter-merchant').innerHTML = '<option value="">全部商户</option>' + agents.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.display_name)} · ${esc(item.username)}${item.enabled ? '' : '（已停用）'}</option>`).join('');
      return;
    }
    state.agents = agents;
    const selected = $('#generate-agent').value;
    $('#generate-agent').innerHTML = '<option value="">由商户销售</option>' + agentOptions(selected);
    const filter = $('#filter-agent').value;
    $('#filter-agent').innerHTML = '<option value="">全部代理</option><option value="unassigned">由自己销售</option>' + agentOptions(filter, true);
    if (filter === 'unassigned') $('#filter-agent').value = filter;
  }
  function filters() {
    const params = new URLSearchParams(new FormData($('#filter-form')));
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    return params;
  }
  function pagination(target, data, type) {
    const pages = Math.max(1, Math.ceil(data.total / data.page_size));
    $(target).innerHTML = `<span>共 ${data.total} 条 · 第 ${data.page} / ${pages} 页</span><div class="page-controls"><select aria-label="每页条数" data-page-size="${type}">${[10, 20, 50, 100].map((size) => `<option value="${size}" ${size === data.page_size ? 'selected' : ''}>${size} 条 / 页</option>`).join('')}</select><button class="button" data-page="${type}" data-direction="-1" ${data.page <= 1 ? 'disabled' : ''}>上一页</button><button class="button" data-page="${type}" data-direction="1" ${data.page >= pages ? 'disabled' : ''}>下一页</button></div>`;
  }
  function empty(message, description, columns) {
    return `<tr><td colspan="${columns}" class="empty-cell"><span class="empty-symbol">▤</span><strong>${message}</strong>${description}</td></tr>`;
  }
  async function loadCards() {
    const version = ++state.request;
    $('#page-error').hidden = true;
    $('#cards-body').innerHTML = empty('正在获取卡密…', '', 7);
    const params = filters();
    params.set('page', state.page);
    params.set('page_size', state.pageSize);
    const summaryParams = new URLSearchParams();
    if (params.has('merchant')) summaryParams.set('merchant', params.get('merchant'));
    const [data, summary] = await Promise.all([api(`/cards?${params}`), api(`/summary?${summaryParams}`)]);
    if (version !== state.request || !state.user) return;
    if (state.page > 1 && !data.items.length) { state.page = Math.max(1, Math.ceil(data.total / state.pageSize)); await loadCards(); return; }
    state.cards = data.items;
    $('#card-total').textContent = data.total;
    $('#summary').innerHTML = [['卡密总量', summary.total, '▦'], ['可售卡密', summary.available, '◇'], ['已售出', summary.sold, '↗'], ['已激活', summary.activated, '✓']].map(([label, count, symbol]) => `<div class="stat"><div><p>${label}</p><strong>${count}</strong></div><span class="stat-icon" aria-hidden="true">${symbol}</span></div>`).join('');
    const merchant = state.user.role === 'merchant';
    const admin = state.user.role === 'admin';
    $('#cards-body').innerHTML = data.items.map((card) => {
      const owner = admin ? `<td><strong>${esc(card.merchant_name)}</strong><span class="cell-sub">${esc(card.merchant_username)}</span>${!card.merchant_enabled ? '<span class="chip disabled">商户已停用</span>' : card.merchant_approval_status !== 'approved' ? '<span class="chip pending">商户未通过审批</span>' : ''}</td>` : '';
      const actions = admin ? '' : `<td><div class="row-actions"><button class="button" data-card-action="sale" data-id="${card.id}">${card.sold_at ? '设为未售' : '标记售出'}</button><button class="button" data-card-action="assign" data-id="${card.id}">分配</button>${merchant ? `<button class="button" data-card-action="toggle" data-id="${card.id}">${card.enabled ? '禁用' : '启用'}</button><button class="button danger" data-card-action="delete" data-id="${card.id}">删除</button>` : ''}</div></td>`;
      return `<tr><td><div class="code-cell"><code>${esc(card.code)}</code><button class="icon-button copy-code" data-copy="${esc(card.code)}" title="复制卡密" aria-label="复制卡密 ${esc(card.code)}">⧉</button></div><span class="cell-sub">${esc(card.product)}</span></td>${owner}<td class="date-cell">${esc(date(card.expires_at))}</td><td>${esc(card.agent_name || '商户自售')}</td><td>${card.used_devices}<span class="muted"> / ${card.max_devices}</span></td><td><span class="chip ${card.status}">${statusLabels[card.status]}</span></td><td><span class="chip ${card.sold_at ? 'sold' : ''}">${card.sold_at ? '已售出' : '未售出'}</span></td>${actions}</tr>`;
    }).join('') || empty('暂无卡密', admin ? '当前范围内没有卡密，请调整商户或筛选条件。' : merchant ? '生成第一批卡密，或调整筛选条件。' : '请联系所属商户分配卡密，或调整筛选条件。', 7);
    pagination('#cards-pagination', data, 'cards');
  }
  async function loadAccounts() {
    const version = ++state.request;
    $('#page-error').hidden = true;
    $('#accounts-body').innerHTML = empty('正在获取账号…', '', 5);
    const data = await api(`/accounts?page=${state.accountPage}&page_size=${state.accountPageSize}&approval=${$('#approval-filter').value}`);
    if (version !== state.request || !state.user) return;
    state.accounts = data.items;
    const admin = state.user.role === 'admin';
    const approvalLabels = { pending: '待审批', approved: '已通过', rejected: '已拒绝' };
    $('#accounts-body').innerHTML = data.items.map((account) => {
      const pending = account.approval_status === 'pending';
      const status = account.approval_status === 'approved' && !account.enabled ? '已停用' : approvalLabels[account.approval_status];
      return `<tr><td><strong>${esc(account.display_name)}</strong><span class="cell-sub">${esc(account.username)} · ${roles[account.role]}${account.parent_name ? ` · 上级：${esc(account.parent_name)}` : ''}</span>${account.rejection_reason ? `<span class="cell-sub">${esc(account.rejection_reason)}</span>` : ''}</td><td>${account.card_count}</td><td>${esc(date(account.created_at))}</td><td><span class="chip ${account.approval_status === 'approved' && account.enabled ? 'valid' : pending ? 'pending' : 'disabled'}">${status}</span></td><td><div class="row-actions">${admin && account.role === 'merchant' ? `<button class="button" data-account-action="cards" data-id="${account.id}">查看卡密</button>` : ''}${admin && account.approval_status !== 'approved' ? `<button class="button" data-account-action="approve" data-id="${account.id}">通过</button>` : ''}${admin && pending ? `<button class="button danger" data-account-action="reject" data-id="${account.id}">拒绝</button>` : ''}${admin && account.role === 'merchant' && account.approval_status === 'approved' ? `<button class="button" data-account-action="entry" data-id="${account.id}">登录入口</button>` : ''}<button class="button" data-account-action="reset" data-id="${account.id}">重置密码</button><button class="button ${account.enabled ? 'danger' : ''}" data-account-action="toggle" data-id="${account.id}">${account.enabled ? '停用' : '启用'}</button></div></td></tr>`;
    }).join('') || empty('暂无账号', '新的注册申请或下级代理会显示在这里。', 5);
    pagination('#accounts-pagination', data, 'accounts');
  }
  async function switchTab(tab, merchantId = null) {
    state.tab = tab;
    const version = ++state.request;
    $('#page-error').hidden = true;
    $('#summary').hidden = tab !== 'cards';
    for (const name of ['cards', 'accounts', 'api', 'settings']) {
      $(`#${name}-panel`).hidden = name !== tab;
      $(`[data-tab="${name}"]`).classList.toggle('active', name === tab);
    }
    if (tab === 'cards') {
      await loadAgents();
      if (version !== state.request || !state.user) return;
      if (merchantId !== null) { resetFilters(); $('#filter-merchant').value = merchantId; state.page = 1; }
      await loadCards();
    }
    if (tab === 'accounts') await loadAccounts();
  }
  function openModal(title, content, action, confirm = '确认') {
    $('#modal-title').textContent = title;
    $('#modal-content').innerHTML = content;
    $('#modal-error').textContent = '';
    $('#confirm-modal').textContent = confirm;
    modalAction = action;
    $('#modal').showModal();
  }
  function closeModal() { $('#modal').close(); modalAction = null; }

  $('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    $('#login-error').textContent = '';
    busy(event.currentTarget, async () => {
      const body = Object.fromEntries(new FormData($('#login-form')));
      if (shop) body.shop = shop;
      const session = await api('/login', { method: 'POST', body });
      $('#login-form').reset();
      await showDashboard(session);
    }, (error) => { if (state.user) pageError(error); else $('#login-error').textContent = error.message; });
  });
  $('#logout').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); showLogin(); } catch (error) { pageError(error); }
  });
  $('#copy-entry').addEventListener('click', () => copy(entry(state.user.merchant_id)));
  $('.tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (button) switchTab(button.dataset.tab).catch(pageError);
  });
  $('#generate-form').addEventListener('submit', (event) => {
    event.preventDefault();
    busy(event.currentTarget, async () => {
      const body = Object.fromEntries(new FormData($('#generate-form')));
      for (const key of ['count', 'days', 'max_devices']) body[key] = Number(body[key]);
      const result = await api('/cards', { method: 'POST', body });
      toast(`已生成 ${result.count} 张卡密`);
      resetFilters();
      state.page = 1;
      await loadCards();
    });
  });
  $('#filter-form').addEventListener('submit', (event) => { event.preventDefault(); state.page = 1; loadCards().catch(pageError); });
  $('#filter-form').addEventListener('reset', () => { if (!resettingFilters) setTimeout(() => { state.page = 1; loadCards().catch(pageError); }, 0); });
  $('#export-cards').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch(`/api/merchant/cards/export?${filters()}`, { credentials: 'same-origin' });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || '导出失败'); }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `漫剧卡密-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('卡密已导出，请妥善保管');
    } catch (error) { pageError(error); } finally { button.disabled = false; }
  });
  $('#cards-body').addEventListener('click', async (event) => {
    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) { copy(copyButton.dataset.copy); return; }
    const button = event.target.closest('[data-card-action]');
    if (!button || state.user.role === 'admin') return;
    const card = state.cards.find((item) => item.id === button.dataset.id);
    const action = button.dataset.cardAction;
    if (!card) return;
    const update = async (body) => { await api(`/cards/${card.id}`, { method: 'PATCH', body }); toast('卡密已更新'); await loadCards(); };
    if (action === 'sale') {
      button.disabled = true;
      try { await update({ sold: !card.sold_at }); } catch (error) { pageError(error); button.disabled = false; }
    } else if (action === 'toggle') {
      openModal(card.enabled ? '禁用卡密' : '启用卡密', `<p>${card.enabled ? '禁用后，已激活的设备将无法通过授权校验。' : '启用后，有效期内的卡密可继续使用。'}</p><p>${esc(card.code)}</p>`, async () => { await update({ enabled: !card.enabled }); closeModal(); });
    } else if (action === 'delete') {
      openModal('删除卡密', `<p>删除后卡密与已发放的授权凭证将失效，此操作无法在后台撤销。</p><p>${esc(card.code)}</p>`, async () => { await api(`/cards/${card.id}`, { method: 'DELETE' }); closeModal(); toast('卡密已删除'); await loadCards(); }, '确认删除');
    } else if (action === 'assign') {
      try {
        await loadAgents();
        openModal('分配卡密', `<p>${esc(card.code)}</p><label>选择代理<select name="agent_id"><option value="">由自己销售</option>${agentOptions(card.agent_id)}</select></label><p>分配后，所选代理及其上级可管理该卡密。</p>`, async (form) => { await update({ agent_id: new FormData(form).get('agent_id') || null }); closeModal(); });
      } catch (error) { pageError(error); }
    }
  });
  $('#create-account').addEventListener('click', () => {
    const label = state.user.role === 'admin' ? '商户' : '代理';
    openModal(`${label === '商户' ? '开通' : '注册'}${label}`, `<label>${label}名称<input name="display_name" required maxlength="60" placeholder="便于辨认的名称"></label><label>登录账号<input name="username" autocomplete="off" required minlength="3" maxlength="40" placeholder="3–40 位字母、数字、_.-"></label><label>初始密码<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" placeholder="12–128 位"></label><p>账号创建后，请将登录账号和初始密码提供给${label}。新代理需等待管理员审批通过后才能登录。</p>`, async (form) => {
      await api('/accounts', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      closeModal(); toast(`${label}账号已创建`); state.accountPage = 1; await loadAccounts();
    }, '创建账号');
  });
  $('#accounts-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-account-action]');
    if (!button) return;
    const account = state.accounts.find((item) => item.id === button.dataset.id);
    if (!account) return;
    const action = button.dataset.accountAction;
    if (action === 'cards') { switchTab('cards', account.id).catch(pageError); return; }
    if (action === 'entry') { copy(entry(account.id)); return; }
    const update = async (body) => { await api(`/accounts/${account.id}`, { method: 'PATCH', body }); closeModal(); toast('账号已更新'); await loadAccounts(); };
    if (action === 'approve') openModal('通过注册申请', `<p>${esc(account.display_name)} · ${esc(account.username)}</p><p>通过后，账号即可登录并使用所属分销权限。</p>`, () => update({ approval_status: 'approved' }), '确认通过');
    if (action === 'reject') openModal('拒绝注册申请', `<p>${esc(account.display_name)} · ${esc(account.username)}</p><label>拒绝原因<input name="rejection_reason" maxlength="200" placeholder="可选，方便申请人了解原因"></label>`, (form) => update({ approval_status: 'rejected', rejection_reason: new FormData(form).get('rejection_reason') }), '确认拒绝');
    if (action === 'reset') openModal('重置登录密码', `<p>${esc(account.display_name)} · ${esc(account.username)}<br>重置后，此账号的所有登录会话将失效。</p><label>新密码<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" placeholder="12–128 位"></label>`, (form) => update({ password: new FormData(form).get('password') }), '重置密码');
    if (action === 'toggle') openModal(account.enabled ? '停用账号' : '启用账号', `<p>${esc(account.display_name)} · ${esc(account.username)}</p><p>${account.enabled ? state.user.role === 'admin' ? '停用商户后，所有下级均无法登录，所属卡密也将无法通过公开验证。' : '停用后，此代理和其全部下级均无法登录；卡密仍有效，可由上级重新分配。' : '启用后可使用原账号密码登录。'}</p>`, () => update({ enabled: !account.enabled }));
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button) return;
    const direction = Number(button.dataset.direction);
    if (button.dataset.page === 'cards') { state.page = Math.max(1, state.page + direction); loadCards().catch(pageError); }
    else { state.accountPage = Math.max(1, state.accountPage + direction); loadAccounts().catch(pageError); }
  });
  document.addEventListener('change', (event) => {
    const type = event.target.dataset.pageSize;
    if (type === 'cards') { state.pageSize = Number(event.target.value); state.page = 1; loadCards().catch(pageError); }
    if (type === 'accounts') { state.accountPageSize = Number(event.target.value); state.accountPage = 1; loadAccounts().catch(pageError); }
  });
  $('#copy-invite').addEventListener('click', () => copy(`${location.origin}/hub/home/merchant/register.html?parent=${encodeURIComponent(state.user.id)}`));
  $('#approval-filter').addEventListener('change', () => { state.accountPage = 1; loadAccounts().catch(pageError); });
  $('#password-form').addEventListener('submit', (event) => {
    event.preventDefault();
    busy(event.currentTarget, async () => {
      const body = Object.fromEntries(new FormData($('#password-form')));
      if (body.password !== body.confirm_password) throw new Error('两次输入的新密码不一致');
      delete body.confirm_password;
      await api('/password', { method: 'POST', body });
      $('#password-form').reset();
      showLogin('密码已更新，请重新登录');
    });
  });
  $('#modal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    $('#modal-error').textContent = '';
    busy(event.currentTarget, async () => { if (modalAction) await modalAction($('#modal-form')); else closeModal(); }, (error) => { $('#modal-error').textContent = error.message; });
  });
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#close-modal').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (event) => { if (event.target === $('#modal')) { const rect = $('#modal').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal(); } });

  (async () => {
    try {
      if (shop) {
        const data = await api(`/shops/${encodeURIComponent(shop)}`);
        $('#login-title').textContent = `${data.display_name} · 登录`;
        $('#login-description').textContent = '使用本商户的商户或代理账号登录。';
      }
      const session = await api('/session');
      if (shop && session.user.merchant_id !== shop) {
        state.csrf = session.csrf;
        await api('/logout', { method: 'POST' });
        showLogin('请使用本商户所属账号登录');
      } else await showDashboard(session);
    } catch (error) {
      showLogin(error.message.includes('登录') ? '' : error.message);
    }
  })();
})();
