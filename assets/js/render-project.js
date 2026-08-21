// Renders a project page (stat bar, side nav, roadmap, phase panels,
// decisions, shopping/budget) from its data/<project>.json file, plus an
// optional data/<projectId>-cost-plan.json. No project facts are hard-coded
// here — title, lede, costs, statuses, phase content, decisions, shopping,
// and maintenance all come from JSON.
//
// The generic phase renderer looks at which optional fields are present
// (summary / items / candidates / requirements / decisionCriteria /
// spendBreakdown / notes) and renders each with a small, reusable
// treatment, rather than special-casing individual phases.
(() => {
  'use strict';

  let currentProjectId = '';
  let projectTodos = null;

  // Short nav-tab labels are a display/navigation concern (owned by Claude per
  // PROJECT_RULES.md), not a duplicated fact — the full phase name (the fact)
  // still comes from JSON and is used everywhere else. Falls back to the full
  // name for any phase not listed here, so new phases render without edits.
  const TAB_LABEL_OVERRIDES = {
    'pond-decision': 'Pond',
    'pump-filter': 'Pump/Filter',
    'lotus-buddha': 'Lotus/Buddha',
    'future-fish-ready': 'Future / Fish',
    'pond-placement': 'Placement',
    'lighting': 'Lighting',
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

  function humanizeSlug(str) {
    return capitalize(String(str).replace(/-/g, ' '));
  }

  function money(amount, currency) {
    const symbol = { USD: '$' }[currency] || (currency ? currency + ' ' : '$');
    return symbol + Number(amount).toFixed(2);
  }

  function wholeAmount(amount) {
    return Number(amount).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function optionalMoney(amount, currency) {
    return amount == null ? '—' : money(amount, currency);
  }

  // Ranges carry the currency symbol once, on the low end: "$660–1,275".
  // A range whose ends match is a single figure, not "$30–30".
  function moneyRange(min, max, currency) {
    if (min == null || max == null) return '—';
    if (Number(min) === Number(max)) return money(min, currency);
    const symbol = { USD: '$' }[currency] || (currency ? currency + ' ' : '$');
    return `${symbol}${wholeAmount(min)}–${wholeAmount(max)}`;
  }

  // Statuses arrive as compound slugs ("selected-purchased",
  // "not-selected-final-alternate"), so match on meaning rather than exact
  // strings — and test the negatives first, since "not-selected" contains
  // "selected".
  function isNegativeStatus(status) {
    return /^(not-|rejected|paused|alternate|excluded)|not-selected|not-active|future-idea/.test(String(status));
  }

  function isSettledStatus(status) {
    if (isNegativeStatus(status)) return false;
    return /complete|purchased|bought|locked|selected|done/.test(String(status));
  }

  function isPendingStatus(status) {
    if (isNegativeStatus(status) || isSettledStatus(status)) return false;
    return /open|conditional|under-evaluation|candidate|considering|need-to-buy|pending|in-planning|preferred|current/.test(String(status));
  }

  // Green = settled, amber = still in play, neutral = not happening.
  function statusPillClass(status) {
    if (isSettledStatus(status)) return 'green';
    if (isPendingStatus(status)) return 'amber';
    return '';
  }

  // The option that was chosen, whether still preferred or already purchased.
  function isChosen(status) {
    if (isNegativeStatus(status)) return false;
    return /preferred|selected/.test(String(status));
  }

  // Badges are computed, not stored: "done"/"now" reflect JSON status, and
  // "NEXT" is derived as the lowest-numbered planned phase — no separate
  // hardcoded status category needed.
  function phaseBadge(phase, nextPlannedNumber) {
    if (phase.status === 'complete') return { navCls: 'status-complete', badge: '✓ Done', rowCls: 'is-complete' };
    if (phase.status === 'current') return { navCls: 'status-current', badge: 'You are here', rowCls: 'is-current' };
    if (phase.status === 'planned' && phase.number === nextPlannedNumber) return { navCls: '', badge: 'Next', rowCls: 'is-next' };
    return { navCls: '', badge: '', rowCls: '' };
  }

  function renderStatRow(project) {
    const totalPhases = project.phases.length;
    const pct = Math.round((project.currentPhase / totalPhases) * 100);
    return `
      <div class="stat">
        <span class="stat-label">Phase</span>
        <span class="stat-value">${project.currentPhase} / ${totalPhases}</span>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="stat">
        <span class="stat-label">Spent</span>
        <span class="stat-value">${esc(money(project.spentToDate, project.currency))}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Status</span>
        <span class="stat-value">${esc(capitalize(project.status || ''))}</span>
      </div>
      ${project.nextAction ? `
      <div class="stat next-action" title="${esc(project.nextAction)}">
        <span class="stat-label">Next action</span>
        <span class="stat-value">${esc(project.nextAction)}</span>
      </div>` : ''}
    `;
  }

  function renderOverviewAccordion(project, costPlan) {
    const goals = project.goals && project.goals.length
      ? `<p><strong>Goals</strong></p><ul>${project.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>`
      : '';
    const sc = project.siteConstraints;
    // Rendered generically so a newly added constraint (location, and whatever
    // comes next) appears without a code change.
    const constraintItems = sc
      ? Object.values(sc).filter((v) => typeof v === 'string' && v.trim())
      : [];
    const constraints = constraintItems.length
      ? `<p><strong>Site constraints</strong></p><ul>${constraintItems.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`
      : '';
    const cp = costPlan || {};
    const accounting = (cp.accountingNote || cp.title || cp.subtitle)
      ? `<p><strong>Cost accounting</strong></p>
         ${cp.title ? `<p>${esc(cp.title)}${cp.subtitle ? ` — ${esc(cp.subtitle)}` : ''}</p>` : ''}
         ${cp.accountingNote ? `<p>${esc(cp.accountingNote)}</p>` : ''}`
      : '';
    if (!goals && !constraints && !accounting) return '';
    return `
      <details class="accordion">
        <summary>Goals, site constraints &amp; cost accounting</summary>
        <div class="accordion-body">${goals}${constraints}${accounting}</div>
      </details>`;
  }

  // The three headline financial figures, shown as a single compact strip so
  // target / estimate / actual are legible at a glance without a second table.
  function renderCostSummary(costPlan, currency) {
    if (!costPlan) return '';
    const target = costPlan.targetBudget || {};
    const estimated = costPlan.estimatedTotal || {};
    return `
      <div class="cost-summary">
        <div class="cost-fig">
          <span class="cost-label">Target budget</span>
          <span class="cost-value">${esc(moneyRange(target.min, target.max, currency))}</span>
        </div>
        <div class="cost-fig">
          <span class="cost-label">Estimated total</span>
          <span class="cost-value">${esc(moneyRange(estimated.min, estimated.max, currency))}</span>
        </div>
        <div class="cost-fig is-actual">
          <span class="cost-label">Actual spent</span>
          <span class="cost-value">${esc(money(costPlan.actualSpentToDate, currency))}</span>
        </div>
      </div>`;
  }

  // Roadmap and cost plan describe the same eight phases, so they share one
  // table rather than repeating the phase list twice. Cost rows are matched by
  // phaseId first, falling back to phase number.
  function costRowFor(costPlan, phase) {
    if (!costPlan || !costPlan.phases) return null;
    return costPlan.phases.find((c) => c.phaseId === phase.id)
      || costPlan.phases.find((c) => c.phase === phase.number)
      || null;
  }

  function actualCell(costRow, currency) {
    if (!costRow || costRow.actual == null) return '<span class="muted">—</span>';
    const done = costRow.actualStatus === 'complete';
    const suffix = done ? ' <span class="done-tick">✓</span>'
      : costRow.actualStatus === 'so-far' ? ' <span class="qualifier">so far</span>'
      : '';
    // A settled amount is green; anything still moving stays accent.
    return `<span class="actual-amount${done ? ' is-final' : ''}">${esc(money(costRow.actual, currency))}</span>${suffix}`;
  }

  function renderRoadmap(project, costPlan) {
    const phases = project.phases;
    const currency = project.currency;
    const plannedNumbers = phases.filter((p) => p.status === 'planned').map((p) => p.number);
    const nextPlannedNumber = plannedNumbers.length ? Math.min(...plannedNumbers) : null;

    const strip = phases.map((p) => `<span class="${p.status === 'complete' ? 'complete' : p.status === 'current' ? 'current' : ''}" title="Phase ${p.number}: ${esc(p.name)}"></span>`).join('');

    const rows = phases.map((phase) => {
      const { badge, rowCls } = phaseBadge(phase, nextPlannedNumber);
      const statusLabel = badge || humanizeSlug(phase.status);
      const costRow = costRowFor(costPlan, phase);
      const estimated = costRow
        ? moneyRange(costRow.estimatedMin, costRow.estimatedMax, currency)
        : '—';
      return `
        <tr class="${rowCls}">
          <td class="col-num">${phase.number}</td>
          <td class="phase-name">${esc(phase.name)}
            ${costRow && costRow.budgetStatus ? `<span class="caption-note">${esc(humanizeSlug(costRow.budgetStatus))}</span>` : ''}
          </td>
          <td class="col-status"><span class="pill ${statusPillClass(phase.status)}">${esc(statusLabel)}</span></td>
          <td class="phase-summary">${esc(phase.summary || '')}
            ${costRow && costRow.note ? `<span class="caption-note">${esc(costRow.note)}</span>` : ''}
          </td>
          <td class="col-est">${esc(estimated)}</td>
          <td class="col-actual">${actualCell(costRow, currency)}</td>
        </tr>`;
    }).join('');

    const totalRow = costPlan ? `
      <tr class="total-row">
        <td colspan="4">Total</td>
        <td class="col-est">${esc(moneyRange(costPlan.estimatedTotal?.min, costPlan.estimatedTotal?.max, currency))}</td>
        <td class="col-actual"><span class="actual-amount">${esc(money(costPlan.actualSpentToDate, currency))}</span> <span class="qualifier">so far</span></td>
      </tr>` : '';

    const nextActionNotice = project.nextAction
      ? `<div class="notice"><strong>Next action:</strong> ${esc(project.nextAction)}</div>`
      : '';

    return `
      <div class="roadmap-head">
        <h2>Roadmap</h2>
        ${renderCostSummary(costPlan, currency)}
      </div>
      <div class="progress-strip">${strip}</div>
      ${nextActionNotice}
      ${project.lastContentUpdate ? `<p class="caption-note">Project data last updated ${esc(project.lastContentUpdate)}</p>` : ''}
      ${renderProjectBudget(project)}
      ${renderOverviewAccordion(project, costPlan)}
      <table class="road-table">
        <tr>
          <th class="col-num">#</th><th>Phase</th><th class="col-status">Status</th>
          <th>Summary</th><th class="col-est">Est.</th><th class="col-actual">Actual</th>
        </tr>
        ${rows}
        ${totalRow}
      </table>`;
  }

  function renderCandidates(candidates) {
    const hasVolume = candidates.some((c) => c.estimatedVolume);
    const hasLinks = candidates.some((c) => c.links && c.links.length);
    const rows = candidates.map((c) => `
      <tr>
        <td class="cand-name">
          ${esc(c.name)}
          ${c.priority ? `<div class="cand-priority">${esc(humanizeSlug(c.priority))}</div>` : ''}
        </td>
        <td><span class="pill ${statusPillClass(c.status)}">${esc(capitalize(c.status.replace(/-/g, ' ')))}</span></td>
        <td>${esc(c.dimensions || '—')}</td>
        ${hasVolume ? `<td>${esc(c.estimatedVolume || '—')}</td>` : ''}
        <td class="cand-notes">${esc(c.notes || '')}</td>
        ${hasLinks ? `<td>${c.links && c.links.length ? c.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('<br>') : '—'}</td>` : ''}
      </tr>`).join('');

    return `<table class="candidate-table">
      <tr>
        <th>Option</th><th>Status</th><th>Dimensions</th>
        ${hasVolume ? '<th>Est. volume</th>' : ''}
        <th>Notes</th>
        ${hasLinks ? '<th>Links</th>' : ''}
      </tr>
      ${rows}
    </table>`;
  }

  // Cost plans may carry a per-phase completion breakdown keyed by phase
  // number (phase1Completion, phase2Completion, ...), so a phase gaining one
  // later needs no renderer change.
  function completionFor(costPlan, phase) {
    if (!costPlan) return null;
    return costPlan[`phase${phase.number}Completion`] || null;
  }

  // ---- Reusable phase sidebar: memory card on top, shopping list below -----

  // Completed phases show their photo once one exists; every other phase shows
  // a placeholder so the slot is present from the start. A configured image
  // wins; otherwise we try the conventional per-phase path and fall back to the
  // placeholder if that file is not there yet.
  function renderMemoryCard(phase, project, memory) {
    const mem = memory || {};
    const title = mem.title || `End of Phase ${phase.number}`;
    const caption = mem.caption || '';
    const projectId = project.projectId || '';
    const src = mem.image || `assets/img/${projectId}-phase${phase.number}.png`;
    const inactive = phase.status === 'future-idea' || phase.status === 'not-active';
    const awaiting = phase.status === 'complete' ? 'Awaiting photo'
      : inactive ? 'Future decision'
      : 'Awaiting completion';

    const key = `${projectId}:phase${phase.number}`;
    return `
      <figure class="completion-card ${inactive ? 'is-inactive' : ''}">
        <!-- The placeholder is the default. attachMemoryImages() probes the
             candidate path with fetch and swaps the photo in only if it is
             actually there — a plain <img> would log a 404 on every load. -->
        <div class="memory-frame" data-memory-src="${esc(src)}" data-memory-alt="${esc(title)}" data-memory-key="${esc(key)}">
          <div class="memory-placeholder">
            <span class="ph-mark" aria-hidden="true">&#9707;</span>
            <span class="ph-text">${esc(awaiting)}</span>
            <label class="ph-pick">
              <input type="file" accept="image/*" hidden>
              <span>Choose photo…</span>
            </label>
          </div>
          <div class="memory-tools" hidden>
            <span class="local-badge">Preview on this device only</span>
            <button type="button" data-mem-save>Save optimized copy</button>
            <button type="button" data-mem-clear>Remove</button>
          </div>
        </div>
        <figcaption>
          <strong>${esc(title)}</strong>
          ${caption ? `<span class="caption-note">${esc(caption)}</span>` : ''}
        </figcaption>
      </figure>`;
  }

  // Headline figures as info cards, so the phase estimate and actual read at a
  // glance instead of being buried in a table's last row.
  // isFinal switches the actual card from "live spend" (accent) to "settled"
  // (green), matching the roadmap's row states.
  function renderMoneyCards(estLabel, estValue, actualValue, currency, isFinal) {
    return `
      <div class="money-cards">
        <div class="money-card">
          <span class="cost-label">${esc(estLabel)}</span>
          <span class="money-value">${esc(estValue)}</span>
        </div>
        <div class="money-card is-actual${isFinal ? ' is-final' : ''}${actualValue == null ? ' is-empty' : ''}">
          <span class="cost-label">Actual${isFinal ? ' <span class="done-tick">✓</span>' : ''}</span>
          <span class="money-value">${actualValue == null ? '&mdash;' : esc(money(actualValue, currency))}</span>
        </div>
      </div>`;
  }

  function shoppingTable(rows) {
    return `
      <table class="phase-shopping">
        <tr><th class="col-check"></th><th>Item</th><th class="col-est">Estimated</th><th class="col-actual">Actual</th></tr>
        ${rows}
      </table>`;
  }

  // Completed phase: itemized actuals. Per-item estimates were never recorded,
  // so those cells stay blank rather than being reconstructed after the fact.
  function renderCompletionShopping(phase, project, completion, costRow) {
    const currency = project.currency;
    const list = completion.shoppingList || {};
    const items = list.items || completion.items || [];

    // A phase with nothing committed gets its note only — an empty table with
    // dashes would imply a shopping process that has not started.
    if (!items.length) {
      if (!list.note) return '';
      return `
        <div class="shopping-card">
          <h3>Shopping list${list.status ? ` <span class="pill ${statusPillClass(list.status)}">${esc(humanizeSlug(list.status))}</span>` : ''}</h3>
          <p class="caption-note">${esc(list.note)}</p>
        </div>`;
    }

    const rows = items.map((i) => {
      const actual = i.actualCost != null ? i.actualCost : i.actual;
      const done = (i.status === 'complete' || i.status === 'bought');
      const est = i.estimatedCost != null ? i.estimatedCost
        : (i.estimatedMin != null && i.estimatedMax != null ? null : null);
      const estCell = i.estimatedCost != null ? esc(money(i.estimatedCost, currency))
        : (i.estimatedMin != null && i.estimatedMax != null ? esc(moneyRange(i.estimatedMin, i.estimatedMax, currency)) : '&mdash;');
      return `
        <tr>
          <td class="col-check">${done ? '<span class="check" title="Complete">&#10003;</span>' : ''}</td>
          <td>${esc(i.item)}
            ${i.status ? `<span class="caption-note"><span class="pill ${statusPillClass(i.status)}">${esc(shoppingStatusLabel(i.status))}</span></span>` : ''}
            ${i.role ? `<span class="caption-note">${esc(i.role)}</span>` : ''}
            ${i.estimatedDeliveryStart || i.estimatedDeliveryEnd
              ? `<span class="caption-note">Delivery ${esc(i.estimatedDeliveryStart || '')}${i.estimatedDeliveryEnd ? ` – ${esc(i.estimatedDeliveryEnd)}` : ''}</span>`
              : ''}
            ${i.note ? `<span class="caption-note">${esc(i.note)}</span>` : ''}
          </td>
          <td class="col-est">${estCell}</td>
          <td class="col-actual">${actual == null ? '&mdash;' : `<span class="actual-amount">${esc(money(actual, currency))}</span>`}</td>
        </tr>`;
    }).join('');

    const actualTotal = list.actualTotal != null ? list.actualTotal : completion.actualTotal;

    // The spendBreakdown row equal to this phase's total is itemized above, so
    // its original label rides on the total row rather than disappearing.
    // ...unless that label is already one of the itemized rows, which would
    // just repeat the item name under the total.
    const itemNames = items.map((i) => i.item);
    const totalLabels = (phase.spendBreakdown || [])
      .filter((s) => Number(s.amount) === Number(actualTotal))
      .map((s) => s.label)
      .filter((l) => !itemNames.includes(l));

    // Amounts recorded here but booked to another phase stay visible and
    // labelled, and are excluded from the total.
    const elsewhereRows = (phase.spendBreakdown || [])
      .filter((s) => Number(s.amount) !== Number(actualTotal))
      .map((s) => `
        <tr class="offphase-row">
          <td class="col-check"></td>
          <td>${esc(s.label)}<span class="caption-note">Counted under Phase 3, not in the Phase ${phase.number} total</span></td>
          <td class="col-est">&mdash;</td>
          <td class="col-actual">${esc(money(s.amount, currency))}</td>
        </tr>`).join('');

    const estMin = list.estimatedTotalMin != null ? list.estimatedTotalMin : (costRow && costRow.estimatedMin);
    const estMax = list.estimatedTotalMax != null ? list.estimatedTotalMax : (costRow && costRow.estimatedMax);

    return `
      <div class="shopping-card">
        <h3>Shopping list${list.status ? ` <span class="pill ${statusPillClass(list.status)}">${esc(humanizeSlug(list.status))}</span>` : ''}</h3>
        ${renderMoneyCards('Phase estimate', moneyRange(estMin, estMax, currency), actualTotal, currency, phase.status === 'complete')}
        <div class="shop-scroll">
          ${shoppingTable(`
            ${rows}
            <tr class="total-row">
              <td class="col-check"></td>
              <td>Phase ${phase.number} total
                ${totalLabels.map((l) => `<span class="caption-note">${esc(l)}</span>`).join('')}
              </td>
              <td class="col-est">${esc(moneyRange(estMin, estMax, currency))}</td>
              <td class="col-actual">${actualTotal == null ? '&mdash;' : `<span class="actual-amount">${esc(money(actualTotal, currency))}</span>`}</td>
            </tr>
            ${elsewhereRows}`)}
        </div>
        ${list.note ? `<p class="caption-note">${esc(list.note)}</p>` : ''}
        ${list.estimateNote ? `<p class="caption-note">${esc(list.estimateNote)}</p>` : ''}
        ${completion.phaseEstimate && completion.phaseEstimate.label ? `<p class="caption-note">${esc(completion.phaseEstimate.label)}: ${esc(moneyRange(completion.phaseEstimate.min, completion.phaseEstimate.max, currency))}</p>` : ''}
        ${completion.crossPhaseAccountingNote ? `<p class="caption-note">${esc(completion.crossPhaseAccountingNote)}</p>` : ''}
      </div>`;
  }

  // Active phase: only the planned purchase, never the comparison alternates.
  function renderPendingShoppingCard(phase, project, decision) {
    const currency = project.currency;
    const ps = decision.pendingShoppingList;
    if (!ps || !ps.items || !ps.items.length) return '';

    const rows = ps.items.map((i) => `
      <tr>
        <td class="col-check"></td>
        <td>${esc(i.item)}
          <span class="caption-note">${esc(i.retailer || '')}${i.link ? ` &middot; <a href="${esc(i.link)}" target="_blank" rel="noopener">link</a>` : ''}</span>
          ${i.note ? `<span class="caption-note">${esc(i.note)}</span>` : ''}
        </td>
        <td class="col-est">${esc(optionalMoney(i.estimatedCost, currency))}</td>
        <td class="col-actual">${esc(optionalMoney(i.actualCost, currency))}</td>
      </tr>`).join('');

    return `
      <div class="shopping-card">
        <h3>Pending shopping list <span class="pill amber">${esc(humanizeSlug(ps.status || 'pending'))}</span></h3>
        ${renderMoneyCards('Phase estimate', moneyRange(ps.phaseEstimateMin, ps.phaseEstimateMax, currency), ps.actualTotal, currency)}
        <div class="shop-scroll">
          ${shoppingTable(`
            ${rows}
            <tr class="total-row">
              <td class="col-check"></td>
              <td>Phase ${phase.number} total</td>
              <td class="col-est">${esc(moneyRange(ps.phaseEstimateMin, ps.phaseEstimateMax, currency))}</td>
              <td class="col-actual">${esc(optionalMoney(ps.actualTotal, currency))}</td>
            </tr>`)}
        </div>
        ${ps.note ? `<p class="caption-note">${esc(ps.note)}</p>` : ''}
      </div>`;
  }

  // ---- Memory photos ------------------------------------------------------
  //
  // A published photo lives in the repo (set completionMemory.image, or drop a
  // file at assets/img/<project>-phase<N>.png) and is what everyone sees.
  //
  // Because this is a static site with no server, the picker below cannot
  // publish. It stores a downscaled copy in this browser's localStorage so the
  // photo can be previewed immediately, and offers that optimized file for
  // download so it can be committed to the repo to become the real one.

  const MEM_PREFIX = 'hpp:memory:';
  const MEM_MAX_EDGE = 1000;   // px on the long edge
  const MEM_QUALITY = 0.82;

  function memRead(key) {
    try {
      return localStorage.getItem(MEM_PREFIX + key);
    } catch (err) {
      return null;
    }
  }

  function showMemoryImage(frame, dataUrl, isLocal) {
    let img = frame.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = frame.getAttribute('data-memory-alt') || '';
      frame.prepend(img);
    }
    img.src = dataUrl;
    const ph = frame.querySelector('.memory-placeholder');
    if (ph) ph.hidden = true;
    const tools = frame.querySelector('.memory-tools');
    if (tools) tools.hidden = !isLocal;
  }

  function clearMemoryImage(frame) {
    const img = frame.querySelector('img');
    if (img) img.remove();
    const ph = frame.querySelector('.memory-placeholder');
    if (ph) ph.hidden = false;
    const tools = frame.querySelector('.memory-tools');
    if (tools) tools.hidden = true;
  }

  // Downscale before storing: phone photos are several MB and localStorage
  // only holds a few, so a full-size original would fail to save.
  function downscale(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const probe = new Image();
        probe.onerror = () => reject(new Error('not an image'));
        probe.onload = () => {
          const scale = Math.min(1, MEM_MAX_EDGE / Math.max(probe.width, probe.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(probe.width * scale);
          canvas.height = Math.round(probe.height * scale);
          canvas.getContext('2d').drawImage(probe, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', MEM_QUALITY));
        };
        probe.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function wireMemoryPicker(frame) {
    const key = frame.getAttribute('data-memory-key');
    const input = frame.querySelector('input[type=file]');
    if (!input || !key) return;

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const dataUrl = await downscale(file);
        try {
          localStorage.setItem(MEM_PREFIX + key, dataUrl);
        } catch (err) {
          // Quota exceeded: still show it for this view rather than failing.
          console.warn('[render-project] photo too large to store locally', err);
        }
        showMemoryImage(frame, dataUrl, true);
      } catch (err) {
        console.warn('[render-project] could not read that image', err);
      }
      input.value = '';
    });

    const saveBtn = frame.querySelector('[data-mem-save]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const img = frame.querySelector('img');
        if (!img) return;
        const a = document.createElement('a');
        a.href = img.src;
        // Name it exactly what the site looks for, so committing it just works.
        a.download = key.replace(':', '-') + '.jpg';
        a.click();
      });
    }

    const clearBtn = frame.querySelector('[data-mem-clear]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        try {
          localStorage.removeItem(MEM_PREFIX + key);
        } catch (err) { /* nothing stored */ }
        clearMemoryImage(frame);
      });
    }
  }

  // A published photo always wins over a local preview.
  function attachMemoryImages() {
    document.querySelectorAll('.memory-frame').forEach(async (frame) => {
      wireMemoryPicker(frame);

      const src = frame.getAttribute('data-memory-src');
      if (src) {
        try {
          const res = await fetch(src, { method: 'HEAD' });
          if (res.ok) {
            showMemoryImage(frame, src, false);
            return;
          }
        } catch (err) { /* not published yet */ }
      }

      const local = memRead(frame.getAttribute('data-memory-key'));
      if (local) showMemoryImage(frame, local, true);
    });
  }

  // Every item in project.shopping belongs to a phase, so each phase shows its
  // own. Phases that also have a detail file show that list as the primary one
  // and keep these records in a collapsed section, so both itemizations survive.
  function phaseShoppingItems(phase, project) {
    return (project.shopping || []).filter((i) => i.phase === phase.number);
  }

  function renderPhaseShoppingRecords(phase, project, collapsed, alreadyListed) {
    let items = phaseShoppingItems(phase, project);
    // Drop anything the phase's own shopping list already shows; a records
    // block that repeats it adds a second, redundant list.
    if (alreadyListed && alreadyListed.length) {
      const seen = alreadyListed.map((n) => String(n).toLowerCase());
      items = items.filter((i) => !seen.some((n) => n.includes(String(i.item).toLowerCase())
        || String(i.item).toLowerCase().includes(n)));
    }
    if (!items.length) return '';
    const currency = project.currency;
    const rows = items.map((i) => `
      <tr>
        <td class="col-check">${i.status === 'bought' ? '<span class="check">&#10003;</span>' : ''}</td>
        <td>${esc(i.item)}
          <span class="caption-note">
            <span class="pill ${statusPillClass(i.status)}">${esc(shoppingStatusLabel(i.status))}</span>
            ${i.store ? ' ' + esc(i.store) : ''}${i.link ? ` &middot; <a href="${esc(i.link)}" target="_blank" rel="noopener">link</a>` : ''}
          </span>
          ${i.estimatedDeliveryStart || i.estimatedDeliveryEnd
            ? `<span class="caption-note">Delivery ${esc(i.estimatedDeliveryStart || '')}${i.estimatedDeliveryEnd ? ` – ${esc(i.estimatedDeliveryEnd)}` : ''}</span>`
            : ''}
          ${i.note ? `<span class="caption-note">${esc(i.note)}</span>` : ''}
        </td>
        <td class="col-est">${esc(optionalMoney(i.price, currency))}</td>
        <td class="col-actual">${esc(optionalMoney(i.actualCost, currency))}</td>
      </tr>`).join('');

    if (collapsed) {
      return `
        <details class="accordion records">
          <summary>All recorded items <span class="pill">${items.length}</span></summary>
          <div class="accordion-body"><div class="shop-scroll">${shoppingTable(rows)}</div></div>
        </details>`;
    }
    return `<div class="shop-scroll">${shoppingTable(rows)}</div>`;
  }

  // Phases without a detail file still get a shopping card, built from the
  // project-level list plus the cost plan's phase estimate.
  function renderPlainShoppingCard(phase, project, costRow) {
    const items = phaseShoppingItems(phase, project);
    if (!items.length) return '';
    const currency = project.currency;
    const actual = items.reduce((sum, i) => (i.actualCost != null ? sum + i.actualCost : sum), 0);
    const anyActual = items.some((i) => i.actualCost != null);
    return `
      <div class="shopping-card">
        <h3>Shopping list</h3>
        ${renderMoneyCards(
          'Phase estimate',
          costRow ? moneyRange(costRow.estimatedMin, costRow.estimatedMax, currency) : '—',
          anyActual ? actual : null,
          currency,
          phase.status === 'complete'
        )}
        ${renderPhaseShoppingRecords(phase, project, false)}
      </div>`;
  }

  // Placement shots are meant to be compared, so a click opens the full image.
  // Works for a committed file and for a device-local preview alike.
  function initLightbox() {
    let overlay = document.querySelector('.lightbox');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'lightbox';
      overlay.hidden = true;
      overlay.innerHTML = '<img alt=""><button type="button" class="lightbox-close" aria-label="Close">&times;</button>';
      document.body.appendChild(overlay);
      const close = () => { overlay.hidden = true; };
      overlay.addEventListener('click', close);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }
    document.addEventListener('click', (e) => {
      const img = e.target.closest('.placement-shot img');
      if (!img) return;
      overlay.querySelector('img').src = img.src;
      overlay.querySelector('img').alt = img.alt || '';
      overlay.hidden = false;
    });
  }

  function renderPhaseRow(phase, project, opts) {
    // A detail file may carry its list as shoppingList (planned, in progress or
    // purchased) or, before a purchase, as pendingShoppingList. Route either
    // through the same renderer rather than tying the shape to the file kind.
    const detail = opts.completion || opts.decision;
    const listed = ((detail && detail.shoppingList && detail.shoppingList.items) || [])
      .map((i) => i.item)
      .concat(((detail && detail.pendingShoppingList && detail.pendingShoppingList.items) || []).map((i) => i.item));
    // When a phase presents its purchases inside per-option cards, the generic
    // records list would repeat them and make one option look committed.
    const optionsOwnTheItems = !!(detail && detail.systemOptions && detail.systemOptions.length);
    let card;
    if (detail && detail.shoppingList) {
      // A phase detail file is the authority for that phase's list. The
      // project-level shopping array is a rollup that can lag behind it, so
      // showing both risks contradicting the newer file.
      card = renderCompletionShopping(phase, project, detail, opts.costRow);
    } else if (opts.decision && opts.decision.pendingShoppingList) {
      card = renderPendingShoppingCard(phase, project, opts.decision);
    } else if (detail) {
      card = renderPhaseShoppingRecords(phase, project, false);
    } else {
      card = renderPlainShoppingCard(phase, project, opts.costRow);
    }
    return `
      <div class="phase-row">
        <div class="row-pic">${renderMemoryCard(phase, project, opts.memory)}</div>
        <div class="row-todo">${opts.todos || ''}</div>
        <div class="row-shop">${card}</div>
      </div>`;
  }

  function currencyOf(project) {
    return project.currency;
  }

  // The estimate/actual line shown at the top of a phase panel.
  function renderPhaseCostLine(costRow, currency) {
    if (!costRow) return '';
    return `<div class="phase-cost">
      <span><span class="cost-label">Estimated</span> ${esc(moneyRange(costRow.estimatedMin, costRow.estimatedMax, currency))}</span>
      <span><span class="cost-label">Actual</span> ${actualCell(costRow, currency)}</span>
    </div>`;
  }

  // One field type -> one rendering treatment, applied uniformly across every
  // phase regardless of phase number.
  // Two texts saying the same thing (the goal restated as a summary) should
  // appear once. Compared loosely, since wording drifts between files.
  function saysTheSame(a, b) {
    if (!a || !b) return false;
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const x = norm(a);
    const y = norm(b);
    return x === y || x.includes(y) || y.includes(x);
  }

  // Placement concepts are a presentation-only gallery until they exist in
  // /data; if the phase or its detail file supplies options, those win.
  const PLACEMENT_FALLBACK = [
    { label: 'Option 1 — Courtyard Clock Wall', file: 'option-1-courtyard-clock-wall' },
    { label: 'Option 2 — Courtyard Zen Feature Wall', file: 'option-2-courtyard-zen-feature-wall' },
    { label: 'Option 3 — Large Covered Patio Wall', file: 'option-3-large-covered-patio-wall' },
    { label: 'Option 4 — Back Patio Window Wall', file: 'option-4-back-patio-window-wall' },
    { label: 'Option 5 — Back Patio TV Corner', file: 'option-5-back-patio-tv-corner' },
  ];

  function renderPlacementGallery(phase, project, detail) {
    const fromData = (detail && detail.placementOptions) || phase.placementOptions;
    const options = fromData || PLACEMENT_FALLBACK;
    if (!options.length) return '';
    const base = `assets/images/${project.projectId}/phase-${phase.number}/`;
    const cards = options.map((o, i) => {
      const src = o.image || `${base}${o.file || 'option-' + (i + 1)}.jpg`;
      return `
        <figure class="placement">
          <div class="memory-frame placement-shot"
               data-memory-src="${esc(src)}" data-memory-alt="${esc(o.label)}"
               data-memory-key="${esc(project.projectId)}:phase${phase.number}-${esc(o.file || 'option-' + (i + 1))}">
            <div class="memory-placeholder">
              <span class="ph-mark" aria-hidden="true">&#9707;</span>
              <span class="ph-text">Image pending</span>
              <label class="ph-pick">
                <input type="file" accept="image/*" hidden>
                <span>Choose photo&hellip;</span>
              </label>
            </div>
            <div class="memory-tools" hidden>
              <span class="local-badge">This device only</span>
              <button type="button" data-mem-save>Save copy</button>
              <button type="button" data-mem-clear>Remove</button>
            </div>
          </div>
          <figcaption>${esc(o.label)}</figcaption>
        </figure>`;
    }).join('');
    return `
      <section class="placement-block">
        <div class="placement-head">
          <h3>Pond placement options</h3>
          <span class="pill amber">Decision pending</span>
        </div>
        <div class="placement-grid">${cards}</div>
      </section>`;
  }

  // Two alternative system designs shown side by side while the choice is open.
  // Nothing here marks a winner: the only comparative claim is "lower
  // maintenance", and that is derived from the options' own pump counts.
  // A product line inside an option: whatever of item/retailer/model/price/
  // role/link the data happens to carry. Prices render from currentPrice when
  // a specific product is named, or from an estimate range when it is not.
  function optionProductRow(i, currency, extraClass) {
    const price = i.currentPrice != null
      ? money(i.currentPrice, currency)
      : moneyRange(i.estimatedMin, i.estimatedMax, currency);
    const meta = [
      i.retailer ? esc(i.retailer) : '',
      i.model ? 'model ' + esc(i.model) : '',
      i.priceChecked ? 'checked ' + esc(i.priceChecked) : '',
    ].filter(Boolean).join(' &middot; ');
    return `
      <tr class="${extraClass || ''}">
        <td>
          ${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.item)}</a>` : esc(i.item)}
          ${i.status ? `<span class="caption-note"><span class="pill ${statusPillClass(i.status)}">${esc(humanizeSlug(i.status))}</span></span>` : ''}
          ${i.role ? `<span class="caption-note">${esc(i.role)}</span>` : ''}
          ${meta ? `<span class="caption-note">${meta}</span>` : ''}
        </td>
        <td class="col-actual">${esc(price)}</td>
      </tr>`;
  }

  // Two alternative system designs shown side by side while the choice is open.
  // Every figure, product and label comes from the JSON; nothing about which
  // option wins is decided here. A "lower maintenance" tag only appears if the
  // data's own comparison says so.
  function renderSystemOptions(detail, currency) {
    const options = detail.systemOptions || [];
    if (!options.length) return '';
    const cmp = detail.comparison || {};

    // comparison is keyed optionA/optionB; pair each up with its option by order.
    const cmpKeys = Object.keys(cmp).filter((k) => cmp[k] && typeof cmp[k] === 'object');
    const cmpFor = (idx) => (cmpKeys[idx] ? cmp[cmpKeys[idx]] : null);

    const spendOf = (o) => {
      const min = o.remainingEstimatedMin != null ? o.remainingEstimatedMin : o.additionalSpendFromTodayMin;
      const max = o.remainingEstimatedMax != null ? o.remainingEstimatedMax : o.additionalSpendFromTodayMax;
      return moneyRange(min, max, currency);
    };
    const spendLabel = (o) => (o.remainingEstimatedMin != null ? 'Remaining spend' : 'New spend');

    const cards = options.map((o, idx) => {
      const c = cmpFor(idx) || {};
      const rec = (o.recommendedShopping || o.items || []).map((i) => optionProductRow(i, currency)).join('');
      const alt = o.alternateCandidate
        ? optionProductRow(Object.assign({}, o.alternateCandidate, { role: o.alternateCandidate.role || 'Alternate' }), currency, 'alt-row')
        : '';
      // Only a maintenance rating the data itself states.
      const lowMaint = String(c.maintenance || '').toLowerCase() === 'lower';

      return `
        <article class="sysopt">
          <header class="sysopt-head">
            <h3>${esc(o.label)}</h3>
            ${lowMaint ? '<span class="pill green">Lower maintenance</span>' : ''}
          </header>
          ${o.summary ? `<p class="sysopt-summary">${esc(o.summary)}</p>` : ''}
          <div class="sysopt-figs">
            <div class="money-card">
              <span class="cost-label">System cost</span>
              <span class="money-value">${esc(moneyRange(o.systemEstimatedMin, o.systemEstimatedMax, currency))}</span>
            </div>
            <div class="money-card">
              <span class="cost-label">${esc(spendLabel(o))}</span>
              <span class="money-value">${esc(spendOf(o))}</span>
            </div>
            <div class="money-card">
              <span class="cost-label">Pumps</span>
              <span class="money-value">${o.pumpCount != null ? o.pumpCount : (c.permanentPumps != null ? c.permanentPumps : '&mdash;')}</span>
            </div>
          </div>
          ${rec || alt ? `<table class="phase-shopping">${rec}${alt}</table>` : ''}
          ${o.maintenance ? `<p class="caption-note"><strong>Maintenance:</strong> ${esc(o.maintenance)}</p>` : ''}
          ${o.qualityNote ? `<p class="caption-note">${esc(o.qualityNote)}</p>` : ''}
          ${o.note ? `<p class="caption-note">${esc(o.note)}</p>` : ''}
          ${o.accountingNote ? `<p class="caption-note">${esc(o.accountingNote)}</p>` : ''}
        </article>`;
    }).join('');

    // The comparison table is built from whatever attributes the data provides,
    // so new attributes appear without a code change.
    let compare = '';
    if (cmpKeys.length) {
      const attrs = [];
      cmpKeys.forEach((k) => Object.keys(cmp[k]).forEach((a) => { if (!attrs.includes(a)) attrs.push(a); }));
      const rows = attrs.map((a) => `
        <tr>
          <td class="cmp-label">${esc(humanizeSlug(a.replace(/([A-Z])/g, '-$1').toLowerCase()))}</td>
          ${cmpKeys.map((k) => `<td>${cmp[k][a] != null ? esc(cmp[k][a]) : '&mdash;'}</td>`).join('')}
        </tr>`).join('');
      compare = `
        <table class="compare-table">
          <tr><th></th>${cmpKeys.map((k, i) => `<th>${esc((options[i] && options[i].label) || humanizeSlug(k))}</th>`).join('')}</tr>
          ${rows}
        </table>
        ${cmp.currentConclusion ? `<p class="caption-note">${esc(cmp.currentConclusion)}</p>` : ''}`;
    }

    return `
      <div class="sysopt-grid">${cards}</div>
      ${compare}`;
  }

  function renderOwnedEquipment(detail, currency) {
    const owned = detail.ownedEquipment;
    if (!owned) return '';
    const list = Array.isArray(owned) ? owned : [owned];
    return `
      <div class="box owned-box">
        <h3>Already owned</h3>
        ${list.map((o) => `
          <p><strong>${esc(o.item)}</strong>
            ${o.actualCost != null ? ` — <span class="actual-amount is-final">${esc(money(o.actualCost, currency))}</span>` : ''}
            <span class="pill green">${esc(humanizeSlug(o.status || 'bought'))}</span>
          </p>
          ${o.note ? `<p class="caption-note">${esc(o.note)}</p>` : ''}`).join('')}
      </div>`;
  }

  // A phase's checklist. Tasks come either from the phase's own detail file or
  // from the project-wide todos file, matched by phaseId then phase number.
  function todosFor(phase, detail, todoFile) {
    if (detail && detail.todos && detail.todos.length) return detail.todos;
    if (!todoFile || !todoFile.phases) return [];
    const entry = todoFile.phases.find((t) => t.phaseId === phase.id)
      || todoFile.phases.find((t) => t.phase === phase.number);
    return (entry && entry.todos) || [];
  }

  function renderTodos(todos) {
    if (!todos.length) return '';
    const mark = (st) => (st === 'complete' ? '&#9745;' : '&#9744;');
    const rows = todos.map((t) => `
      <li class="todo is-${esc(t.status || 'pending')}">
        <span class="todo-box" aria-hidden="true">${mark(t.status)}</span>
        <span class="todo-task">${esc(t.task)}</span>
      </li>`).join('');
    const done = todos.filter((t) => t.status === 'complete').length;
    return `
      <div class="box todo-box-wrap">
        <h3>To-do <span class="todo-count">${done}/${todos.length}</span></h3>
        <ul class="todo-list">${rows}</ul>
      </div>`;
  }

  // A phase page is a concise operational view: goal, the few things to do,
  // and the money. Anything discursive — restated summaries, design rationale,
  // extra notes — goes into a collapsed Details block so it is preserved
  // without dominating the page.
  function renderPhaseBody(phase, currency, costPlan, hasSidebar, completion) {
    const comp = completion || {};
    const primary = [];
    const extra = [];
    const parts = { cost: '', goal: '', todos: '', content: '', details: '' };

    const costRow = costRowFor(costPlan, phase);
    parts.cost = renderPhaseCostLine(costRow, currency);

    const goal = comp.goal || phase.goal || phase.summary;
    if (goal) {
      parts.goal = `<div class="box goal-box"><p><strong>Goal:</strong> ${esc(goal)}</p></div>`;
    }

    // Summaries that merely restate the goal are dropped rather than collapsed:
    // keeping a duplicate sentence behind a toggle adds nothing.
    [phase.summary, comp.summary].forEach((s) => {
      if (!s || saysTheSame(s, goal)) return;
      extra.push(`<p>${esc(s)}</p>`);
    });

    if (phase.timeHorizon || comp.timeHorizon) {
      primary.push(`<div class="notice"><strong>Time horizon:</strong> ${esc(phase.timeHorizon || comp.timeHorizon)}</div>`);
    }

    if (comp.currentDecision) {
      primary.push(`<div class="notice ${phase.status === 'complete' ? 'success' : ''}">${esc(comp.currentDecision)}</div>`);
    }

    if (phase.layout) {
      primary.push(`<div class="box"><p><strong>Layout:</strong> ${esc(phase.layout)}</p></div>`);
    }

    // An open choice is announced before the options themselves.
    if (comp.decisionStatus === 'pending' || comp.decisionStatus === 'decision-pending') {
      primary.push(`<div class="notice"><strong>Decision pending.</strong>${comp.decisionNote ? ' ' + esc(comp.decisionNote) : ''}</div>`);
    }
    // Owned equipment is already a row in the phase's shopping list, so only
    // its note (which the list does not carry) moves into Details.
    const owned = comp.ownedEquipment;
    (Array.isArray(owned) ? owned : owned ? [owned] : []).forEach((o) => {
      if (o.note) extra.push(`<h4>${esc(o.item)}</h4><p>${esc(o.note)}</p>`);
    });
    primary.push(renderSystemOptions(comp, currency));

    if (comp.currentState) {
      primary.push(`<div class="box"><p>${esc(comp.currentState)}</p></div>`);
    }

    // The checklist is the actionable view of this phase. Where it exists the
    // requirements list says the same thing in flatter words, so that drops to
    // Details rather than sitting alongside as a second copy.
    const todos = todosFor(phase, comp, projectTodos);
    const actions = (phase.requirements || []).slice();
    (comp.completedWork || []).forEach((w) => { if (!actions.includes(w)) actions.push(w); });
    (phase.items || []).forEach((i) => { if (!actions.includes(i)) actions.push(i); });

    if (todos.length) {
      parts.todos = renderTodos(todos);
      if (actions.length) {
        extra.push(`<h4>Phase requirements</h4><ul>${actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`);
      }
    } else if (actions.length) {
      primary.push(`<div class="box"><ul>${actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`);
    }

    if (phase.purchase) primary.push(renderPurchase(phase.purchase, currency));

    if (phase.id === 'pond-placement' || /placement/.test(String(phase.id))) {
      primary.push(renderPlacementGallery(phase, { projectId: currentProjectId }, comp));
    }

    // At most one note stays on the page; the rest are preserved in Details.
    const notes = (phase.notes || []).slice();
    (comp.notes || []).forEach((n) => { if (!notes.includes(n)) notes.push(n); });
    if (notes.length) {
      primary.push(`<div class="notice">${esc(notes[0])}</div>`);
      notes.slice(1).forEach((n) => extra.push(`<p>${esc(n)}</p>`));
    }

    // Everything below is context rather than instruction.
    if (comp.designIntent && typeof comp.designIntent === 'object') {
      const rows = Object.entries(comp.designIntent).filter(([, v]) => v)
        .map(([k, v]) => `<div class="spec"><span class="spec-label">${esc(humanizeSlug(k.replace(/([A-Z])/g, '-$1').toLowerCase()))}</span><span>${esc(v)}</span></div>`).join('');
      if (rows) extra.push(`<h4>Design intent</h4><div class="fin-specs">${rows}</div>`);
    }
    if (phase.decisionGate) extra.push(`<h4>Decision gate</h4><p>${esc(phase.decisionGate)}</p>`);
    if (comp.notBuyingNow && comp.notBuyingNow.length) {
      extra.push(`<h4>Deliberately not buying now</h4><ul>${comp.notBuyingNow.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
    }
    if (comp.brainstormingTopics && comp.brainstormingTopics.length) {
      extra.push(`<h4>To review before deciding</h4><ul>${comp.brainstormingTopics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
    }
    if (phase.decisionCriteria && phase.decisionCriteria.length) {
      extra.push(`<h4>Decision criteria</h4><ul>${phase.decisionCriteria.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
    }
    if (phase.candidates && phase.candidates.length) {
      extra.push(`<h4>Earlier candidates</h4>${renderCandidates(phase.candidates)}`);
    }
    // The sidebar's shopping list already carries every spendBreakdown amount,
    // so this is a record rather than a second Spend section.
    if (phase.spendBreakdown && phase.spendBreakdown.length) {
      extra.push(`<h4>Recorded spend</h4><table>
        <tr><th>Item</th><th class="col-actual">Amount</th></tr>
        ${phase.spendBreakdown.map((s) => `<tr><td>${esc(s.label)}</td><td class="col-actual">${esc(money(s.amount, currency))}</td></tr>`).join('')}
      </table>`);
    }

    parts.content = primary.join('');
    parts.details = extra.length
      ? `<details class="accordion">
           <summary>Details &amp; history</summary>
           <div class="accordion-body">${extra.join('')}</div>
         </details>`
      : '';
    return parts;
  }

  // ---- Decision panels (a phase's narrowed finalist comparison) -------------

  function finalistCard(c, currency, settled) {
    const spec = (label, value) => value
      ? `<div class="spec"><span class="spec-label">${esc(label)}</span><span>${esc(value)}</span></div>`
      : '';
    const list = (label, arr, cls) => (arr && arr.length)
      ? `<div class="fin-list ${cls}"><span class="spec-label">${esc(label)}</span><ul>${arr.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`
      : '';
    const price = c.priceSnapshot != null
      ? `<div class="fin-price">${esc(money(c.priceSnapshot, currency))}${c.priceSnapshotDate ? `<span class="caption-note">Price snapshot ${esc(c.priceSnapshotDate)}</span>` : ''}</div>`
      : '';
    return `
      <article class="finalist ${isChosen(c.status) ? 'is-chosen' : ''} ${(settled || isSettledStatus(c.status)) ? 'is-settled' : ''}">
        <header class="fin-head">
          <div>
            <h3>${esc(c.name)}</h3>
            <span class="caption-note">${esc(c.retailer || '')}</span>
          </div>
          <span class="pill ${statusPillClass(c.status)}">${esc(humanizeSlug(c.status))}</span>
        </header>
        ${price}
        <div class="fin-specs">
          ${spec('Dimensions', c.dimensions)}
          ${spec('Capacity', c.capacity)}
          ${spec('Shape', c.shape)}
          ${spec('Pond use', c.pondUse)}
          ${spec('Construction', c.construction)}
          ${spec('Included', c.includedEquipment)}
        </div>
        ${list('Strengths', c.strengths, 'strengths')}
        ${list('Tradeoffs', c.tradeoffs, 'tradeoffs')}
        ${c.link ? `<a class="fin-link" href="${esc(c.link)}" target="_blank" rel="noopener">View at ${esc(c.retailer || 'retailer')} →</a>` : ''}
      </article>`;
  }

  // Older evaluation content is relocated here, never dropped: the original
  // decision criteria, every earlier candidate, and any explicitly excluded
  // reference (shown with its reason so it cannot read as a live option).
  function renderDecisionHistory(phase, decision) {
    let inner = '';

    if (phase.decisionCriteria && phase.decisionCriteria.length) {
      inner += `<h4>Decision criteria</h4><ul>${phase.decisionCriteria.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    }

    if (phase.candidates && phase.candidates.length) {
      inner += `<h4>Earlier candidates</h4>${renderCandidates(phase.candidates)}`;
    }

    const ex = decision && decision.excludedReference;
    if (ex) {
      inner += `<h4>Not a valid purchase option</h4>
        <div class="notice"><strong>${esc(ex.item)}</strong>${ex.reason ? `<br>${esc(ex.reason)}` : ''}</div>`;
    }

    if (!inner) return '';
    return `
      <details class="accordion">
        <summary>Earlier options &amp; decision history</summary>
        <div class="accordion-body">${inner}</div>
      </details>`;
  }


  // The purchase record for a settled decision: what was bought, from whom,
  // and how the total breaks down.
  function renderPurchase(purchase, currency) {
    if (!purchase) return '';
    const spec = (label, value) => value != null && value !== ''
      ? `<div class="spec"><span class="spec-label">${esc(label)}</span><span>${esc(value)}</span></div>`
      : '';
    const cash = (label, value) => value != null
      ? `<div class="spec"><span class="spec-label">${esc(label)}</span><span>${esc(money(value, currency))}</span></div>`
      : '';
    return `
      <div class="box purchase-box">
        <h3>Purchased${purchase.date ? ` &middot; ${esc(purchase.date)}` : ''}</h3>
        <div class="fin-specs">
          ${spec('Item', purchase.item)}
          ${spec('Colour', purchase.color)}
          ${spec('Retailer', purchase.retailer)}
          ${purchase.quantity != null ? spec('Quantity', String(purchase.quantity)) : ''}
          ${cash('Subtotal', purchase.subtotal)}
          ${cash('Shipping', purchase.shipping)}
          ${cash('Tax', purchase.tax)}
          ${cash('Total paid', purchase.totalPaid)}
          ${spec('Delivery', purchase.estimatedDelivery)}
        </div>
      </div>`;
  }

  function renderDecisionPanel(decision, phase, project) {
    const currency = project.currency;
    // Once the decision is settled it reads green; while it is still live it
    // keeps the accent colour.
    const settled = isSettledStatus(decision.decisionState) || isSettledStatus(decision.status) || phase.status === 'complete';
    // A compact strip here; the full spec cards live in the Decisions log.
    const finalists = (Array.isArray(decision.comparison) ? decision.comparison : []).map((c) => `
      <div class="fin-brief ${isChosen(c.status) ? 'is-chosen' : ''} ${(settled || isSettledStatus(c.status)) ? 'is-settled' : ''}">
        <div class="fin-brief-top">
          <span class="fin-brief-name">${esc(c.name)}</span>
          <span class="pill ${statusPillClass(c.status)}">${esc(humanizeSlug(c.status))}</span>
        </div>
        <div class="fin-brief-meta">
          <span class="fin-brief-price">${c.priceSnapshot != null ? esc(money(c.priceSnapshot, currency)) : '—'}</span>
          <span class="caption-note">${esc(c.retailer || '')}${c.dimensions ? ' · ' + esc(c.dimensions) : c.capacity ? ' · ' + esc(c.capacity) : ''}</span>
        </div>
      </div>`).join('');
    const why = (decision.whyPreferred || []).map((w) => `<li>${esc(w)}</li>`).join('');
    const preferredName = (Array.isArray(decision.comparison) ? decision.comparison : []).find((c) => c.status === 'preferred');
    const whyTitle = preferredName
      ? `Why ${esc(preferredName.name.split(' ').slice(0, 2).join(' '))} is the preferred choice`
      : 'Why this is the preferred choice';

    // The phase summary, goal and decision summary share one box rather than
    // stacking three near-identical cards; all three texts are kept verbatim.
    // The goal is rendered once by the panel itself, above the media row, so it
    // is deliberately absent here; repeating it put a second "Goal:" halfway
    // down the page.
    const intro = [
      phase.summary ? `<p>${esc(phase.summary)}</p>` : '',
      decision.decisionSummary ? `<p>${esc(decision.decisionSummary)}</p>` : '',
    ].filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i)
      .join('');

    // The rationale itself lives in the Decisions tab; this panel links across
    // to it rather than repeating it. The pending list is in the sidebar.
    const rationaleLink = why
      ? `<a class="xref ${settled ? 'is-settled' : ''}" data-goto="decisions" href="#decisions">
           ${whyTitle} — see the options and rationale in Decisions →
         </a>`
      : '';

    return `
      ${decision.preferredChoice ? `
        <div class="notice ${settled ? 'success' : 'accent'}">
          <strong>${settled ? 'Chosen' : 'Preferred choice'}:</strong> ${esc(decision.preferredChoice)}
          — <em>${esc(humanizeSlug(decision.decisionState || ''))}</em>
        </div>` : ''}
      ${intro ? `<div class="box intro-box">${intro}</div>` : ''}
      ${renderPurchase(decision.purchase, currency)}
      <div class="fin-briefs">${finalists}</div>
      ${rationaleLink}
      ${decision.completionRule ? `<div class="notice ${settled ? 'success' : ''}">${esc(decision.completionRule)}</div>` : ''}`;
  }

  // One shape for every phase, in a fixed reading order:
  //   title + cost -> Goal -> photo & shopping -> To-do -> phase detail.
  // No per-phase layout branching, so no phase can drift into looking like a
  // different product as its content grows.
  function renderPhasePanels(project, costPlan, phaseDetails) {
    return project.phases.map((phase) => {
      const detail = phaseDetails.get(phase.number) || {};
      const decision = detail.decision;
      // A dedicated completion file wins over the block embedded in the cost
      // plan, since it carries richer data (goal, shopping list, memory).
      const completion = detail.completion || completionFor(costPlan, phase);
      const costRow = costRowFor(costPlan, phase);
      const memory = (decision && decision.completionMemory)
        || (completion && completion.completionMemory)
        || null;

      let parts;
      if (decision) {
        parts = {
          cost: renderPhaseCostLine(costRow, currencyOf(project)),
          goal: decision.goal
            ? `<div class="box goal-box"><p><strong>Goal:</strong> ${esc(decision.goal)}</p></div>`
            : '',
          todos: renderTodos(todosFor(phase, decision, projectTodos)),
          content: `
            ${renderDecisionPanel(decision, phase, project)}
            ${(phase.notes || []).map((n) => `<div class="notice">${esc(n)}</div>`).join('')}
            ${phase.decisionGate ? `<div class="notice">${esc(phase.decisionGate)}</div>` : ''}`,
          details: renderDecisionHistory(phase, decision),
        };
      } else {
        parts = renderPhaseBody(phase, project.currency, costPlan, true, completion);
      }

      const title = (decision && decision.title) || (completion && completion.title) || phase.name;
      const row = renderPhaseRow(phase, project, {
        completion, decision, costRow, memory, todos: parts.todos,
      });

      return `
        <section id="p${phase.number}" class="panel">
          <h2>Phase ${phase.number} — ${esc(title)}</h2>
          ${parts.cost}
          ${parts.goal}
          ${row}
          ${parts.content}
          ${parts.details}
        </section>`;
    }).join('');
  }

  // The full rationale for a phase decision: which options were on the table,
  // and why the preferred one won. Lives here so Decisions answers "what did I
  // consider and why did I pick it", with a link back to the phase itself.
  function renderDecisionRationale(project, phaseDetails, currency) {
    const blocks = [];
    project.phases.forEach((phase) => {
      const decision = (phaseDetails.get(phase.number) || {}).decision;
      if (!decision) return;

      // The full spec cards live here in the log, not in the phase panel.
      const settled = isSettledStatus(decision.decisionState) || isSettledStatus(decision.status) || phase.status === 'complete';
      const fullCards = (Array.isArray(decision.comparison) ? decision.comparison : []).map((c) => finalistCard(c, currency, settled)).join('');
      const why = (decision.whyPreferred || []).map((w) => `<li>${esc(w)}</li>`).join('');

      blocks.push(`
        <section class="rationale">
          <div class="rationale-head">
            <h2>Phase ${phase.number} — ${esc(decision.title || phase.name)}</h2>
            <a class="xref ${settled ? 'is-settled' : ''}" data-goto="p${phase.number}" href="#p${phase.number}">Open Phase ${phase.number} →</a>
          </div>
          ${decision.preferredChoice ? `
            <div class="notice accent">
              <strong>Chosen:</strong> ${esc(decision.preferredChoice)}
              — <em>${esc(humanizeSlug(decision.decisionState || ''))}</em>
            </div>` : ''}
          ${fullCards ? `
            <h3 class="rationale-sub">Options considered</h3>
            <div class="finalists">${fullCards}</div>` : ''}
          ${why ? `
            <h3 class="rationale-sub">Why this one</h3>
            <div class="box why-preferred"><ul>${why}</ul></div>` : ''}
          ${decision.excludedReference ? `
            <div class="notice"><strong>Not a valid option:</strong> ${esc(decision.excludedReference.item)}
              ${decision.excludedReference.reason ? `<br>${esc(decision.excludedReference.reason)}` : ''}
            </div>` : ''}
        </section>`);
    });
    return blocks.join('');
  }

  function renderDecisions(project, phaseDetails) {
    const rows = (project.decisions || []).map((d) => `
      <tr>
        <td class="decision-item">${esc(d.item)}</td>
        <td><span class="pill ${statusPillClass(d.status)}">${esc(capitalize(d.status))}</span></td>
        <td>${esc(d.decision)}</td>
      </tr>`).join('');

    const maintenanceRows = (project.maintenance || []).map((m) => `
      <tr>
        <td>${esc(m.frequency)}</td>
        <td>${esc(m.task)}</td>
        <td>${esc(m.time)}</td>
      </tr>`).join('');

    return `
      <section id="decisions" class="panel">
        <h2>Locked + open decisions</h2>
        <table>
          <tr><th>Item</th><th>Status</th><th>Decision</th></tr>
          ${rows}
        </table>
        ${renderDecisionRationale(project, phaseDetails, project.currency)}
        ${maintenanceRows ? `
        <h2 class="section-gap">Maintenance</h2>
        <table>
          <tr><th>Frequency</th><th>Task</th><th>Time</th></tr>
          ${maintenanceRows}
        </table>` : ''}
      </section>`;
  }

  const SHOPPING_STATUS_LABELS = {
    bought: 'Already bought',
    considering: 'Considering',
    'need-to-buy': 'Need to buy',
    rejected: 'Rejected',
  };

  function shoppingStatusLabel(status) {
    return SHOPPING_STATUS_LABELS[status] || humanizeSlug(status || '');
  }

  // The project-level budget block used to live in the Shopping panel. That
  // panel is gone (each phase carries its own list), so the figures and note
  // surface on the roadmap instead.
  function renderProjectBudget(project) {
    const b = project.budget;
    if (!b) return '';
    const c = project.currency;
    return `
      <div class="notice">
        <strong>Project budget:</strong>
        planned ${esc(optionalMoney(b.planned, c))}
        &middot; spent ${esc(optionalMoney(b.spentToDate != null ? b.spentToDate : project.spentToDate, c))}
        &middot; remaining ${esc(optionalMoney(b.remaining, c))}
        ${b.status ? ` &middot; ${esc(humanizeSlug(b.status))}` : ''}
        ${b.note ? `<br>${esc(b.note)}` : ''}
      </div>`;
  }

  function renderSideNav(project) {
    const plannedNumbers = project.phases.filter((p) => p.status === 'planned').map((p) => p.number);
    const nextPlannedNumber = plannedNumbers.length ? Math.min(...plannedNumbers) : null;

    const phaseTabs = project.phases.map((phase) => {
      const { navCls } = phaseBadge(phase, nextPlannedNumber);
      return `<button class="tab ${navCls}" data-tab="p${phase.number}"><span class="dot"></span>${phase.number} — ${esc(tabLabel(phase))}</button>`;
    }).join('');

    // No global shopping tab: each phase carries its own list in its sidebar.
    return `
      <button class="tab active" data-tab="roadmap"><span class="dot"></span>Roadmap</button>
      <div class="divider"></div>
      ${phaseTabs}
      <div class="divider"></div>
      <button class="tab" data-tab="decisions"><span class="dot"></span>Decisions</button>`;
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

    // Cross-references between panels (e.g. Phase 2 -> Decisions) switch tabs
    // rather than relying on hash navigation, which the tab controller owns.
    document.querySelectorAll('[data-goto]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const target = link.dataset.goto;
        if (!document.getElementById(target)) return;
        e.preventDefault();
        show(target);
      });
    });

    const start = location.hash.replace('#', '');
    if (start && document.getElementById(start)) show(start);
  }

  // Optional per-phase detail files, e.g.
  //   data/<projectId>-phase-2-decision.json
  //   data/<projectId>-phase-1-completion.json
  // A missing file is normal, not an error.
  // Detail files are named data/<project>-phase-<N>-<slug>.json but the slug is
  // arbitrary ("completion", "decision", "system", "future-fish"), and a static
  // host offers no directory listing. So: use the phase's own detailFile when
  // the data supplies one, else this map, else fall back to the slug implied by
  // status. Adding "detailFile" to a phase in the project JSON removes the need
  // to touch this map at all.
  // Candidates in priority order. The explicit pointer wins, but a phase that
  // has been renumbered can carry a pointer whose filename was never renamed,
  // so the id-keyed fallback keeps the phase rendering instead of going blank.
  // A phase points at its own detail file. Older projects that predate that
  // field fall back to the conventional name implied by their status.
  function detailUrlsFor(project, phase) {
    const id = project.projectId;
    const urls = [];
    if (phase.detailFile) urls.push(phase.detailFile);
    if (phase.status === 'current') urls.push(`data/${id}-phase-${phase.number}-decision.json`);
    if (phase.status === 'complete') urls.push(`data/${id}-phase-${phase.number}-completion.json`);
    return urls.filter((u, i) => urls.indexOf(u) === i);
  }

  async function loadPhaseDetails(project) {
    const details = new Map();
    const id = project.projectId;
    if (!id) return details;

    await Promise.all(project.phases.map(async (phase) => {
      for (const url of detailUrlsFor(project, phase)) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const json = await res.json();
          // A decision file lists its options as an array. Phase detail files
          // may also carry a "comparison", but as an attribute map, so test the
          // shape rather than the key's presence.
          const kind = Array.isArray(json.comparison) ? 'decision' : 'completion';
          details.set(phase.number, { [kind]: json });
          return;
        } catch (err) {
          /* try the next candidate */
        }
      }
    }));
    return details;
  }

  async function render() {
    const root = document.querySelector('[data-project]');
    if (!root) return;
    const dataFile = root.getAttribute('data-project-file');

    const res = await fetch(dataFile);
    const project = await res.json();
    currentProjectId = project.projectId || '';

    let costPlan = null;
    if (project.costPlanFile || project.projectId) {
      const costFile = project.costPlanFile || `data/${project.projectId}-cost-plan.json`;
      try {
        const costRes = await fetch(costFile);
        if (costRes.ok) costPlan = await costRes.json();
      } catch (err) {
        console.warn('[render-project] optional cost plan not loaded', err);
      }
    }

    // Per-phase detail files are optional and fetched only where the phase
    // status implies one, so this stays at a couple of requests rather than
    // probing every phase: current -> decision, complete -> completion.
    const phaseDetails = await loadPhaseDetails(project);

    // Optional project-wide checklist file.
    try {
      const tRes = await fetch(`data/${project.projectId}-todos.json`);
      if (tRes.ok) projectTodos = await tRes.json();
    } catch (err) { /* optional */ }

    const titleMount = document.querySelector('[data-project-title]');
    if (titleMount) titleMount.textContent = project.displayTitle || project.name;

    const ledeMount = document.querySelector('[data-project-lede]');
    if (ledeMount) ledeMount.textContent = project.lede || project.subtitle || '';

    document.title = (project.displayTitle || project.name) + ' — Home Project Planner';

    const statMount = document.querySelector('[data-stat-row]');
    if (statMount) statMount.innerHTML = renderStatRow(project);

    const tabsMount = document.querySelector('[data-tabs]');
    if (tabsMount) tabsMount.innerHTML = renderSideNav(project);

    const panelsMount = document.querySelector('[data-panels]');
    if (panelsMount) {
      panelsMount.innerHTML = `
        <section id="roadmap" class="panel active">${renderRoadmap(project, costPlan)}</section>
        ${renderPhasePanels(project, costPlan, phaseDetails)}
        ${renderDecisions(project, phaseDetails)}`;
    }

    initTabs();
    attachMemoryImages();
    initLightbox();
  }

  render().catch((err) => {
    console.error('[render-project] failed to load project data', err);
  });
})();
