'use strict';

/* ================= The morning briefing and career certificates ================= */

function briefingCard() {
  const b = briefing(), list = items => items.map(x => `<li class="brief ${x.kind}">${esc(x.text)}</li>`).join('');
  return `<div class="card"><div class="row"><h3>Morning briefing</h3><span class="chip right">${esc(S.owner)}, ${esc(currentRank().name)}</span></div>
    <div class="briefgrid"><div><div class="small muted">Today</div><ul class="blist">${list(b.today)}</ul></div>
      <div><div class="small muted">Tomorrow</div><ul class="blist">${list(b.tomorrow)}</ul></div></div></div>`;
}

MODALS.certificate = m => {
  const c = S.career.certs[m.index];
  if (!c) return null;
  return { inner: `<div class="confcard"><img class="logo-mid" src="icons/logo-small.png" alt="" width="420" height="279"><div class="conf-sub">Certificate of promotion</div>
    <p style="margin:10px 0">This certifies that</p><div class="conf-title">${esc(S.owner)}</div>
    <p style="margin:10px 0">has been promoted to</p><div class="conf-title" style="color:var(--accent)">${esc(c.rank)}</div>
    <p style="margin:10px 0">of ${esc(S.hotel)}, on day ${c.day + 1}.</p><div class="conf-welcome">The Board<small>${esc(S.hotel)}</small></div></div>
    <div class="actions"><button class="btn primary big" data-act="closeModal">Done</button></div>` };
};
actions.certOpen = d => openModal({ type: 'certificate', index: Number(d.i) });
