'use strict';
/* ================= Staffing advice: when the team is stretched, and how to choose who to hire (no DOM access) =================
   Each person can do STAFF_CAP jobs a day. When more jobs are waiting for a kind of work than the team on duty can still do, the game says
   so, and says what to do: recruit. The advice about skill and reliability is only ever what the rules really do: a wage is the role's base pay
   plus WAGE_PER_STAR for each skill star above three, skill helps with complaints, guest requests and events, and reliability (which costs
   nothing extra) is the chance of someone being off sick. */

const WAGE_PER_STAR = 8, SICK_PER_STAR = 3;   // £ a day for each skill star above three; percentage points of sick chance for each reliability star below five

/* What skill is worth in each job. Anything not listed has the general line. */
const SKILL_FOR = {
  'Receptionist': 'Skill matters most here. Whenever a Receptionist settles a complaint, the guest ends up 3 points happier for each skill star, and they also take the calls and bookings.',
  'Housekeeper': 'Skill barely matters for cleaning: a star does not make rooms clean any faster. It only helps with guest requests such as towels and pillows. A reliable, cheaper Housekeeper is usually the best buy.',
  'Maintenance': 'Skill does not change how fast or how well repairs are done, so reliability and a fair wage matter more than stars.',
  'Chef': 'Skill makes guests who order room service happier. The number of Chefs, not their skill, sets how many diners you can seat (30 each).',
  'Spa Therapist': 'Skill makes guests happier after a treatment, 2 points for each star.'
};
const SKILL_GENERAL = 'Skill makes guests a little happier after each request they handle (2 points for each star), and a team of skilled people makes events go better.';
const skillAdvice = role => SKILL_FOR[role] || SKILL_GENERAL;

/* What a person costs against what the job usually pays. */
const wageDiff = (role, wage) => wage - ROLES[role].base;

/* How stretched each kind of work is right now: waiting jobs against the jobs the people on duty can still do today. Managers can do any
   job, so whatever spare capacity they have covers the biggest gaps first. Returns one row for each kind of work that has jobs, the most
   short-handed first: { role, jobs, headcount, onDuty, free, short, covered, remaining }. */
function workload() {
  const roles = [...new Set(S.jobs.map(j => j.role).filter(r => ROLES[r]))];
  const onDuty = role => S.staff.filter(s => s.role === role && worksOn(s, S.day) && s.sickDays === 0);
  const freeOf = list => list.reduce((a, s) => a + Math.max(0, STAFF_CAP - s.used), 0);
  let managers = freeOf(onDuty('Manager'));
  const rows = roles.map(role => {
    const duty = onDuty(role), jobs = S.jobs.filter(j => j.role === role).length, free = freeOf(duty);
    return { role, jobs, headcount: S.staff.filter(s => s.role === role).length, onDuty: duty.length, free, short: Math.max(0, jobs - free), covered: 0, remaining: 0 };
  }).sort((a, b) => b.short - a.short);
  for (const r of rows) { r.covered = r.role === 'Manager' ? 0 : Math.min(r.short, managers); managers -= r.covered; r.remaining = r.short - r.covered; }
  return rows.sort((a, b) => b.remaining - a.remaining || b.short - a.short);
}
/* The kinds of work with more jobs than the team can do today, even with the Managers' help. */
const stretchedRoles = () => workload().filter(r => r.remaining > 0 && r.role !== 'Manager');

/* One sentence of advice for a stretched kind of work. */
function recruitText(row) {
  const left = row.remaining === 1 ? 'one job' : `${row.remaining} jobs`;
  const full = S.staff.length >= staffLimit() ? ` Your team is full for this level (${S.staff.length} of ${staffLimit()}), so you will need to grow your hotel first.` : '';
  return `${row.role}: ${row.jobs} jobs, and your ${row.onDuty} on duty can do ${row.free} more today, so ${left} will wait. Recruit another ${row.role}.${full}`;
}
