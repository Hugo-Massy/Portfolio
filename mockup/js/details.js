// Page détails — deux comportements légers, autonomes (aucune dépendance au SPA
// de la page d'accueil) : révélation des blocs au scroll, et surlignage de l'entrée
// active dans le sommaire latéral au fil du défilement.

// Anime les blocs .reveal quand ils entrent dans le viewport (une seule fois).
(function initReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  targets.forEach((el) => observer.observe(el));
})();

// Surligne dans le sommaire l'entrée correspondant à la carte actuellement au centre
// du viewport ; un clic sur un lien la marque aussi tout de suite (avant l'arrivée).
(function initSideNavSpy() {
  const nav = document.getElementById('dp-side-nav');
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll('a[data-target]'));
  const entries = links
    .map((a) => ({ link: a, section: document.getElementById(a.dataset.target) }))
    .filter((e) => e.section);
  if (!entries.length) return;

  function setActive(link) {
    links.forEach((a) => a.classList.toggle('is-active', a === link));
  }

  const observer = new IntersectionObserver((obsEntries) => {
    obsEntries.forEach((obsEntry) => {
      if (!obsEntry.isIntersecting) return;
      const match = entries.find((e) => e.section === obsEntry.target);
      if (match) setActive(match.link);
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  entries.forEach((e) => observer.observe(e.section));

  // clic : surlignage immédiat, sans attendre que l'observer rattrape le scroll fluide
  links.forEach((link) => {
    link.addEventListener('click', () => setActive(link));
  });
})();

// Terminal du hero : champ de saisie utilisable pour sauter à un fichier (Entrée),
// et Tab / Shift+Tab pour parcourir les onglets (fichiers) de la page dans l'ordre.
(function initTermInput() {
  const input = document.getElementById('dp-term-input');
  const row = document.getElementById('dp-term-input-row');
  const nav = document.getElementById('dp-side-nav');
  if (!input || !row || !nav) return;

  const links = Array.from(nav.querySelectorAll('a[data-target]'));
  const entries = links
    .map((link) => ({ link, section: document.getElementById(link.dataset.target) }))
    .filter((e) => e.section);
  if (!entries.length) return;

  const normalize = (str) => str
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  let index = -1;

  function setActive(i) {
    links.forEach((a, j) => a.classList.toggle('is-active', j === i));
  }

  // Tab : sélectionne seulement (remplit le champ), sans quitter la page.
  function select(i) {
    index = ((i % entries.length) + entries.length) % entries.length;
    const entry = entries[index];
    input.value = entry.link.querySelector('span').textContent;
    row.classList.toggle('has-value', input.value.length > 0);
  }

  // Entrée : saute réellement vers le fichier actuellement dans le champ.
  function navigate() {
    const query = normalize(input.value);
    if (!query) return;
    const match = entries.findIndex((entry) => normalize(entry.link.querySelector('span').textContent).includes(query));
    if (match === -1) return;
    index = match;
    entries[match].section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(match);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      select(index + (e.shiftKey ? -1 : 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      navigate();
    }
  });

  input.addEventListener('input', () => {
    row.classList.toggle('has-value', input.value.length > 0);
  });

  // clic sur un fichier du sommaire : synchronise l'index courant du champ
  links.forEach((link, i) => {
    link.addEventListener('click', () => { index = i; });
  });
})();

// Rail de navigation (dupliqué depuis sections/nav.html) : indicateur qui suit la
// section visible. Les liens qui pointent vers index.html#... n'ont pas de cible sur
// cette page et sont simplement ignorés par l'observer, sans erreur.
(function initDotRailSpy() {
  const tabs = document.querySelectorAll('.dot-rail a[href^="#"]');
  const indicator = document.querySelector('.dot-rail-indicator');
  if (!tabs.length) return;
  const sectionToTab = new Map();
  tabs.forEach((tab) => {
    const section = document.getElementById(tab.getAttribute('href').slice(1));
    if (section) sectionToTab.set(section, tab);
  });
  if (!sectionToTab.size) return;

  const INDICATOR_TRAVEL_MS = 450;
  let activateTimer = null;

  function moveIndicatorTo(tab) {
    if (!indicator) return;
    indicator.style.top = `${tab.offsetTop + tab.offsetHeight / 2}px`;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const tab = sectionToTab.get(entry.target);
      if (!tab) return;
      clearTimeout(activateTimer);
      tabs.forEach((t) => t.classList.remove('is-active'));
      moveIndicatorTo(tab);
      activateTimer = setTimeout(() => tab.classList.add('is-active'), INDICATOR_TRAVEL_MS);
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sectionToTab.forEach((tab, section) => observer.observe(section));
  moveIndicatorTo(tabs[0]);
})();

// Bouton "remonter en haut" : visible dès qu'on a quitté l'en-tête de la page.
(function initBackToTop() {
  const btn = document.querySelector('.back-to-top');
  const hero = document.getElementById('dp-hero');
  if (!btn || !hero) return;

  function update() {
    btn.classList.toggle('is-visible', window.scrollY > hero.offsetHeight * 0.5);
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();

// Flèche "défiler vers le bas" du header : se cache dès qu'on quitte le haut de page.
(function initScrollDownButton() {
  const btn = document.querySelector('.scroll-down');
  if (!btn) return;

  function update() {
    btn.classList.toggle('is-hidden', window.scrollY > 10);
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
})();

// Sélecteur de langue : dupliqué pour la cohérence visuelle du rail, mais bloqué —
// cette page n'a pas de contenu traduit, donc changer de langue n'aurait aucun effet.
(function initLangSwitch() {
  const btn = document.querySelector('.lang-switch');
  if (!btn) return;

  btn.disabled = true;
  btn.classList.add('is-disabled');
  btn.setAttribute('aria-disabled', 'true');
  btn.title = 'Changement de langue indisponible sur cette page';

  function updateAtTop() {
    btn.classList.toggle('is-at-top', window.scrollY <= 10);
  }
  updateAtTop();
  window.addEventListener('scroll', updateAtTop, { passive: true });
})();
