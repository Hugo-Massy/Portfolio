// Barre de progression du contenu (format téléphone uniquement, cf. .scroll-progress dans
// styles.css) : la largeur de .scroll-progress-fill (en scaleX) suit la fraction déjà
// parcourue de la hauteur défilable totale du document.
(function () {
  const fill = document.querySelector('.scroll-progress-fill');
  if (!fill) return;

  function update() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, doc.scrollTop / scrollable)) : 0;
    fill.style.transform = `scaleX(${progress.toFixed(4)})`;
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();
