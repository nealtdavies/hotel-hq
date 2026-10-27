'use strict';

/* ================= Boot ================= */
S = loadSave();
const bootAway = S ? catchUp(localDate(0)) : null;   // the hotel was left online past midnight: it ran by itself
if (bootAway) writeSave();
if (!S) ui.modal = { type: 'intro' };
render();
welcomeBack();
if (bootAway) { ui.pendingAway = bootAway; if (!ui.modal) showAway(bootAway); }   // after the welcome-back screen if there is one
// In the phone apps the web view can lose its data; if a mirror still holds the save, bring it back.
if (!S && storage.mirror) storage.restore([SAVE_KEY, LEGACY_SAVE_KEY]).then(found => { const saved = found && loadSave(); if (saved) { S = saved; ui.modal = null; render(); welcomeBack(); } });
registerOffline();
TIERS.forEach(t => { const probe = new Image(); probe.onerror = () => { missingImgs.add(tierImage(t.id)); if (S) render(); }; probe.src = tierImage(t.id); });
