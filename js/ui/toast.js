// Basit toast/snackbar kontrolcüsü. Geri-al (undo) aksiyonunu destekler.

const stack = document.getElementById('toastStack');

export function showToast(message, { actionLabel, onAction, duration = 3800 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${message}</span>`;
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'toast__action';
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      if (onAction) onAction();
      dismiss();
    });
    el.appendChild(btn);
  }
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
  }
  const timer = setTimeout(dismiss, duration);
  el.addEventListener('click', (e) => {
    if (e.target === el) { clearTimeout(timer); dismiss(); }
  });
}
