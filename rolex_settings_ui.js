/**
 * TradingView-style indicator settings panel for Rolex v3.
 * Requires: RolexV3 (rolex_v3_params.js), RolexAPI (rolex_api.js)
 */
(function (global) {
  const GROUP_ORDER = ['Momentum', 'Volume', 'Trend', 'Structure', 'Timing', 'Trailing', 'Exit'];

  function mountPanel(opts) {
    const {
      containerId,
      params,
      tier = 'standard',
      features = {},
      onApply,
      onSave,
      onApplyBot,
      onReset,
      onClose,
    } = opts;

    const el = document.getElementById(containerId);
    if (!el) return null;

    const isPremium = tier === 'premium';
    const canEdit = true; // chart preview tweaking for all tiers
    const draft = { ...RolexV3.sanitizeParams(params) };

    const groups = {};
    for (const m of RolexV3.V3_PARAM_META) {
      if (!groups[m.group]) groups[m.group] = [];
      groups[m.group].push(m);
    }

    el.innerHTML = `
      <div class="setHeader">
        <div>
          <div class="setTitle">BULL/BEAR MOM ELITE</div>
          <div class="setSub">Rolex v3 indicator inputs</div>
        </div>
        <button type="button" class="setClose" id="setCloseBtn" title="Close">✕</button>
      </div>
      ${!isPremium ? `<div class="premiumGate">
        <span class="premiumBadge">PREMIUM</span>
        Preview &amp; tweak on chart freely. Save custom settings and apply to live bots with Premium.
        <a href="/RolexHome.html#authSection">Upgrade →</a>
      </div>` : ''}
      <div class="setBody" id="setBody"></div>
      <div class="setFooter">
        <button type="button" class="setBtn ghost" id="setResetBtn">Reset defaults</button>
        <button type="button" class="setBtn" id="setApplyBtn">Apply to chart</button>
        ${isPremium ? `<button type="button" class="setBtn primary" id="setSaveBtn">Save profile</button>` : ''}
        ${isPremium && onApplyBot ? `<button type="button" class="setBtn accent" id="setBotBtn">Apply to bot</button>` : ''}
      </div>
      <div class="setMsg" id="setMsg"></div>
    `;

    const body = el.querySelector('#setBody');
    for (const g of GROUP_ORDER) {
      if (!groups[g]) continue;
      const sec = document.createElement('div');
      sec.className = 'setGroup';
      sec.innerHTML = `<div class="setGroupTitle">${g}</div>`;
      const grid = document.createElement('div');
      grid.className = 'setGrid';

      for (const m of groups[g]) {
        const val = draft[m.key];
        const row = document.createElement('div');
        row.className = 'setRow';
        row.title = m.desc || '';

        if (m.type === 'bool') {
          row.innerHTML = `
            <label class="setLabel chk">
              <input type="checkbox" data-key="${m.key}" ${val ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
              <span>${m.label}</span>
            </label>
            <div class="setHint">${m.desc || ''}</div>`;
        } else if (m.type === 'select') {
          const options = (m.options || []).map(opt => 
            `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`
          ).join('');
          row.innerHTML = `
            <div class="setLabelRow">
              <span class="setLabel">${m.label}</span>
              <select class="setSelect" data-key="${m.key}" ${canEdit ? '' : 'disabled'}>
                ${options}
              </select>
            </div>
            <div class="setHint">${m.desc || ''}</div>`;
        } else {
          row.innerHTML = `
            <div class="setLabelRow">
              <span class="setLabel">${m.label}</span>
              <input class="setInput" type="number" data-key="${m.key}"
                value="${val}" min="${m.min}" max="${m.max}" step="${m.step}"
                ${canEdit ? '' : 'disabled'}>
            </div>
            <input class="setRange" type="range" data-key="${m.key}"
              value="${val}" min="${m.min}" max="${m.max}" step="${m.step}"
              ${canEdit ? '' : 'disabled'}>
            <div class="setHint">${m.desc || ''}</div>`;
        }
        grid.appendChild(row);
      }
      sec.appendChild(grid);
      body.appendChild(sec);
    }

    function readDraft() {
      const next = { ...RolexV3.V3_DEFAULTS };
      el.querySelectorAll('[data-key]').forEach(inp => {
        const key = inp.dataset.key;
        const meta = RolexV3.V3_PARAM_META.find(x => x.key === key);
        if (!meta) return;
        if (meta.type === 'bool') next[key] = inp.checked;
        else if (meta.type === 'select') next[key] = inp.value;
        else next[key] = meta.type === 'int' ? parseInt(inp.value, 10) : parseFloat(inp.value);
      });
      Object.assign(draft, RolexV3.sanitizeParams(next));
      syncInputs();
      return draft;
    }

    function syncInputs() {
      el.querySelectorAll('[data-key]').forEach(inp => {
        const key = inp.dataset.key;
        const meta = RolexV3.V3_PARAM_META.find(x => x.key === key);
        if (!meta) return;
        if (meta.type === 'bool') inp.checked = !!draft[key];
        else inp.value = draft[key];
      });
    }

    function setMsg(text, ok) {
      const m = el.querySelector('#setMsg');
      m.textContent = text || '';
      m.className = 'setMsg' + (ok === true ? ' ok' : ok === false ? ' err' : '');
    }

    el.querySelectorAll('input[data-key]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.key;
        const meta = RolexV3.V3_PARAM_META.find(x => x.key === key);
        if (!meta) return;
        if (meta.type === 'bool') draft[key] = inp.checked;
        else draft[key] = meta.type === 'int' ? parseInt(inp.value, 10) : parseFloat(inp.value);
        draft[key] = RolexV3.sanitizeParams(draft)[key];
        el.querySelectorAll(`[data-key="${key}"]`).forEach(sib => {
          if (sib !== inp) {
            if (meta.type === 'bool') sib.checked = draft[key];
            else sib.value = draft[key];
          }
        });
        if (onApply) onApply({ ...draft }, { preview: true, silent: true });
      });
    });

    el.querySelector('#setResetBtn').onclick = () => {
      Object.assign(draft, { ...RolexV3.V3_DEFAULTS });
      syncInputs();
      if (onReset) onReset({ ...draft });
      if (onApply) onApply({ ...draft });
      setMsg('Reset to defaults', true);
    };

    el.querySelector('#setApplyBtn').onclick = () => {
      const p = readDraft();
      if (onApply) onApply(p);
      setMsg('Applied to chart', true);
    };

    if (isPremium) {
      el.querySelector('#setSaveBtn').onclick = async () => {
        const p = readDraft();
        if (onSave) {
          try {
            await onSave(p);
            setMsg('✓ Saved to your Rolex profile', true);
          } catch (e) {
            setMsg(e.message, false);
          }
        }
      };
      const botBtn = el.querySelector('#setBotBtn');
      if (botBtn && onApplyBot) {
        botBtn.onclick = async () => {
          const p = readDraft();
          try {
            await onApplyBot(p);
            setMsg('✓ Applied to live bot — restart bot to fully reload signals', true);
          } catch (e) {
            setMsg(e.message, false);
          }
        };
      }
    }

    el.querySelector('#setCloseBtn').onclick = () => {
      if (onClose) onClose();
    };

    return {
      getParams: () => ({ ...draft }),
      setParams: (p) => {
        Object.assign(draft, RolexV3.sanitizeParams(p));
        syncInputs();
      },
      setMsg,
    };
  }

  global.RolexSettingsUI = { mountPanel };
})(window);
