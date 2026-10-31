(() => {
  'use strict';
  const form = document.querySelector('#register-form');
  const error = document.querySelector('#register-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const body = Object.fromEntries(new FormData(form));
    error.textContent = '';
    if (body.password !== body.confirm_password) { error.textContent = '两次输入的密码不一致'; return; }
    delete body.confirm_password;
    const parent = new URLSearchParams(location.search).get('parent');
    if (parent) body.parent_id = parent;
    button.disabled = true;
    try {
      const response = await fetch('/api/merchant/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('注册服务暂时不可用，请稍后重试'); }
      if (!response.ok) throw new Error(result.error || '注册失败，请稍后重试');
      form.reset();
      form.hidden = true;
      document.querySelector('#register-result').hidden = false;
    } catch (failure) { error.textContent = failure.message; } finally { button.disabled = false; }
  });
})();
