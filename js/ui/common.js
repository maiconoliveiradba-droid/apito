// Peças de interface compartilhadas: sheet (dialog), formulários, confirmação, toast e compartilhamento
import { $, esc, html, raw, uid } from '../util.js';

let toastTimer;
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}

const dlg = () => $('#sheet');
export function closeSheet() { const d = dlg(); if (d.open) d.close(); }
export function openSheet({ title, body, foot = '', wide = false, onMount }) {
  const d = dlg();
  d.className = wide ? 'wide' : '';
  d.innerHTML = html`<form method="dialog" class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon" aria-label="Fechar" value="x">✕</button></form>
    <div class="sheet-body">${body}</div>${foot ? html`<div class="sheet-foot">${foot}</div>` : ''}`.toString();
  d.setAttribute('aria-labelledby', 'sheet-title');
  if (!d.open) d.showModal();
  if (onMount) onMount(d);
  return d;
}
dlg()?.addEventListener?.('click', (e) => { if (e.target === dlg() || e.target.closest('[data-close]')) closeSheet(); });

function onRealClose(d, cb) {
  const h = () => { if (d.open) return; d.removeEventListener('close', h); cb(); };
  d.addEventListener('close', h); return () => d.removeEventListener('close', h);
}

export function confirmBox(message, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false; let off = () => {}; const fin = (v) => { if (!done) { done = true; off(); d.removeEventListener('click', onClick); resolve(v); } };
    const onClick = (e) => { const x = e.target.closest('[data-x]')?.dataset.x; if (x) { fin(x === 'yes'); closeSheet(); } };
    const d = openSheet({ title: 'Confirme', body: html`<p class="msg">${message}</p>`,
      foot: html`<button class="btn" data-x="no">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${ok}</button>` });
    d.addEventListener('click', onClick); off = onRealClose(d, () => fin(false));
  });
}

/**
 * Formulário em sheet. fields: [{name,label,type,value,options,step,min,max,hint,placeholder,rows,required}]
 * type: text, number, date, time, tel, select, check, textarea. Chama onSubmit(valores) e fecha se não retornar false.
 */
export function formSheet({ title, fields, submit = 'Salvar', onSubmit, extra = '' }) {
  const id = 'f' + uid();
  const input = (f) => {
    const v = f.value ?? '';
    if (f.type === 'select') return html`<select name="${f.name}">${f.options.map((o) => html`<option value="${o.v}" ${String(o.v) === String(v) ? raw('selected') : ''}>${o.t}</option>`)}</select>`;
    if (f.type === 'check') return html`<label class="check"><input type="checkbox" name="${f.name}" ${v ? raw('checked') : ''}> <span>${f.text || f.label}</span></label>`;
    if (f.type === 'textarea') return html`<textarea name="${f.name}" rows="${f.rows || 4}" placeholder="${f.placeholder || ''}">${v}</textarea>`;
    return html`<input name="${f.name}" type="${f.type || 'text'}" value="${v}" ${f.step ? raw(`step="${esc(f.step)}"`) : ''} ${f.min != null ? raw(`min="${esc(f.min)}"`) : ''} ${f.max != null ? raw(`max="${esc(f.max)}"`) : ''} placeholder="${f.placeholder || ''}" ${f.required ? raw('required') : ''} ${f.type === 'number' ? raw('inputmode="decimal"') : ''}>`;
  };
  const body = html`<form id="${id}" class="form">${fields.map((f) => f.type === 'check' ? html`<div class="field">${input(f)}${f.hint ? html`<small>${f.hint}</small>` : ''}</div>`
    : html`<div class="field"><label>${f.label}${input(f)}${f.hint ? html`<small>${f.hint}</small>` : ''}</label></div>`)}${raw(extra)}</form>`;
  const d = openSheet({ title, body, foot: html`<button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" form="${id}" type="submit">${submit}</button>`,
    onMount: (dd) => {
      const form = dd.querySelector('form.form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const vals = {}; fields.forEach((f) => {
          const el = form.elements[f.name]; if (!el) return;
          vals[f.name] = f.type === 'check' ? el.checked : f.type === 'number' ? (el.value === '' ? null : parseFloat(String(el.value).replace(',', '.'))) : el.value.trim();
        });
        const r = await onSubmit(vals, form); if (r !== false) closeSheet();
      });
      form.querySelector('input:not([type=checkbox]),select,textarea')?.focus();
    } });
  return d;
}

// Lista de jogadores para escolher um (gol, assistência, falha...). Resolve com o id ou null.
export function pickPlayer({ title, players, allowNone = '', hint = '' }) {
  return new Promise((resolve) => {
    let done = false; let off = () => {}; const fin = (v) => { if (!done) { done = true; off(); d.removeEventListener('click', onClick); resolve(v); } };
    const onClick = (e) => { const b = e.target.closest('[data-id]'); if (b) { fin(b.dataset.id || ''); closeSheet(); } };
    const d = openSheet({ title, body: html`${hint ? html`<p class="hint">${hint}</p>` : ''}<div class="pick">${allowNone ? html`<button class="row-btn dim" data-id="">${allowNone}</button>` : ''}${players.map((p) => html`<button class="row-btn" data-id="${p.id}"><span>${p.name}</span><small>${p.position === 'goleiro' ? 'goleiro' : ''} ${p.teamName || ''}</small></button>`)}</div>` });
    d.addEventListener('click', onClick); off = onRealClose(d, () => fin(null));
  });
}

export async function shareText(text, title = 'Apito') {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch (e) {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast('Copiado'); } catch (_) { toast('Não foi possível copiar'); } t.remove();
  }
}
export function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
export async function shareImage(blob, name, title) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  download(name, blob); toast('Imagem salva no aparelho');
}

// Cartão em imagem (canvas) para compartilhar rankings, times e destaques
export function renderCard({ title, subtitle = '', rows = [], footer = 'Apito', accent = '#ff7a1a' }) {
  const W = 1080; const rowH = 92; const H = Math.max(1080, 380 + rows.length * rowH + 150);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#153b5c'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 6; x.strokeRect(36, 36, W - 72, H - 72);
  x.beginPath(); x.moveTo(36, 236); x.lineTo(W - 36, 236); x.stroke();
  x.fillStyle = accent; x.fillRect(36, 36, 18, 200);
  x.fillStyle = '#fff'; x.font = '800 72px system-ui, sans-serif'; x.textBaseline = 'alphabetic';
  let t = title; while (x.measureText(t).width > W - 200 && t.length > 4) t = t.slice(0, -2); x.fillText(t === title ? t : t + '…', 90, 135);
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '500 38px system-ui, sans-serif'; x.fillText(subtitle, 90, 200);
  rows.forEach((r, i) => {
    const y = 280 + i * rowH; if (i % 2 === 0) { x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(60, y, W - 120, rowH - 8); }
    x.fillStyle = r.hot ? accent : '#fff'; x.font = '800 44px system-ui, sans-serif'; x.fillText(String(r.left ?? ''), 90, y + 60);
    x.fillStyle = '#fff'; x.font = '600 44px system-ui, sans-serif'; let n = String(r.name ?? ''); while (x.measureText(n).width > 620 && n.length > 3) n = n.slice(0, -2);
    x.fillText(n === r.name ? n : n + '…', 190, y + 60);
    x.textAlign = 'right'; x.fillStyle = accent; x.font = '800 46px system-ui, sans-serif'; x.fillText(String(r.right ?? ''), W - 90, y + 60); x.textAlign = 'left';
  });
  x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '500 34px system-ui, sans-serif'; x.fillText(footer, 90, H - 80);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
