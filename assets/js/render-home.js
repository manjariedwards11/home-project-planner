// Renders the project list on index.html from data/projects.json.
// No project facts are hard-coded here — everything comes from JSON.
(() => {
  'use strict';

  const CURRENCY_SYMBOLS = { USD: '$' };

  function money(amount, currency) {
    const symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
    return symbol + Number(amount).toFixed(2);
  }

  async function render() {
    const mount = document.querySelector('[data-projects]');
    const heading = document.querySelector('[data-projects-heading]');
    if (!mount) return;

    const res = await fetch('data/projects.json');
    const data = await res.json();
    const projects = data.projects || [];

    if (heading) {
      heading.textContent = projects.length + ' project' + (projects.length === 1 ? '' : 's') + ' underway';
    }

    mount.innerHTML = projects.map((p) => `
      <a class="card" href="${p.id}.html">
        <div class="thumb">
          <div class="trellis left"></div>
          <div class="trellis right"></div>
          <div class="pond"></div>
        </div>
        <div class="card-body">
          <h3>${p.name}</h3>
          <div class="meta">Phase ${p.currentPhase} of ${p.totalPhases} · ${money(p.spentToDate, p.currency)} spent so far</div>
          <span class="status">CURRENT: ${(p.currentLabel || '').toUpperCase()}</span>
        </div>
      </a>
    `).join('');
  }

  render().catch((err) => {
    console.error('[render-home] failed to load data/projects.json', err);
  });
})();
