'use strict';
/* ================= Your bank: a made-up bank the player names (no DOM access) =================
   Nothing here is a real account. The number is invented by the game (it always starts "HQ"), and the player only chooses a name and a colour. */
const BANK_COLOURS = [
  { key: 'navy', name: 'Navy', hex: '#1f3a5f' }, { key: 'forest', name: 'Forest', hex: '#1f5f46' }, { key: 'plum', name: 'Plum', hex: '#5b2a63' },
  { key: 'crimson', name: 'Crimson', hex: '#8a2432' }, { key: 'slate', name: 'Slate', hex: '#374151' }, { key: 'gold', name: 'Gold', hex: '#8a6a1f' }
];
const BANK_NAME_MAX = 24, BANK_DEFAULT_NAME = 'Hotel HQ Bank';

function cleanBankName(name) {
  const n = String(name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, BANK_NAME_MAX);
  return n || BANK_DEFAULT_NAME;
}
function makeAccountNumber() {
  const group = () => String(rndRange(0, 9999)).padStart(4, '0');
  return `HQ ${group()} ${group()}`;
}
function makeBank(name, colour) {
  return { name: cleanBankName(name), colour: BANK_COLOURS.some(c => c.key === colour) ? colour : BANK_COLOURS[0].key, account: makeAccountNumber() };
}
const bankName = () => (S.bank && S.bank.name) || BANK_DEFAULT_NAME;
const bankColour = () => (BANK_COLOURS.find(c => S.bank && c.key === S.bank.colour) || BANK_COLOURS[0]).hex;
