// 24 saatlik özel saat/dakika seçici (dakika 1'er adımlı) — tarayıcının yerel
// <input type="time"> bileşenine bağlı kalmadan her cihazda tutarlı gösterir (AM/PM karışıklığı
// olmaz, Türkiye'de saat hep 24 saatlik yazılır). entry.js ve settings.js
// tarafından paylaşılır.
export function timeSelectHTML(prefix, value) {
  const [h, m] = value.split(':');
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  // Dakika tek tek seçilebilir: kullanıcı tam çıktığı saati girebilsin
  // (eskiden yalnızca 00/15/30/45 vardı, 19:23 gibi bir saat girilemiyordu).
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  return `
    <div class="time-select">
      <select class="input time-select__part" id="${prefix}Hour">
        ${hours.map((hh) => `<option value="${hh}" ${hh === h ? 'selected' : ''}>${hh}</option>`).join('')}
      </select>
      <span class="time-select__colon">:</span>
      <select class="input time-select__part" id="${prefix}Minute">
        ${minutes.map((mm) => `<option value="${mm}" ${mm === m ? 'selected' : ''}>${mm}</option>`).join('')}
      </select>
    </div>
  `;
}
