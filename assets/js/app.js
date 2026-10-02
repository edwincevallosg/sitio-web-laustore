(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const toast = (message) => {
    const el = $('#toast'); if (!el) return;
    el.textContent = message; el.classList.add('show');
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => el.classList.remove('show'), 3600);
  };

  // WhatsApp solo para páginas de acceso público.
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const nonPublicPages = new Set(['gestion-inventario.html']);

  if (!nonPublicPages.has(currentPage)) {
    const whatsappStyle = document.createElement('style');
    whatsappStyle.textContent = `
      .whatsapp-float {
        position: fixed;
        right: 22px;
        bottom: 22px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #25D366;
        color: #fff;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
        z-index: 9999;
        transition: transform .2s ease, box-shadow .2s ease;
      }
      .whatsapp-float:hover,
      .whatsapp-float:focus-visible {
        transform: translateY(-3px) scale(1.04);
        box-shadow: 0 12px 30px rgba(0, 0, 0, .28);
      }
      .whatsapp-float:focus-visible {
        outline: 3px solid #111;
        outline-offset: 3px;
      }
      .whatsapp-float svg {
        width: 32px;
        height: 32px;
        fill: currentColor;
      }
      @media (max-width: 640px) {
        .whatsapp-float {
          right: 16px;
          bottom: 16px;
          width: 56px;
          height: 56px;
        }
        .whatsapp-float svg {
          width: 30px;
          height: 30px;
        }
      }
    `;
    document.head.appendChild(whatsappStyle);

    const whatsappButton = document.createElement('a');
    whatsappButton.className = 'whatsapp-float';
    whatsappButton.href = 'https://wa.me/593983894681';
    whatsappButton.target = '_blank';
    whatsappButton.rel = 'noopener noreferrer';
    whatsappButton.setAttribute('aria-label', 'Contactar a LauStore por WhatsApp');
    whatsappButton.title = 'Escríbenos por WhatsApp';
    whatsappButton.innerHTML = `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M19.11 17.21c-.27-.14-1.62-.8-1.87-.89-.25-.09-.43-.14-.61.14-.18.27-.7.89-.86 1.07-.16.18-.32.2-.59.07-.27-.14-1.15-.42-2.19-1.35-.81-.72-1.36-1.61-1.52-1.88-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.48-.84-2.03-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.3 0 1.35.98 2.66 1.12 2.84.14.18 1.93 2.94 4.68 4.13.65.28 1.16.45 1.56.58.66.21 1.25.18 1.72.11.52-.08 1.62-.66 1.85-1.3.23-.64.23-1.19.16-1.3-.07-.11-.25-.18-.52-.32Z"/>
        <path d="M16.03 3.2c-7.08 0-12.84 5.72-12.84 12.76 0 2.25.59 4.45 1.71 6.39L3.08 29l6.82-1.79a12.9 12.9 0 0 0 6.13 1.56h.01c7.08 0 12.84-5.72 12.84-12.76 0-3.41-1.34-6.62-3.76-9.03A12.8 12.8 0 0 0 16.03 3.2Zm0 23.42h-.01a10.72 10.72 0 0 1-5.46-1.49l-.39-.23-4.05 1.06 1.08-3.94-.26-.4a10.58 10.58 0 0 1-1.64-5.66c0-5.87 4.81-10.64 10.73-10.64 2.87 0 5.56 1.11 7.59 3.13a10.54 10.54 0 0 1 3.14 7.51c0 5.87-4.81 10.65-10.73 10.65Z"/>
      </svg>
    `;
    document.body.appendChild(whatsappButton);
  }

  const menu = $('#site-nav');
  $('#menu-toggle')?.addEventListener('click', (e) => {
    const open = menu?.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(Boolean(open)));
  });

  $$('.faq-question').forEach((btn) => btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item'); const open = item.dataset.open === 'true';
    item.dataset.open = String(!open); btn.setAttribute('aria-expanded', String(!open));
  }));

  $$('form[data-demo]').forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = form.dataset.message || 'Solicitud registrada en esta demostración.';
    toast(msg + ' Para producción se debe conectar el flujo a correo, CRM, API o base de datos.');
    form.reset();
  }));

  const search = $('#catalog-search');
  const filters = $$('[data-filter], #catalog-category');
  const filterCatalog = () => {
    if (!search && !filters.length) return;
    const q = (search?.value || '').toLowerCase().trim(); let shown = 0;
    $$('[data-search]').forEach((card) => {
      const okQ = !q || (card.dataset.search || '').includes(q);
      const okFilters = filters.every((control) => {
        const value = (control.value || 'all').toLowerCase();
        if (value === 'all') return true;
        const field = control.dataset.filter || 'category';
        const actual = (card.dataset[field] || '').toLowerCase();
        if (field === 'price') {
          const price = Number(card.dataset.priceValue || 0);
          const [min, max] = value.split('-').map(Number);
          return price >= min && (!max || price <= max);
        }
        return actual.split('|').includes(value) || actual.includes(value);
      });
      card.hidden = !(okQ && okFilters); if (!card.hidden) shown++;
    });
    const empty = $('#catalog-empty'); if (empty) empty.style.display = shown ? 'none' : 'block';
  };
  search?.addEventListener('input', filterCatalog);
  filters.forEach((el) => el.addEventListener('change', filterCatalog));
  filterCatalog();

  $$('[data-action]').forEach((btn) => btn.addEventListener('click', (e) => {
    if (btn.tagName === 'A' && btn.getAttribute('href') && btn.getAttribute('href') !== '#') return;
    e.preventDefault();
    toast(btn.dataset.message || 'Acción demostrativa registrada.');
  }));

  const calc = $('#quote-calculator');
    const recalc = () => {
    if (!calc) return;
    const mode = calc.dataset.mode || 'quote';
    const result = $('#calc-result'); const detail = $('#calc-detail');
    if (!result) return;
    if (mode === 'flatfee') {
      const order = Number($('#calc-order')?.value || 0);
      const fee = Number(calc.dataset.flatFee || 2.5);
      result.textContent = '$' + fee.toFixed(2);
      if (detail) detail.textContent = order ? `Orden demo: $${order.toFixed(2)} · tarifa fija, no porcentual.` : 'Ingrese un valor de orden para visualizar el ejemplo.';
      return;
    }
    if (mode === 'triage') {
      const pages = Math.max(0, Number($('#calc-pages')?.value || 0));
      const complexity = Number($('#calc-complexity')?.value || 1);
      const sources = Number($('#calc-sources')?.value || 1);
      const hours = Math.max(1, Math.ceil((pages / 18) * complexity + sources * .65));
      result.textContent = `${hours} h aprox.`;
      if (detail) detail.textContent = 'Estimación de revisión humana; no representa una promesa, dictamen ni automatización sin supervisión.';
      return;
    }
    if (mode === 'audit') {
      const amount = Math.max(0, Number($('#calc-amount')?.value || 0));
      const factor = Number($('#calc-service')?.value || 0);
      const scenario = amount * factor;
      result.textContent = factor ? '$' + scenario.toLocaleString('es-EC', {maximumFractionDigits: 2}) : 'A definir';
      if (detail) detail.textContent = 'Escenario didáctico con factor ilustrativo; confirme normativa, fechas y situación concreta con un profesional.';
      return;
    }
    const base = Number($('#calc-service')?.value || 0);
    const size = Number($('#calc-size')?.value || 1);
    const urgency = Number($('#calc-urgency')?.value || 1);
    const total = Math.round(base * size * urgency);
    result.textContent = total ? '$' + total.toLocaleString('es-EC') : 'A definir';
  };
  $$('#quote-calculator input, #quote-calculator select').forEach((el) => {
    el.addEventListener('input', recalc); el.addEventListener('change', recalc);
  });
  recalc();

  const chat = $('#assistant-form');
  chat?.addEventListener('submit', (e) => {
    e.preventDefault(); const input = $('#assistant-input'); const value = input?.value.trim(); if (!value) return;
    const stream = $('#chat-stream'); const user = document.createElement('div'); user.className = 'bubble user'; user.textContent = value; stream?.append(user);
    const bot = document.createElement('div'); bot.className = 'bubble';
    bot.textContent = chat.dataset.response || 'Demostración: la consulta se validaría contra permisos, fuentes y políticas antes de ejecutar cualquier acción.';
    stream?.append(bot); input.value = ''; stream?.scrollTo({top: stream.scrollHeight, behavior: 'smooth'});
  });

  $$('[data-copy]').forEach((btn) => btn.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await navigator.clipboard.writeText(btn.dataset.copy); toast('Copiado al portapapeles.'); }
    catch { toast('No fue posible copiar automáticamente.'); }
  }));
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
})();