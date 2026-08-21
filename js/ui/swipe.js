// Mesai kayıt satırları için basit sola-kaydır-sil davranışı.

export function enableSwipeToDelete(listEl, { onDelete, onTap }) {
  let active = null;
  let startX = 0;
  let currentX = 0;
  let dragging = false;

  listEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.entry-row__delete');
    const row = e.target.closest('.entry-row');
    if (!row) return;
    if (delBtn) {
      onDelete(row.dataset.id, row);
      return;
    }
    if (row.classList.contains('is-swiped')) {
      row.classList.remove('is-swiped');
      return;
    }
    if (onTap) onTap(row.dataset.id);
  });

  listEl.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.entry-row');
    if (!row) return;
    // Zaten açık bir satır varsa kapat
    for (const r of listEl.querySelectorAll('.entry-row.is-swiped')) {
      if (r !== row) r.classList.remove('is-swiped');
    }
    active = row;
    startX = e.touches[0].clientX;
    currentX = startX;
    dragging = true;
  }, { passive: true });

  listEl.addEventListener('touchmove', (e) => {
    if (!dragging || !active) return;
    currentX = e.touches[0].clientX;
    const delta = currentX - startX;
    if (delta < -10) {
      // Kullanıcı sola kaydırıyor - CSS geçişi is-swiped sınıfı üzerinden yönetilir
    }
  }, { passive: true });

  listEl.addEventListener('touchend', () => {
    if (!dragging || !active) return;
    const delta = currentX - startX;
    if (delta < -40) active.classList.add('is-swiped');
    else active.classList.remove('is-swiped');
    dragging = false;
    active = null;
  });
}
