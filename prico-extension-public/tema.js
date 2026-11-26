// Light or dark before the first paint (1.8, 16 Nov 2026).
//
// Loaded in <head>, before the stylesheet paints anything, so the window
// never flashes white first. The choice is the one the sun/moon button
// stored (localStorage is synchronous, chrome.storage is not). With no
// choice made the window is LIGHT, whatever the system setting (owner,
// 16 Nov 2026: a fresh install opened dark on a dark-mode computer). connector.js keeps
// chrome.storage.local.prico_tema in step, for the toast on the page.
(function () {
  var tema = null;
  try {
    tema = localStorage.getItem("prico_tema");
  } catch (e) {}
  if (tema !== "mork" && tema !== "lys") {
    tema = "lys";
  }
  document.documentElement.setAttribute("data-tema", tema);
})();
