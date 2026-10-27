'use strict';

/* Used only inside the iPhone and Android apps (tools/build-www.js adds it to www/index.html). It copies every save to Capacitor's
   Preferences plugin, the phone's own key-value storage, and js/main.js restores the save from it if the web view has lost its data.
   Preferences works with string values: get({ key }) resolves to { value: string | null }, set({ key, value }) and remove({ key }).
   NOT yet tested on a real device: see "Phone apps" in README.md. */
(function () {
  const prefs = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
  if (!prefs) return;
  storage.mirror = {
    get: async key => (await prefs.get({ key })).value,
    set: (key, value) => prefs.set({ key, value }),
    remove: key => prefs.remove({ key })
  };
})();
