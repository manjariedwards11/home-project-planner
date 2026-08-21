// Renders a project page (tabs, roadmap, phase panels, decisions, maintenance)
// from its data/<project>.json file. No project facts are hard-coded here —
// costs, statuses, decisions, next actions, and maintenance all come from JSON.
//
// The generic phase renderer looks at which optional fields are present
// (summary / items / candidates / requirements / notes) and renders each with
// a small, reusable treatment, rather than special-casing individual phases.
(() => {
  'use strict';

  // Short nav-tab labels are a display/navigation concern (owned by Claude per
  // PROJECT_RULES.md), not a duplicated fact — the full phase name (the fact)
  // still comes from JSON and is used everywhere else. Falls back to the full
  // name for any phase not listed here, so new phases render without edits.
  const TAB_LABEL_OVERRIDES = {
    'pond-decision': 'Pond',
    'pump-filter': 'Pump/Filter',
    'lotus-buddha': 'Lotus/Buddha',
  };

  function tabLabel(phase) {
    return TAB_LABEL_OVERRIDES[phase.id] || phase.name;
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function money(amount, currency) {
    const symbol = { USD: '$' }[currency] || (currency ? currency + ' ' : '$');
    return symbol + Number(amount).toFixed(2);
  }

  function optionalMoney(amount, currency) {
    return amount == null ? '—' : money(amount, currency);
  }

  // Badges are computed, not stored: "done"/"now" reflect JSON status, and
  // "NEXT" is derived as the lowest-numbered planned phase — no separate
  // hardcoded status category needed to reproduce today's behavior.
  function phaseCardClassAndBadge(phase, nextPlannedNumber) {
    if (phase.status === 'complete') return { cls: 'done', badge: '✓ DONE' };
    if (phase.status === 'current') return { cls: 'now', badge: 'YOU ARE HERE' };
    if (phase.status === 'planned' && phase.number === nextPlannedNumber) return { cls: '', badge: 'NEXT' };
    return { cls: '', badge: '' };
  }

  function renderRoadmap(project) {
    const phases = project.phases;
    const nextPlannedNumber = Math.min(
      ...phases.filter((p) => p.status === 'planned').map((p) => p.number)
    );

    const cards = phases.map((phase) => {
      const { cls, badge } = phaseCardClassAndBadge(phase, nextPlannedNumber);
      const priceLine = phase.spent != null
        ? `<div class="price">${esc(money(phase.spent, project.currency))} spent</div>`
        : '';
      return `
        <div class="phase-card${cls ? ' ' + cls : ''}">
          <div class="phase-top">
            <span class="phase-num">Phase ${phase.number}</span>
            ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
          </div>
          <h3>${esc(phase.name)}</h3>
          <p>${esc(phase.summary || '')}</p>
          ${priceLine}
        </div>`;
    }).join('');

    const nextActionNotice = project.nextAction
      ? `<div class="notice"><strong>Next action:</strong> ${esc(project.nextAction)}</div>`
      : '';

    return `
      <h2>Roadmap</h2>
      ${nextActionNotice}
      <div class="road">${cards}</div>`;
  }

  // One field type -> one rendering treatment, applied uniformly across every
  // phase regardless of phase number.
  function renderPhaseBody(phase) {
    let html = '';

    if (phase.summary) {
      html += `<div class="box"><p>${esc(phase.summary)}</p></div>`;
    }

    if (phase.items && phase.items.length) {
      html += `<div class="box"><ul>${phase.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
    }

    if (phase.candidates && phase.candidates.length) {
      html += `<div class="grid">${phase.candidates.map((c) => `
        <div class="box">
          <h3>${esc(c.name)}</h3>
          <p><strong>${esc(capitalize(c.status.replace(/-/g, ' ')))}</strong>${c.dimensions ? ' · ' + esc(c.dimensions) : ''}</p>
          ${c.estimatedVolume ? `<p>${esc(c.estimatedVolume)}</p>` : ''}
          ${c.notes ? `<p>${esc(c.notes)}</p>` : ''}
          ${c.links && c.links.length ? `<p>${c.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' · ')}</p>` : ''}
        </div>`).join('')}</div>`;
    }

    if (phase.decisionCriteria && phase.decisionCriteria.length) {
      html += `<div class="box"><h3>Decision criteria</h3><ul>${phase.decisionCriteria.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
    }

    if (phase.requirements && phase.requirements.length) {
      html += `<div class="box"><ul>${phase.requirements.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
    }

    if (phase.spendBreakdown && phase.spendBreakdown.length) {
      html += `<div class="box"><h3>Spend</h3><table><tr><th>Item</th><th>Amount</th></tr>${phase.spendBreakdown.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(money(s.amount, 'USD'))}</td></tr>`).join('')}</table></div>`;
    }

    if (phase.notes && phase.notes.length) {
      html += phase.notes.map((n) => `<div class="notice">${esc(n)}</div>`).join('');
    }

    return html;
  }

  function renderPhasePanels(project) {
    return project.phases.map((phase) => `
      <section id="p${phase.number}" class="panel">
        <h2>Phase ${phase.number} — ${esc(phase.name)}</h2>
        ${renderPhaseBody(phase)}
      </section>`).join('');
  }

  function shoppingStatusLabel(status) {
    return {
      bought: 'Already Bought',
      considering: 'Considering',
      'need-to-buy': 'Need to Buy',
      rejected: 'Rejected',
    }[status] || capitalize(String(status || '').replace(/-/g, ' '));
  }

  function renderShopping(project) {
    const items = project.shopping || [];
    if (!items.length) return '';

    const budget = project.budget || {};
    const budgetSummary = `
      <div class="box">
        <p><strong>Project budget:</strong> ${esc(optionalMoney(budget.planned, project.currency))} · <strong>Spent:</strong> ${esc(optionalMoney(budget.spentToDate != null ? budget.spentToDate : project.spentToDate, project.currency))} · <strong>Remaining:</strong> ${esc(optionalMoney(budget.remaining, project.currency))}</p>
        ${budget.note ? `<p>${esc(budget.note)}</p>` : ''}
      </div>`;

    const order = ['bought', 'considering', 'need-to-buy', 'rejected'];
    const groups = order.map((status) => {
      const rows = items.filter((i) => i.status === status);
      if (!rows.length) return '';
      return `
        <div class="box">
          <h3>${esc(shoppingStatusLabel(status))}</h3>
          <table>
            <tr><th>Phase</th><th>Item</th><th>Store / Link</th><th>Price</th><th>Actual</th><th>Budget</th></tr>
            ${rows.map((i) => `
              <tr>
                <td>${i.phase != null ? 'P' + esc(i.phase) : '—'}</td>
                <td><strong>${esc(i.item)}</strong>${i.note ? `<br>${esc(i.note)}` : ''}</td>
                <td>${i.store ? esc(i.store) : '—'}${i.link ? `<br><a href="${esc(i.link)}" target="_blank" rel="noopener">Open link</a>` : ''}</td>
                <td>${esc(optionalMoney(i.price, project.currency))}</td>
                <td>${esc(optionalMoney(i.actualCost, project.currency))}</td>
                <td>${esc(optionalMoney(i.budget, project.currency))}</td>
              </tr>`).join('')}
          </table>
        </div>`;
    }).join('');

    return `<h2 style="margin-top:16px">Shopping + Budget</h2>${budgetSummary}${groups}`;
  }

  function renderDecisions(project) {
    const rows = (project.decisions || []).map((d) => `
      <tr>
        <td>${esc(d.item)}</td>
        <td>${esc(capitalize(d.status))}</td>
        <td>${esc(d.decision)}</td>
      </tr>`).join('');

    const maintenance = (project.maintenance || []).map((m) =>
      `<li>${esc(m.frequency)}: ${esc(m.task)} (${esc(m.time)})</li>`
    ).join('');

    return `
      <section id="decisions" class="panel">
        <h2>Locked + Open Decisions</h2>
        <table>
          <tr><th>Item</th><th>Status</th><th>Decision</th></tr>
          ${rows}
        </table>
        ${renderShopping(project)}
        ${maintenance ? `<div class="notice success" style="margin-top:10px"><strong>Maintenance</strong><ul>${maintenance}</ul></div>` : ''}
      </section>`;
  }

  function renderTabs(project) {
    const phaseTabs = project.phases.map((phase) =>
      `<button class="tab" data-tab="p${phase.number}">${phase.number} — ${esc(tabLabel(phase))}</button>`
    ).join('');
    return `
      <button class="tab active" data-tab="roadmap">Roadmap</button>
      ${phaseTabs}
      <button class="tab" data-tab="decisions">Decisions</button>`;
  }

  function renderStatusPill(project) {
    const currentPhase = project.phases.find((p) => p.number === project.currentPhase);
    const label = currentPhase ? currentPhase.name : '';
    return `PHASE ${project.currentPhase} · ${esc(label.toUpperCase())}`;
  }

  function initTabs() {
    const tabs = [...document.querySelectorAll('.tab')];
    const panels = [...document.querySelectorAll('.panel')];
    function show(id) {
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
      panels.forEach((p) => p.classList.toggle('active', p.id === id));
      history.replaceState(null, '', '#' + id);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
    const start = location.hash.replace('#', '');
    if (start && document.getElementById(start)) show(start);
  }

  async function render() {
    const root = document.querySelector('[data-project]');
    if (!root) return;
    const dataFile = root.getAttribute('data-project-file');

    const res = await fetch(dataFile);
    const project = await res.json();

    const statusMount = document.querySelector('[data-project-status]');
    if (statusMount) statusMount.innerHTML = renderStatusPill(project);

    const tabsMount = document.querySelector('[data-tabs]');
    if (tabsMount) tabsMount.innerHTML = renderTabs(project);

    const panelsMount = document.querySelector('[data-panels]');
    if (panelsMount) {
      panelsMount.innerHTML = `
        <section id="roadmap" class="panel active">${renderRoadmap(project)}</section>
        ${renderPhasePanels(project)}
        ${renderDecisions(project)}`;
    }

    initTabs();
  }

  render().catch((err) => {
    console.error('[render-project] failed to load project data', err);
  });
})();
