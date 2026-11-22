/**
 * Auth module — login/register UI
 */

import { Auth } from '../../app/api.js';
import { el, showError } from '../../app/utils.js';

export function renderAuthScreen(onSuccess) {
  const screen = el('div', { class: 'auth-screen' });
  const card = el('div', { class: 'auth-card' });

  const logo = el('div', { class: 'auth-logo' },
    el('h1', {}, 'SOCIOSTAT'),
    el('p', {}, 'Statistical Analysis Workbench')
  );

  const tabs = el('div', { class: 'auth-tabs' });
  const loginTab = el('button', { class: 'auth-tab active' }, 'Sign In');
  const registerTab = el('button', { class: 'auth-tab' }, 'Register');
  tabs.appendChild(loginTab);
  tabs.appendChild(registerTab);

  const formContainer = el('div', {});
  card.appendChild(logo);
  card.appendChild(tabs);
  card.appendChild(formContainer);
  screen.appendChild(card);

  let mode = 'login';
  function setMode(m) {
    mode = m;
    loginTab.className = m === 'login' ? 'auth-tab active' : 'auth-tab';
    registerTab.className = m === 'register' ? 'auth-tab active' : 'auth-tab';
    renderForm();
  }

  loginTab.addEventListener('click', () => setMode('login'));
  registerTab.addEventListener('click', () => setMode('register'));

  function renderForm() {
    formContainer.innerHTML = '';
    if (mode === 'login') {
      renderLoginForm(formContainer, onSuccess);
    } else {
      renderRegisterForm(formContainer, onSuccess);
    }
  }
  renderForm();

  return screen;
}

function renderLoginForm(container, onSuccess) {
  const form = el('form', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

  const usernameInput = el('input', {
    class: 'form-input', type: 'text', placeholder: 'Username', name: 'username',
    required: true, autocomplete: 'username'
  });
  const passwordInput = el('input', {
    class: 'form-input', type: 'password', placeholder: 'Password', name: 'password',
    required: true, autocomplete: 'current-password'
  });
  const submitBtn = el('button', { class: 'btn btn-primary', type: 'submit' }, 'Sign In');
  const errorMsg = el('div', { class: 'text-error text-sm', style: { minHeight: '16px' } });

  form.appendChild(usernameInput);
  form.appendChild(passwordInput);
  form.appendChild(errorMsg);
  form.appendChild(submitBtn);
  container.appendChild(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    try {
      await Auth.login(usernameInput.value, passwordInput.value);
      onSuccess();
    } catch (err) {
      errorMsg.textContent = err.message || 'Login failed';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });

  setTimeout(() => usernameInput.focus(), 50);
}

function renderRegisterForm(container, onSuccess) {
  const form = el('form', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  const inputs = {
    username: el('input', { class: 'form-input', type: 'text', placeholder: 'Username (letters, numbers, _)', required: true }),
    email: el('input', { class: 'form-input', type: 'email', placeholder: 'Email', required: true }),
    full_name: el('input', { class: 'form-input', type: 'text', placeholder: 'Full Name (optional)' }),
    password: el('input', { class: 'form-input', type: 'password', placeholder: 'Password (min 8 chars)', required: true }),
    password2: el('input', { class: 'form-input', type: 'password', placeholder: 'Confirm Password', required: true }),
  };

  for (const input of Object.values(inputs)) form.appendChild(input);

  const errorMsg = el('div', { class: 'text-error text-sm', style: { minHeight: '16px' } });
  const submitBtn = el('button', { class: 'btn btn-primary', type: 'submit' }, 'Create Account');
  form.appendChild(errorMsg);
  form.appendChild(submitBtn);
  container.appendChild(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    if (inputs.password.value !== inputs.password2.value) {
      errorMsg.textContent = 'Passwords do not match';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';
    try {
      await Auth.register(inputs.username.value, inputs.email.value,
        inputs.password.value, inputs.full_name.value);
      onSuccess();
    } catch (err) {
      errorMsg.textContent = err.message || 'Registration failed';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
}
