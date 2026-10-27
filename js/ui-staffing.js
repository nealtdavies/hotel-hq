'use strict';

/* ================= Staffing advice on screen: the stretched-team card on Tasks, and the recruitment guide ================= */

/* On the Tasks page, when some kind of work has more jobs than the team can do today. */
function capacityCard() {
  const rows = stretchedRoles();
  if (!rows.length) return '';
  return `<div class="card"><h3>Your team is stretched</h3>
    <div class="stack">${rows.map(r => `<div class="alert warn"><div>${esc(recruitText(r))}</div>
      <div class="row" style="margin-top:8px">${roleAvailable(r.role) ? `<button class="btn sm primary" data-act="recruitNow" data-role="${esc(r.role)}">Advertise for a ${esc(r.role)} (${money(ADVERT_COST)})</button>` : ''}<button class="btn sm ghost" data-act="openRecruit">See applicants</button></div></div>`).join('')}</div>
    <div class="small muted" style="margin-top:8px">Look at each applicant's skill, reliability and wage before you hire. The Recruitment page explains what they mean.</div></div>`;
}

/* On the Recruitment tab: what to do about a shortage, and how to choose between people. */
function hireGuide() {
  const rows = stretchedRoles(), roles = [...new Set(S.candidates.map(c => c.role))];
  return `${rows.length ? `<div class="stack">${rows.map(r => `<div class="alert warn">${esc(recruitText(r))}</div>`).join('')}</div>` : ''}
    <div class="card"><h3>Choosing who to hire</h3>
    <ul style="margin:8px 0 0;padding-left:20px;display:grid;gap:8px">
      <li><b>Skill is experience</b>, from 1 to 5 stars. Each star above 3 adds ${money(WAGE_PER_STAR)} to the wage you pay every day they work, and each star below 3 takes ${money(WAGE_PER_STAR)} off. A 5-star costs ${money(2 * WAGE_PER_STAR)} a day more than a 3-star, and a 1-star ${money(2 * WAGE_PER_STAR)} less.</li>
      <li><b>What skill is worth depends on the job.</b>${roles.length ? '' : ' Applicants for each role are explained here.'}${roles.map(r => `<div class="small muted" style="margin-top:4px"><b>${esc(r)}:</b> ${esc(skillAdvice(r))}</div>`).join('')}</li>
      <li><b>Reliability is about sick days.</b> A 5-star is off sick about ${(6 - 5) * SICK_PER_STAR} days in 100 and a 1-star about ${(6 - 1) * SICK_PER_STAR}, and more when they are worn out. Sick days cost half a wage and the work is not done. Reliability costs nothing extra, so it is usually the best thing to look for.</li>
      <li><b>Wages are paid for every day someone works</b>, out of your takings. A bigger team does more jobs, but only hire as many as the extra work pays for.</li>
    </ul></div>`;
}

/* Under an applicant: what they cost compared with the usual wage, and how often they are off sick. */
function candidateAdvice(c) {
  const d = wageDiff(c.role, c.wage);
  return `<div class="small muted">${money(c.wage)} a day is ${d === 0 ? 'the usual wage' : d > 0 ? `${money(d)} more than the usual wage` : `${money(-d)} less than the usual wage`} for a ${esc(c.role)}, about ${money(c.wage * 5)} a week if they work five days. Off sick about ${(6 - c.reliability) * SICK_PER_STAR} days in 100.</div>`;
}

actions.openRecruit = () => { ui.staffTab = 'hire'; actions.nav({ view: 'staff' }); };
/* Posts the advert and shows the applicants. */
actions.recruitNow = d => { actions.advert(d); ui.staffTab = 'hire'; actions.nav({ view: 'staff' }); };
