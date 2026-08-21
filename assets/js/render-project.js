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
  function moneyRange(min, max, currency) {
    if (min == null || max == null) return '—';
    const symbol = { USD: '$' }[currency] || (currency ? currency + ' ' : '$');
    return `${symbol}${wholeAmount(min)}–${wholeAmount(max)}`;
  }

  function statusPillClass(status) {
    if (status === 'locked' || status === 'complete' || status === 'bought') return 'green';
    if (status === 'open' || status === 'conditional' || status === 'under-evaluation' || status === 'candidate' || status === 'considering' || status === 'need-to-buy') return 'amber';
    return '';
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
    const constraints = sc
      ? `<p><strong>Site constraints</strong></p><ul>
          ${sc.climate ? `<li>${esc(sc.climate)}</li>` : ''}
          ${sc.preferredWaterMovement ? `<li>${esc(sc.preferredWaterMovement)}</li>` : ''}
          ${sc.maintenanceTarget ? `<li>${esc(sc.maintenanceTarget)}</li>` : ''}
          ${sc.designIntent ? `<li>${esc(sc.designIntent)}</li>` : ''}
        </ul>`
      : '';
    const accounting = costPlan && costPlan.accountingNote
      ? `<p><strong>Cost accounting</strong></p><p>${esc(costPlan.accountingNote)}</p>`
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
    const suffix = costRow.actualStatus === 'complete' ? ' ✓'
      : costRow.actualStatus === 'so-far' ? ' <span class="qualifier">so far</span>'
      : '';
    return `<span class="actual-amount">${esc(money(costRow.actual, currency))}</span>${suffix}`;
  }

  function renderRoadmap(project, costPlan) {
    const phases = project.phases;
    const currency = project.currency;
    const plannedNumbers = phases.filter((p) => p.status === 'planned').map((p) => p.number);
    const nextPlannedNumber = plannedNumbers.length ? Math.min(...plannedNumbers) : null;

    const strip = phases.map((p) => `<span class="${p.status === 'complete' ? 'complete' : p.status === 'current' ? 'current' : ''}" title="Phase ${p.number}: ${esc(p.name)}"></span>`).join('');

    const rows = phases.map((phase) => {
      const { badge, rowCls } = phaseBadge(phase, nextPlannedNumber);
      const statusLabel = badge || capitalize(phase.status);
      const costRow = costRowFor(costPlan, phase);
      const estimated = costRow
        ? moneyRange(costRow.estimatedMin, costRow.estimatedMax, currency)
        : '—';
      return `
        <tr class="${rowCls}">
          <td class="col-num">${phase.number}</td>
          <td class="phase-name">${esc(phase.name)}</td>
          <td class="col-status"><span class="pill ${statusPillClass(phase.status)}">${esc(statusLabel)}</span></td>
          <td class="phase-summary">${esc(phase.summary || '')}</td>
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

  // A completed phase gets a sidebar: completion image on top, itemized
  // shopping list below. The shopping list carries every amount the phase's
  // spendBreakdown used to show, so replacing that table loses no figures.
  function renderCompletionSidebar(completion, phase, project, costRow) {
    if (!completion) return '';
    const currency = project.currency;
    const projectId = project.projectId || '';

    // Prefer a phase-specific photo, fall back to the project photo, then
    // hide the figure entirely rather than leaving a broken image.
    const phaseImg = `assets/img/${projectId}-phase${phase.number}.png`;
    const projectImg = `assets/img/${projectId}.png`;
    const figure = `
      <figure class="completion-card">
        <img src="${esc(phaseImg)}" alt="End of Phase ${phase.number} — ${esc(completion.label || phase.name)}"
             loading="lazy"
             data-fallback="${esc(projectImg)}"
             onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback')}else{this.closest('figure').style.display='none'}">
        <figcaption>
          <strong>End of Phase ${phase.number}</strong>
          ${completion.goal ? `<span class="caption-note">${esc(completion.goal)}</span>` : ''}
        </figcaption>
      </figure>`;

    // Per-item estimates are not present in the data, so the estimate column
    // shows a dash per row; the phase-level estimate carries the total.
    const itemRows = (completion.items || []).map((i) => `
      <tr>
        <td class="col-check">${i.status === 'complete' ? '<span class="check" title="Complete">✓</span>' : ''}</td>
        <td>${esc(i.item)}</td>
        <td class="col-est">—</td>
        <td class="col-actual"><span class="actual-amount">${esc(money(i.actual, currency))}</span></td>
      </tr>`).join('');

    const estTotal = costRow
      ? moneyRange(costRow.estimatedMin, costRow.estimatedMax, currency)
      : '—';

    // The spendBreakdown entry matching this phase's total is now itemized
    // above, so its original label rides along on the total row instead of
    // disappearing with the old Spend table.
    const totalLabels = (phase.spendBreakdown || [])
      .filter((s) => Number(s.amount) === Number(completion.actualTotal))
      .map((s) => s.label);

    // Amounts recorded against this phase but accounted for elsewhere are kept
    // visible and labelled, rather than dropped from the page.
    const elsewhere = (phase.spendBreakdown || []).filter((s) => {
      const amt = Number(s.amount);
      return amt !== Number(completion.actualTotal);
    });
    const elsewhereRows = elsewhere.map((s) => `
      <tr class="offphase-row">
        <td class="col-check"></td>
        <td>${esc(s.label)}<span class="caption-note">Counted under Phase 3, not in the Phase ${phase.number} total</span></td>
        <td class="col-est">—</td>
        <td class="col-actual">${esc(money(s.amount, currency))}</td>
      </tr>`).join('');

    return `
      <aside class="phase-side">
        ${figure}
        <div class="shopping-card">
          <h3>Shopping list</h3>
          <table class="phase-shopping">
            <tr><th class="col-check"></th><th>Item</th><th class="col-est">Est.</th><th class="col-actual">Actual</th></tr>
            ${itemRows}
            <tr class="total-row">
              <td class="col-check"></td>
              <td>
                Phase ${phase.number} total
                ${totalLabels.map((l) => `<span class="caption-note">${esc(l)}</span>`).join('')}
              </td>
              <td class="col-est">${esc(estTotal)}</td>
              <td class="col-actual"><span class="actual-amount">${esc(money(completion.actualTotal, currency))}</span></td>
            </tr>
            ${elsewhereRows}
          </table>
        </div>
      </aside>`;
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
  function renderPhaseBody(phase, currency, costPlan, hasSidebar) {
    let html = '';

    const costRow = costRowFor(costPlan, phase);
    html += renderPhaseCostLine(costRow, currency);

    if (phase.summary) {
      html += `<div class="box"><p>${esc(phase.summary)}</p></div>`;
    }

    if (phase.layout) {
      html += `<div class="box"><p><strong>Layout:</strong> ${esc(phase.layout)}</p></div>`;
    }

    if (phase.items && phase.items.length) {
      html += `<div class="box"><ul>${phase.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
    }

    if (phase.decisionCriteria && phase.decisionCriteria.length) {
      html += `<div class="box"><h3>Decision criteria</h3><ul>${phase.decisionCriteria.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
    }

    if (phase.candidates && phase.candidates.length) {
      html += renderCandidates(phase.candidates);
    }

    if (phase.decisionGate) {
      html += `<div class="notice">${esc(phase.decisionGate)}</div>`;
    }

    if (phase.requirements && phase.requirements.length) {
      html += `<div class="box"><ul>${phase.requirements.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
    }

    // The sidebar's shopping list reproduces every spendBreakdown amount, so
    // the Spend table is only suppressed when that sidebar is actually shown.
    if (!hasSidebar && phase.spendBreakdown && phase.spendBreakdown.length) {
      html += `<div class="box"><h3>Spend</h3><table>
        <tr><th>Item</th><th>Amount</th></tr>
        ${phase.spendBreakdown.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(money(s.amount, currency))}</td></tr>`).join('')}
      </table></div>`;
    }

    if (phase.notes && phase.notes.length) {
      html += phase.notes.map((n) => `<div class="notice">${esc(n)}</div>`).join('');
    }

    return html;
  }

  // ---- Decision panels (a phase's narrowed finalist comparison) -------------

  function finalistCard(c, currency) {
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
      <article class="finalist ${c.status === 'preferred' ? 'is-preferred' : ''}">
        <header class="fin-head">
          <div>
            <h3>${esc(c.name)}</h3>
            <span class="caption-note">${esc(c.retailer || '')}</span>
          </div>
          <span class="pill ${c.status === 'preferred' ? 'accent' : ''}">${esc(humanizeSlug(c.status))}</span>
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

  function renderPendingShopping(decision, currency) {
    const ps = decision.pendingShoppingList;
    if (!ps || !ps.items || !ps.items.length) return '';
    return `
      <div class="shopping-card">
        <h3>Pending purchase</h3>
        <table class="phase-shopping">
          <tr><th>Item</th><th class="col-est">Est.</th><th class="col-actual">Actual</th></tr>
          ${ps.items.map((i) => `
            <tr>
              <td>${esc(i.item)}
                <span class="caption-note">${esc(i.retailer || '')}${i.link ? ` · <a href="${esc(i.link)}" target="_blank" rel="noopener">link</a>` : ''}${i.note ? ' · ' + esc(i.note) : ''}</span>
              </td>
              <td class="col-est">${esc(optionalMoney(i.estimatedCost, currency))}</td>
              <td class="col-actual">${esc(optionalMoney(i.actualCost, currency))}</td>
            </tr>`).join('')}
          <tr class="total-row">
            <td>Phase allowance</td>
            <td class="col-est">${esc(moneyRange(ps.phaseEstimateMin, ps.phaseEstimateMax, currency))}</td>
            <td class="col-actual">${esc(optionalMoney(ps.actualTotal, currency))}</td>
          </tr>
        </table>
        ${ps.note ? `<p class="caption-note">${esc(ps.note)}</p>` : ''}
      </div>`;
  }

  function renderDecisionPanel(decision, phase, project) {
    const currency = project.currency;
    const finalists = (decision.comparison || []).map((c) => finalistCard(c, currency)).join('');
    const why = (decision.whyPreferred || []).map((w) => `<li>${esc(w)}</li>`).join('');
    const preferredName = (decision.comparison || []).find((c) => c.status === 'preferred');
    const whyTitle = preferredName
      ? `Why ${esc(preferredName.name.split(' ').slice(0, 2).join(' '))} is the preferred choice`
      : 'Why this is the preferred choice';

    // The phase summary, goal and decision summary share one box rather than
    // stacking three near-identical cards; all three texts are kept verbatim.
    const intro = [
      phase.summary ? `<p>${esc(phase.summary)}</p>` : '',
      decision.goal ? `<p><strong>Goal:</strong> ${esc(decision.goal)}</p>` : '',
      decision.decisionSummary ? `<p>${esc(decision.decisionSummary)}</p>` : '',
    ].filter(Boolean).join('');

    return `
      ${decision.preferredChoice ? `
        <div class="notice accent">
          <strong>Preferred choice:</strong> ${esc(decision.preferredChoice)}
          — <em>${esc(humanizeSlug(decision.decisionState || ''))}</em>
        </div>` : ''}
      ${intro ? `<div class="box intro-box">${intro}</div>` : ''}
      <div class="finalists">${finalists}</div>
      <div class="decision-cols">
        ${why ? `
          <div class="box why-preferred">
            <h3>${whyTitle}</h3>
            <ul>${why}</ul>
          </div>` : ''}
        ${renderPendingShopping(decision, currency)}
      </div>
      ${decision.completionRule ? `<div class="notice">${esc(decision.completionRule)}</div>` : ''}`;
  }

  function renderPhasePanels(project, costPlan, phaseDetails) {
    return project.phases.map((phase) => {
      const detail = phaseDetails.get(phase.number) || {};
      const decision = detail.decision;
      const completion = completionFor(costPlan, phase);
      const costRow = costRowFor(costPlan, phase);

      // A phase with a decision file leads with the finalist comparison; its
      // older evaluation content moves into the history accordion below.
      if (decision) {
        return `
          <section id="p${phase.number}" class="panel">
            <h2>Phase ${phase.number} — ${esc(decision.title || phase.name)}</h2>
            ${renderPhaseCostLine(costRow, currencyOf(project))}
            ${renderDecisionPanel(decision, phase, project)}
            ${renderDecisionHistory(phase, decision)}
            ${(phase.notes || []).map((n) => `<div class="notice">${esc(n)}</div>`).join('')}
            ${phase.decisionGate ? `<div class="notice">${esc(phase.decisionGate)}</div>` : ''}
          </section>`;
      }

      const body = renderPhaseBody(phase, project.currency, costPlan, !!completion);
      // Phases with a completion record get a two-column layout; the rest keep
      // the single-column form.
      const inner = completion
        ? `<div class="phase-layout">
             <div class="phase-main">${body}</div>
             ${renderCompletionSidebar(completion, phase, project, costRow)}
           </div>`
        : body;
      return `
        <section id="p${phase.number}" class="panel">
          <h2>Phase ${phase.number} — ${esc(phase.name)}</h2>
          ${inner}
        </section>`;
    }).join('');
  }

  function renderDecisions(project) {
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
        ${maintenanceRows ? `
        <h2 style="margin-top:14px">Maintenance</h2>
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

  function renderShopping(project) {
    const items = project.shopping || [];
    if (!items.length) return '';

    const budget = project.budget || {};
    const budgetSummary = `
      <div class="box">
        <p>
          <strong>Planned:</strong> ${esc(optionalMoney(budget.planned, project.currency))}
          &nbsp;·&nbsp; <strong>Spent:</strong> ${esc(optionalMoney(budget.spentToDate != null ? budget.spentToDate : project.spentToDate, project.currency))}
          &nbsp;·&nbsp; <strong>Remaining:</strong> ${esc(optionalMoney(budget.remaining, project.currency))}
        </p>
        ${budget.note ? `<p>${esc(budget.note)}</p>` : ''}
      </div>`;

    const order = ['bought', 'considering', 'need-to-buy', 'rejected'];
    const groups = order.map((status) => {
      const rows = items.filter((i) => i.status === status);
      if (!rows.length) return '';
      return `
        <details class="accordion" ${status === 'need-to-buy' ? 'open' : ''}>
          <summary>${esc(shoppingStatusLabel(status))} <span class="pill ${statusPillClass(status)}">${rows.length}</span></summary>
          <div class="accordion-body">
            <table>
              <tr><th>Phase</th><th>Item</th><th>Store / link</th><th>Price</th><th>Actual</th></tr>
              ${rows.map((i) => `
                <tr>
                  <td>${i.phase != null ? 'P' + esc(i.phase) : '—'}</td>
                  <td><strong>${esc(i.item)}</strong>${i.note ? `<div class="cand-priority">${esc(i.note)}</div>` : ''}</td>
                  <td>${i.store ? esc(i.store) : '—'}${i.link ? ` · <a href="${esc(i.link)}" target="_blank" rel="noopener">link</a>` : ''}</td>
                  <td>${esc(optionalMoney(i.price, project.currency))}</td>
                  <td>${esc(optionalMoney(i.actualCost, project.currency))}</td>
                </tr>`).join('')}
            </table>
          </div>
        </details>`;
    }).join('');

    return `
      <section id="shopping" class="panel">
        <h2>Shopping + budget</h2>
        ${budgetSummary}
        <div class="shopping-groups">${groups}</div>
      </section>`;
  }

  function renderSideNav(project) {
    const plannedNumbers = project.phases.filter((p) => p.status === 'planned').map((p) => p.number);
    const nextPlannedNumber = plannedNumbers.length ? Math.min(...plannedNumbers) : null;

    const phaseTabs = project.phases.map((phase) => {
      const { navCls } = phaseBadge(phase, nextPlannedNumber);
      return `<button class="tab ${navCls}" data-tab="p${phase.number}"><span class="dot"></span>${phase.number} — ${esc(tabLabel(phase))}</button>`;
    }).join('');

    const shoppingTab = project.shopping && project.shopping.length
      ? `<button class="tab" data-tab="shopping"><span class="dot"></span>Shopping</button>`
      : '';

    return `
      <button class="tab active" data-tab="roadmap"><span class="dot"></span>Roadmap</button>
      <div class="divider"></div>
      ${phaseTabs}
      <div class="divider"></div>
      <button class="tab" data-tab="decisions"><span class="dot"></span>Decisions</button>
      ${shoppingTab}`;
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

  // Optional per-phase detail files, e.g.
  //   data/<projectId>-phase-2-decision.json
  //   data/<projectId>-phase-1-completion.json
  // A missing file is normal, not an error.
  async function loadPhaseDetails(project) {
    const details = new Map();
    const id = project.projectId;
    if (!id) return details;

    const wanted = [];
    project.phases.forEach((p) => {
      if (p.status === 'current') wanted.push([p.number, 'decision']);
      if (p.status === 'complete') wanted.push([p.number, 'completion']);
    });

    await Promise.all(wanted.map(async ([num, kind]) => {
      try {
        const res = await fetch(`data/${id}-phase-${num}-${kind}.json`);
        if (!res.ok) return;
        const json = await res.json();
        const entry = details.get(num) || {};
        entry[kind] = json;
        details.set(num, entry);
      } catch (err) {
        /* optional file — absence is expected */
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
        ${renderDecisions(project)}
        ${renderShopping(project)}`;
    }

    initTabs();
  }

  render().catch((err) => {
    console.error('[render-project] failed to load project data', err);
  });
})();
