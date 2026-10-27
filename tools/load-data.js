'use strict';
/* Shared loader: runs the game's data and scenario scripts in a sandbox and returns a handle. */
const vm = require('vm'), fs = require('fs'), path = require('path');
module.exports = function loadData() {
  const root = path.join(__dirname, '..', 'js');
  const sb = { console, Math, JSON, Date, Number, Object, Array, String, Set, Map, Error };
  vm.createContext(sb);
  for (const f of ['data.js', 'scenarios.js', 'scenarios-guests.js', 'scenarios-business.js', 'scenarios-extra.js', 'scenarios-fun.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f });
  return { run: c => vm.runInContext(c, sb), root: path.join(__dirname, '..') };
};
