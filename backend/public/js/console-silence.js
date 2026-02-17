(function () {
  'use strict';

  var noop = function () {};
  var methods = ['log', 'info', 'warn', 'error', 'debug'];

  function silence(target) {
    if (!target || !target.console) return;
    for (var i = 0; i < methods.length; i += 1) {
      var method = methods[i];
      try {
        target.console[method] = noop;
      } catch (e) {
        // Ignore read-only console in restricted environments.
      }
    }
  }

  silence(typeof window !== 'undefined' ? window : null);
  silence(typeof self !== 'undefined' ? self : null);
})();
