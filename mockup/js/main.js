// Charge chaque section depuis sections/*.html et l'injecte dans son placeholder.
const SECTIONS = ['nav', 'hero', 'about', 'skills'];

// Langue actuellement affichée — lue par TERM_COMMANDS pour produire ses sorties dans
// la bonne langue, et mise à jour par initLangSwitch (voir applyTranslations).
let CURRENT_LANG = 'fr';

// Parcourt le DOM et remplace le contenu de chaque élément [data-i18n]/[data-i18n-attr]
// par la traduction correspondante, puis prévient le reste de l'appli (hero cycle,
// contenu par défaut du terminal...) via l'évènement "langchange".
function applyTranslations(lang) {
  const dict = I18N[lang] || I18N.fr;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const val = dict[el.dataset.i18n];
    if (val !== undefined) el.innerHTML = val;
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      const val = dict[key];
      if (attr && val !== undefined) el.setAttribute(attr, val);
    });
  });
  document.documentElement.lang = lang;
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

async function loadSections() {
  const root = document.getElementById('app');
  for (const name of SECTIONS) {
    const res = await fetch(`sections/${name}.html`);
    const html = await res.text();
    const slot = document.createElement('div');
    slot.innerHTML = html;
    root.append(...slot.children);
  }
  initRevealObserver();
  initSkillFloaterObserver();
  initTerminal();
  initBackgroundGrid();
  initTabSpy();
  initRailOnDark();
  initBackToTop();
  initHeroCycle();
  initHeroTermGrow();
  initLangSwitch();
  initIdBadgeFlip();
  initAboutParallax();
  initScrollDownButton();
}


// Effet de parallax marqué : toute la section "à propos" (fond, vague, contenu) part de
// sa position normale (transform nul) puis remonte de plus en plus au fur et à mesure
// qu'elle traverse le viewport, en plus du scroll classique — purement visuel (transform),
// ne touche pas au flow du document. La position "naturelle" (offsetTop) sert de référence
// plutôt que getBoundingClientRect, qui inclurait déjà le transform qu'on est en train d'appliquer.
function initAboutParallax() {
  const about = document.getElementById('about');
  if (!about) return;
  // Les sections situées sous "à propos" suivent le même décalage, sinon le lift
  // creuserait un trou entre #about (qui remonte) et la section suivante (immobile).
  const followers = [];
  for (let el = about.nextElementSibling; el; el = el.nextElementSibling) {
    if (el.tagName === 'SECTION' || el.querySelector('section')) followers.push(el);
  }
  const MAX_LIFT = 220; // px
  // La dernière section remontée laisserait sinon apparaître le fond du body en bas de
  // page : on l'allonge d'autant pour que son bas reste collé à la fin du document.
  const last = followers[followers.length - 1];
  if (last) {
    const base = parseFloat(getComputedStyle(last).paddingBottom) || 0;
    last.style.paddingBottom = `${base + MAX_LIFT}px`;
  }
  let ticking = false;

  function naturalTop(el) {
    let top = 0;
    let node = el;
    while (node) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return top;
  }

  function update() {
    const viewportTop = naturalTop(about) - window.scrollY;
    const progress = Math.min(Math.max(1 - viewportTop / window.innerHeight, 0), 1);
    const lift = -progress * MAX_LIFT;
    const transform = `translateY(${lift}px)`;
    about.style.transform = transform;
    followers.forEach((el) => { el.style.transform = transform; });
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// La flèche du hero ne peut pas se contenter d'un lien #about classique : #about remonte
// au scroll (voir initAboutParallax), donc sa position réelle à l'écran change pendant
// le défilement lui-même. On recale donc le scroll image par image sur la position
// affichée (rect.top, qui inclut déjà le transform courant) jusqu'à ce qu'elle soit
// alignée en haut du viewport — ça converge naturellement avec le lift.
function initScrollDownButton() {
  const btn = document.querySelector('.scroll-down');
  const about = document.getElementById('about');
  if (!btn || !about) return;

  let rafId = null;
  function cancel() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  // Si l'utilisateur reprend la main pendant l'animation (molette, tactile, clavier),
  // on arrête tout de suite le recalage automatique pour ne pas lutter contre son geste.
  ['wheel', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, cancel, { passive: true });
  });

  const LANDING_OFFSET = 80; // px restants visibles du hero une fois arrivé

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    cancel();
    function step() {
      const remaining = about.getBoundingClientRect().top - LANDING_OFFSET;
      if (Math.abs(remaining) < 1) { rafId = null; return; }
      // On avance d'une fraction de la distance restante à chaque frame (vitesse de
      // scroll normale, avec décélération en fin de course), tout en se recalant en
      // continu sur la position affichée de #about. behavior:'instant' est obligatoire
      // ici : html{scroll-behavior:smooth} ferait sinon répéter/écraser une animation
      // CSS à chaque frame, ce qui rend le défilement très lent voire bloqué.
      window.scrollTo({ top: window.scrollY + remaining * 0.18, left: 0, behavior: 'instant' });
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  });
}

// Carte d'identité façon badge d'accès : cliquer n'importe où sur la carte (recto ou
// verso) bascule la classe is-flipped, qui pilote la rotation 3D en CSS — sauf sur les
// liens internes (GitHub, LinkedIn, CV, mailto), qui doivent garder leur comportement normal.
// is-flipping ne reste posée que le temps de la rotation, pour jouer l'ombre qui s'amplifie
// au milieu du mouvement (voir @keyframes about-card-flip-shadow) sans rester active après.
function initIdBadgeFlip() {
  const card = document.querySelector('.about-card');
  if (!card) return;
  const FLIP_DURATION = 700;
  let flipTimer = null;

  function flip() {
    card.classList.toggle('is-flipped');
    card.classList.remove('is-flipping');
    void card.offsetWidth; // force le redémarrage de l'animation si on enchaîne deux flips rapprochés
    card.classList.add('is-flipping');
    clearTimeout(flipTimer);
    flipTimer = setTimeout(() => card.classList.remove('is-flipping'), FLIP_DURATION);
  }

  // Retournement automatique : une seule fois, pour signaler que la carte est
  // cliquable. Dès qu'elle est visible à l'écran 5s sans interaction, elle se
  // retourne (recto → verso) puis revient vite (verso → recto), et ne se
  // déclenche plus jamais ensuite — ni en repassant dans le viewport, ni au clic.
  const AUTO_FLIP_DELAY = 5000;
  const AUTO_FLIP_RETURN_DELAY = 1200;
  let autoFlipTimer = null;
  let autoFlipActive = true;
  let autoFlipDone = false;

  function scheduleAutoFlip() {
    if (!autoFlipActive || autoFlipDone) return;
    clearTimeout(autoFlipTimer);
    autoFlipTimer = setTimeout(() => {
      if (!autoFlipActive || autoFlipDone) return;
      flip();
      autoFlipTimer = setTimeout(() => {
        if (!autoFlipActive) return;
        flip();
        autoFlipDone = true;
      }, AUTO_FLIP_RETURN_DELAY);
    }, AUTO_FLIP_DELAY);
  }

  function stopAutoFlip() {
    autoFlipActive = false;
    clearTimeout(autoFlipTimer);
  }

  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) scheduleAutoFlip();
      else clearTimeout(autoFlipTimer);
    });
  }, { threshold: .6 });
  visibilityObserver.observe(card);

  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    stopAutoFlip();
    flip();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    stopAutoFlip();
    flip();
  });
}

// Bascule FR/EN/ES du bouton drapeau en haut à droite — traduit tout le contenu
// statique du site (voir applyTranslations) ainsi que le terminal interactif.
// Toujours en français au chargement de la page.
function initLangSwitch() {
  const btn = document.querySelector('.lang-switch');
  if (!btn) return;

  const LANGS = ['fr', 'en', 'es'];
  const flags = {
    fr: btn.querySelector('.flag-fr'),
    en: btn.querySelector('.flag-en'),
    es: btn.querySelector('.flag-es'),
  };

  function apply(lang) {
    btn.dataset.lang = lang;
    LANGS.forEach((l) => { flags[l].classList.toggle('is-active', l === lang); });
    CURRENT_LANG = lang;
    applyTranslations(lang);
  }

  apply('fr');

  function updateAtTop() {
    btn.classList.toggle('is-at-top', window.scrollY <= 10);
  }
  updateAtTop();
  window.addEventListener('scroll', updateAtTop, { passive: true });

  btn.addEventListener('click', () => {
    const next = LANGS[(LANGS.indexOf(btn.dataset.lang) + 1) % LANGS.length];
    apply(next);
  });
}

// Le terminal du hero garde une taille fixe (plus de scroll-jacking ni de plein écran) :
// le contenu par défaut et le menu des catégories sont affichés en permanence.
function initHeroTermGrow() {
  const card = document.getElementById('term-card');
  const scrollDownBtn = document.querySelector('.scroll-down');
  const categories = document.getElementById('term-categories');
  if (!card) return;

  if (categories) categories.removeAttribute('aria-hidden');

  // La flèche se cache dès qu'on quitte le haut de page, comme un indicateur de
  // scroll classique.
  if (scrollDownBtn) {
    window.addEventListener('scroll', () => {
      scrollDownBtn.classList.toggle('is-hidden', window.scrollY > 10);
    }, { passive: true });
  }

  // Rond rouge façon macOS : clear (délégué à window.HeroTerminal, posé par initTerminal).
  const dotClose = document.getElementById('term-dot-close');
  if (dotClose) {
    dotClose.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.HeroTerminal && window.HeroTerminal.clear) window.HeroTerminal.clear();
    });
  }

  // Menu des catégories : cliquable directement, et sélectionnable en tapant son
  // numéro (1-5) dans le champ de saisie du terminal — voir TERM_COMMANDS plus bas,
  // qui relaie l'appel via window.HeroCategories.select().
  function selectCategory(key) {
    if (!categories) return false;
    const item = categories.querySelector(`.term-cat-item[data-cat="${key}"]`);
    if (!item) return false;
    categories.querySelectorAll('.term-cat-item').forEach((el) => el.classList.remove('is-selected'));
    item.classList.add('is-selected');
    const href = item.getAttribute('href');
    if (href) window.location.hash = href;
    return true;
  }
  if (categories) {
    categories.addEventListener('click', (e) => {
      const item = e.target.closest('.term-cat-item');
      if (!item) return;
      e.preventDefault();
      selectCategory(item.dataset.cat);
    });
  }

  function normalizeCatText(s) {
    return s.trim().toLowerCase().replace(/\/+$/, '');
  }

  // Permet de taper le nom complet d'une entrée ("01_à-propos/", "_projets" ou
  // "projets") plutôt que son seul numéro — lu directement sur le DOM pour suivre
  // la langue affichée (voir TERM_COMMANDS plus bas, qui relaie via runCommand).
  function matchCategoryByText(raw) {
    if (!categories) return null;
    const needle = normalizeCatText(raw);
    if (!needle) return null;
    const items = categories.querySelectorAll('.term-cat-item');
    for (const item of items) {
      const numEl = item.querySelector('.term-cat-num');
      const slugEl = item.querySelector('[data-i18n^="term-slug-"]');
      const num = numEl ? numEl.textContent : '';
      const slug = slugEl ? slugEl.textContent : '';
      const candidates = [
        normalizeCatText(num + slug),
        normalizeCatText(slug),
        normalizeCatText(slug.replace(/^_/, '')),
      ];
      if (candidates.includes(needle)) return item.dataset.cat;
    }
    return null;
  }

  // Noms complets affichés ("01_à-propos/"...), pour les proposer aussi via Tab
  // dans le terminal (voir initTerminal plus bas).
  function listCategoryNames() {
    if (!categories) return [];
    return Array.from(categories.querySelectorAll('.term-cat-item')).map((item) => {
      const numEl = item.querySelector('.term-cat-num');
      const slugEl = item.querySelector('[data-i18n^="term-slug-"]');
      return `${numEl ? numEl.textContent : ''}${slugEl ? slugEl.textContent : ''}`.trim();
    });
  }

  window.HeroCategories = {
    select: selectCategory,
    matchByText: matchCategoryByText,
    list: listCategoryNames,
  };
}

// Fait défiler le mot-clé du titre du Hero, puis s'arrête définitivement sur "protège".
function initHeroCycle() {
  const el = document.getElementById('cycle-word');
  const suffix = document.getElementById('cycle-suffix');
  if (!el) return;

  const HOLD_MS = 2200;
  const SWAP_MS = 350;
  let i = 0;
  let isFinal = false;

  function phrases() {
    return HERO_PHRASES[CURRENT_LANG] || HERO_PHRASES.fr;
  }

  el.textContent = phrases()[0];

  // Si la langue change en cours de cycle, on retraduit juste le mot actuellement
  // affiché (à la même position dans la nouvelle liste) sans relancer le minuteur.
  document.addEventListener('langchange', () => {
    el.textContent = isFinal ? phrases()[phrases().length - 1] : phrases()[i];
  });

  const timer = setInterval(() => {
    i += 1;
    el.classList.add('is-swapping');
    setTimeout(() => {
      el.textContent = phrases()[i];
      el.classList.remove('is-swapping');
      if (i === phrases().length - 1) {
        clearInterval(timer);
        isFinal = true;
        el.classList.add('is-final');
        if (suffix) suffix.remove();
      }
    }, SWAP_MS);
  }, HOLD_MS);
}

// Cache le bouton de défilement dès qu'on clique dessus ou qu'on scrolle.

// Surligne le point du rail correspondant à la section actuellement visible, et fait
// voyager l'indicateur le long du rail pour animer le passage d'une section à l'autre.
function initTabSpy() {
  const rail = document.querySelector('.dot-rail');
  const tabs = document.querySelectorAll('.dot-rail a[href^="#"]');
  const indicator = document.querySelector('.dot-rail-indicator');
  if (!rail || !tabs.length) return;
  const sectionToTab = new Map();
  tabs.forEach((tab) => {
    const section = document.getElementById(tab.getAttribute('href').slice(1));
    if (section) sectionToTab.set(section, tab);
  });

  const INDICATOR_TRAVEL_MS = 450;
  let activateTimer = null;

  function moveIndicatorTo(tab) {
    if (!indicator) return;
    const y = tab.offsetTop + tab.offsetHeight / 2;
    indicator.style.top = `${y}px`;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const tab = sectionToTab.get(entry.target);
      if (!tab) return;
      // l'indicateur part tout de suite, mais le label n'apparaît qu'une fois qu'il est arrivé
      clearTimeout(activateTimer);
      tabs.forEach((t) => t.classList.remove('is-active'));
      moveIndicatorTo(tab);
      activateTimer = setTimeout(() => tab.classList.add('is-active'), INDICATOR_TRAVEL_MS);
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sectionToTab.forEach((tab, section) => observer.observe(section));
  moveIndicatorTo(tabs[0]);
}

// Vrai si le point d'ordonnée y (proche du bord droit, là où vivent le rail et le bouton
// "remonter en haut") tombe sur la vague bleue de .section-divider-bar plutôt que sur le
// fond clair — cf. son clip-path : la vague va de 117px sous le haut de la section à
// (hauteur - 0.4*waveH).
function isOverAboutWave(about, y) {
  const rect = about.getBoundingClientRect();
  const waveH = parseFloat(getComputedStyle(about).paddingBottom) || 0;
  const top = rect.top + 117;
  const bottom = rect.top + rect.height - waveH * 0.4;
  return y > top && y < bottom;
}

// Bascule chaque point du rail sur des teintes claires quand la vague bleue passe sous lui,
// pour qu'il reste lisible (sinon ses points/labels gris se fondent dans le bleu). Chaque
// point est testé indépendamment : selon sa hauteur sur le rail, certains peuvent être sur
// la vague bleue pendant que d'autres n'y sont pas.
function initRailOnDark() {
  const rail = document.querySelector('.dot-rail');
  const indicator = document.querySelector('.dot-rail-indicator');
  const dots = document.querySelectorAll('.dot-rail a');
  const about = document.getElementById('about');
  if (!rail || !about || !dots.length) return;

  function update() {
    dots.forEach((dot) => {
      const r = dot.getBoundingClientRect();
      dot.classList.toggle('is-on-dark', isOverAboutWave(about, r.top + r.height / 2));
    });
    if (indicator) {
      const r = indicator.getBoundingClientRect();
      indicator.classList.toggle('is-on-dark', isOverAboutWave(about, r.top + r.height / 2));
    }
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

// Affiche le bouton "remonter en haut" dès qu'on a quitté le hero (et jusqu'en bas de page,
// quelle que soit la section affichée), et inverse ses couleurs (fond blanc/icône bleue) quand
// il se trouve sur la vague bleue, pour rester lisible dans les deux cas.
function initBackToTop() {
  const btn = document.querySelector('.back-to-top');
  const about = document.getElementById('about');
  const hero = document.getElementById('hero');
  if (!btn || !about || !hero) return;

  function update() {
    btn.classList.toggle('is-visible', window.scrollY > hero.offsetHeight * 0.5);
    const r = btn.getBoundingClientRect();
    btn.classList.toggle('is-on-dark', isOverAboutWave(about, r.top + r.height / 2));
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

// Anime les blocs .reveal lorsqu'ils entrent dans le viewport (motion discret, pas au chargement).
function initRevealObserver() {
  const targets = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  targets.forEach((el) => observer.observe(el));
}

// Contrairement à .reveal (qui ne joue qu'une fois), les icônes flottantes des piliers
// doivent réapparaître/disparaître à chaque passage dans le viewport : pas d'unobserve ici.
function initSkillFloaterObserver() {
  const targets = document.querySelectorAll('.skill-item');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle('icons-live', entry.isIntersecting);
    });
  }, { threshold: 0.15 });
  targets.forEach((el) => observer.observe(el));
}

// Donne accès au dictionnaire de la langue courante (voir i18n.js) pour le contenu
// généré par le terminal, qui n'est jamais dans le DOM tant qu'on ne tape pas la commande
// et ne peut donc pas être retraduit via applyTranslations comme le reste du site.
function termDict() {
  return TERM_I18N[CURRENT_LANG] || TERM_I18N.fr;
}

// Terminal interactif du Hero — commandes prédéfinies, "help" pour la liste. `desc` est un
// getter pour rester traduit même si la langue change après le chargement de la page ;
// `run` relit toujours termDict() au moment de l'exécution, pour la même raison.
const TERM_COMMANDS = {
  help: {
    get desc() { return termDict().help.desc; },
    run: () => Object.entries(TERM_COMMANDS)
      .filter(([, cmd]) => cmd.desc)
      .map(([name, cmd]) => `<span class="k">${name.padEnd(10, ' ')}</span>— ${cmd.desc}`),
  },
  clear: {
    get desc() { return termDict().clear.desc; },
    run: () => [],
  },
  whoami: {
    get desc() { return termDict().whoami.desc; },
    run: () => termDict().whoami.lines,
  },
  status: {
    get desc() { return termDict().status.desc; },
    run: () => termDict().status.lines,
  },
  about: {
    get desc() { return termDict().about.desc; },
    run: () => termDict().about.lines,
  },
  skills: {
    get desc() { return termDict().skills.desc; },
    run: () => termDict().skills.lines,
  },
  contact: {
    get desc() { return termDict().contact.desc; },
    run: () => termDict().contact.lines,
  },
  neofetch: {
    get desc() { return termDict().neofetch.desc; },
    run: () => termDict().neofetch.lines,
  },
  banner: {
    get desc() { return termDict().banner.desc; },
    run: () => termDict().banner.lines,
  },
};

TERM_COMMANDS.banner.runClass = 'ascii';
TERM_COMMANDS.neofetch.runClass = 'nf';
TERM_COMMANDS.neofetch.speed = 1;

// Easter eggs : sans `desc`, donc invisibles dans `help` (et dans le cycle Tab tant qu'on n'a
// pas déjà tapé leur début) — à découvrir en tapant la commande, comme un vrai easter egg.
TERM_COMMANDS.matrix = { desc: null, special: 'matrix' };
TERM_COMMANDS.crack = {
  desc: null,
  special: 'crack-start',
  run: () => termDict().crackIntro,
};
TERM_COMMANDS.hack = TERM_COMMANDS.crack; // alias caché, même mini-jeu

// Motifs de commandes "piégées" : pas de clé exacte dans TERM_COMMANDS (l'argument varie),
// on les teste donc par regex juste avant d'afficher "commande introuvable".
const TERM_EASTER_PATTERNS = [
  { re: /^sudo\b/i, run: () => termDict().easterSudo },
  { re: /^rm\s+-rf\s+\/?$/i, run: () => termDict().easterRm },
  { re: /^su(\s|$)/i, run: () => termDict().easterSu },
  { re: /^(ssh|nc|netcat)\b/i, run: () => termDict().easterSsh },
];

// Vraie commande, sans sortie : sert juste à "envoyer" `cd ~/hugo` au terminal dès que
// sa frappe simulée se termine (voir runAutoSequence), avant d'enchaîner sur la suite.
TERM_COMMANDS['cd ~/hugo'] = { desc: null, run: () => [] };

// Alias : "cat neofetch", comme si neofetch était un fichier d'identité posé dans le
// dossier ~/hugo (voir runAutoSequence) — même rendu, mais affiché depuis ce dossier
// (cwd) plutôt que depuis la racine. Pas de desc : reste caché du `help`, accessible
// seulement en le tapant ou via Tab.
TERM_COMMANDS['cat neofetch'] = {
  desc: null,
  cwd: '~/hugo',
  run: TERM_COMMANDS.neofetch.run,
  runClass: 'nf',
  speed: 1,
};

// Raccourcis numériques du menu ASCII des catégories (voir initHeroTermGrow) : tape
// 1-5 dans le terminal pour sélectionner la même entrée qu'au clic. Exclus de "help".
['1', '2', '3', '4', '5'].forEach((key) => {
  TERM_COMMANDS[key] = {
    desc: null,
    run: () => {
      const ok = window.HeroCategories && window.HeroCategories.select(key);
      return ok ? [] : ['rien à sélectionner ici.'];
    },
  };
});

function initTerminal() {
  const card = document.getElementById('term-card');
  const scrollEl = document.getElementById('term-output');
  const output = document.getElementById('term-output-typed');
  const input = document.getElementById('term-input');
  const cwdEl = document.getElementById('term-cwd');
  const hintEl = card.querySelector('.term-hint');
  const outputDefault = document.getElementById('term-output-default');
  const categoriesEl = document.getElementById('term-categories');
  if (!card || !scrollEl || !output || !input) return;

  const history = [];
  let historyIndex = -1;
  // état du mini-jeu caché "crack"/"hack" : tant qu'il est actif, toute saisie qui n'est pas
  // exit/quit est interprétée comme une tentative de code plutôt que comme une commande.
  let crackState = null;
  const CRACK_CWD = '~/pfsense';

  function generateCrackCode() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.slice(0, 4);
  }

  // Mastermind simplifié (digits uniques) : compte les chiffres bien placés ("bulls") et
  // ceux présents mais mal placés ("cows"), pour guider le joueur tentative après tentative.
  function handleCrackGuess(raw) {
    const guess = raw.trim();
    if (!/^\d{4}$/.test(guess) || new Set(guess).size !== 4) {
      return [termDict().crackInvalid];
    }
    const guessDigits = guess.split('').map(Number);
    crackState.attempts += 1;
    let bulls = 0;
    let cows = 0;
    guessDigits.forEach((d, i) => {
      if (d === crackState.code[i]) bulls += 1;
      else if (crackState.code.includes(d)) cows += 1;
    });
    if (bulls === 4) {
      const { attempts } = crackState;
      crackState = null;
      setCwd('~');
      return termDict().crackSuccess(attempts);
    }
    const lines = [termDict().crackProgress(bulls, cows, crackState.attempts)];
    // toutes les 3 tentatives ratées, on révèle un chiffre supplémentaire du code (dans
    // l'ordre des positions) pour éviter que le brute-force pur ne devienne décourageant.
    if (crackState.attempts % 3 === 0 && crackState.revealed.size < crackState.code.length) {
      let idx = 0;
      while (crackState.revealed.has(idx)) idx += 1;
      crackState.revealed.add(idx);
      lines.push(termDict().crackHint(idx + 1, crackState.code[idx]));
    }
    return lines;
  }

  // Pluie de caractères en surimpression de la sortie, qui passe par chacun des patterns
  // les uns après les autres, sans effet de transition entre eux (juste un changement net) —
  // annulée proprement si une autre commande arrive (voir `gen`).
  function runMatrixEasterEgg(gen) {
    const PATTERNS = ['rain', 'diagonal', 'pulse', 'tunnel', 'scan'];
    const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789';
    const fontSize = 14;
    const PATTERN_DURATION = 1400;

    if (hintEl) hintEl.style.display = 'none';

    const canvas = document.createElement('canvas');
    canvas.className = 'term-matrix-overlay';
    scrollEl.appendChild(canvas);
    canvas.width = scrollEl.clientWidth;
    canvas.height = scrollEl.clientHeight;
    const ctx = canvas.getContext('2d');

    const columns = Math.max(1, Math.floor(canvas.width / fontSize));
    const rows = Math.ceil(canvas.height / fontSize);
    const drops = new Array(columns).fill(0).map(() => Math.random() * -20);
    const diagDrops = new Array(columns).fill(0).map(() => Math.random() * -20);
    const pulsePhases = Array.from({ length: rows }, () => new Array(columns).fill(0).map(() => Math.random()));

    function drawRain() {
      ctx.fillStyle = 'rgba(13,17,15,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#7ee787';
      ctx.font = `${fontSize}px monospace`;
      drops.forEach((y, i) => {
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 1;
      });
    }

    function drawDiagonal() {
      ctx.fillStyle = 'rgba(13,17,15,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#7ee787';
      ctx.font = `${fontSize}px monospace`;
      diagDrops.forEach((y, i) => {
        const x = (i * fontSize + y * fontSize * 0.4) % canvas.width;
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.97) diagDrops[i] = 0;
        diagDrops[i] += 1;
      });
    }

    function drawPulse() {
      ctx.fillStyle = '#0d1110';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      pulsePhases.forEach((row, r) => {
        row.forEach((phase, c) => {
          const intensity = 0.15 + 0.55 * Math.abs(Math.sin(performance.now() / 400 + phase * 10));
          ctx.fillStyle = `rgba(126,231,135,${intensity})`;
          ctx.fillText(Math.random() > 0.5 ? '1' : '0', c * fontSize, r * fontSize);
        });
      });
    }

    // anneau de glyphes qui s'étend depuis le centre, comme un sonar qui plonge dans le code.
    function drawTunnel(patternStart) {
      ctx.fillStyle = '#0d1110';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = Math.hypot(cx, cy);
      const t = ((performance.now() - patternStart) % 1400) / 1400;
      const ringR = t * maxR;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          const x = c * fontSize;
          const y = r * fontSize;
          const diff = Math.abs(Math.hypot(x - cx, y - cy) - ringR);
          if (diff < fontSize * 2) {
            const intensity = 1 - diff / (fontSize * 2);
            ctx.fillStyle = `rgba(126,231,135,${0.2 + 0.7 * intensity})`;
            ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y);
          }
        }
      }
    }

    // ligne de scan qui balaye le bloc de haut en bas, façon analyse de code en cours.
    function drawScan(patternStart) {
      ctx.fillStyle = '#0d1110';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      const cycle = 1300;
      const t = ((performance.now() - patternStart) % cycle) / cycle;
      const scanY = t * canvas.height;
      for (let r = 0; r < rows; r += 1) {
        const y = r * fontSize;
        const intensity = Math.max(0.1, 1 - Math.abs(y - scanY) / 36);
        ctx.fillStyle = `rgba(126,231,135,${intensity})`;
        for (let c = 0; c < columns; c += 1) {
          if (Math.random() > 0.55) ctx.fillText(chars[Math.floor(Math.random() * chars.length)], c * fontSize, y);
        }
      }
    }

    const drawers = {
      rain: drawRain, diagonal: drawDiagonal, pulse: drawPulse, tunnel: drawTunnel, scan: drawScan,
    };

    function finish() {
      canvas.remove();
      if (hintEl) hintEl.style.display = '';
    }

    function playPattern(index) {
      if (gen !== typingGen) { finish(); return; }
      if (index >= PATTERNS.length) { finish(); return; }

      const draw = drawers[PATTERNS[index]] || drawRain;
      const patternStart = performance.now();

      function loop() {
        if (gen !== typingGen) { finish(); return; }
        draw(patternStart);
        if (performance.now() - patternStart < PATTERN_DURATION) {
          requestAnimationFrame(loop);
        } else {
          playPattern(index + 1);
        }
      }
      loop();
    }
    playPattern(0);
  }
  // dossier courant affiché devant le champ de saisie, persiste tant qu'on ne "ressort"
  // pas du plein écran (voir cancelAuto) — mis à jour quand `cd ~/hugo` est envoyé.
  function setCwd(dir) {
    if (cwdEl) cwdEl.textContent = dir;
  }
  // jeton de génération : incrémenté à chaque nouvelle commande (y compris `clear`) pour
  // pouvoir interrompre une frappe en cours — sinon les setTimeout d'un neofetch encore en
  // train de s'écrire continueraient à réinjecter des lignes après un clear déclenché entre-temps.
  let typingGen = 0;

  // Prompt façon shell : affiche le dossier courant avant le "$", pour les commandes
  // (comme `cat neofetch`) qui ont un `cwd` distinct de la racine ~ (voir TERM_COMMANDS).
  function promptHtml(cwd) {
    return `<span class="prompt-path">${cwd}</span><span class="prompt">$</span>`;
  }

  function printLine(html, extraClass) {
    const line = document.createElement('div');
    line.className = extraClass ? `l ${extraClass}` : 'l';
    line.innerHTML = html;
    output.appendChild(line);
    scrollEl.scrollTop = scrollEl.scrollHeight;
    return line;
  }

  // Découpe le HTML en tokens : une balise entière = un seul token, sinon un caractère.
  // Permet de "taper" du HTML coloré sans jamais couper une balise en deux.
  function tokenizeHtml(html) {
    return html.match(/<[^>]+>|[^<]/g) || [];
  }

  function typeLine(line, html, speed, gen, onDone) {
    const tokens = tokenizeHtml(html);
    let i = 0;
    function step() {
      if (gen !== typingGen) return; // une commande plus récente a pris le relais
      line.innerHTML = tokens.slice(0, i + 1).join('');
      scrollEl.scrollTop = scrollEl.scrollHeight;
      i += 1;
      if (i < tokens.length) {
        setTimeout(step, speed);
      } else if (onDone) {
        onDone();
      }
    }
    step();
  }

  // Tape une suite de lignes les unes après les autres, chacune attendant que la précédente soit finie.
  function typeLines(lines, extraClass, speed, gen) {
    let i = 0;
    function next() {
      if (gen !== typingGen || i >= lines.length) return;
      const line = printLine('', extraClass);
      typeLine(line, lines[i], speed, gen, () => {
        i += 1;
        next();
      });
    }
    next();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // `append` garde la sortie précédente au lieu de l'effacer — utilisé par
  // runAutoSequence pour que "cd ~/hugo" reste affiché quand la commande suivante s'exécute.
  function runCommand(raw, append) {
    const cmd = raw.trim();
    if (!cmd) return;

    typingGen += 1; // invalide toute frappe en cours d'une commande précédente
    const gen = typingGen;
    if (cmd.toLowerCase() === 'clear') {
      output.innerHTML = '';
      history.push(cmd);
      historyIndex = history.length;
      return;
    }
    if (!append) {
      output.innerHTML = '';
      if (outputDefault) outputDefault.remove();
      if (categoriesEl) categoriesEl.remove();
    }

    // mini-jeu "crack"/"hack" en cours : toute saisie hors exit/quit est une tentative de code.
    if (crackState) {
      printLine(`${promptHtml(CRACK_CWD)} ${escapeHtml(cmd)}`, 'cmd');
      history.push(cmd);
      historyIndex = history.length;
      if (['exit', 'quit'].includes(cmd.toLowerCase())) {
        crackState = null;
        setCwd('~');
        typeLines(termDict().crackAbandon, null, 4, gen);
      } else {
        typeLines(handleCrackGuess(cmd), null, 4, gen);
      }
      return;
    }

    const entry = TERM_COMMANDS[cmd.toLowerCase()];
    const cwd = entry && entry.cwd ? entry.cwd : '~';
    printLine(`${promptHtml(cwd)} ${escapeHtml(cmd)}`, 'cmd');
    history.push(cmd);
    historyIndex = history.length;

    // "cd ..." déplace le dossier affiché devant le champ de saisie pour la suite.
    if (entry && cmd.toLowerCase().startsWith('cd ')) {
      setCwd(cmd.slice(3).trim() || '~');
    }

    if (!entry) {
      const catKey = window.HeroCategories && window.HeroCategories.matchByText
        && window.HeroCategories.matchByText(cmd);
      if (catKey) {
        window.HeroCategories.select(catKey);
        return;
      }
      const easter = TERM_EASTER_PATTERNS.find((p) => p.re.test(cmd));
      if (easter) {
        typeLines(easter.run(), 'error', 4, gen);
        return;
      }
      typeLines([termDict().notFound(escapeHtml(cmd))], 'error', 4, gen);
      return;
    }

    if (entry.special === 'matrix') {
      runMatrixEasterEgg(gen);
      return;
    }
    if (entry.special === 'crack-start') {
      crackState = { code: generateCrackCode(), attempts: 0, revealed: new Set() };
      setCwd(CRACK_CWD);
      typeLines(entry.run(), null, 4, gen);
      return;
    }
    typeLines(entry.run(), entry.runClass || null, entry.speed || 4, gen);
  }

  const inputRow = input.closest('.term-input-row');
  function updateHasValue() {
    inputRow.classList.toggle('has-value', input.value.length > 0);
  }

  // Autocomplétion par Tab : cycle parmi les commandes qui commencent par ce qui a été tapé.
  let tabMatches = [];
  let tabIndex = -1;

  function resetTabCycle() {
    tabMatches = [];
    tabIndex = -1;
  }

  // Simule une frappe humaine dans le champ : caractère par caractère, à un rythme
  // irrégulier (pas un débit de robot), avec une petite pause avant le "Entrée" final.
  function typeIntoInput(text, gen, onDone) {
    let i = 0;
    function step() {
      if (gen !== typingGen) return; // une commande plus récente (ou une annulation) a pris le relais
      i += 1;
      input.value = text.slice(0, i);
      updateHasValue();
      if (i < text.length) {
        setTimeout(step, 55 + Math.random() * 70);
      } else {
        setTimeout(() => { if (gen === typingGen) onDone(); }, 280);
      }
    }
    step();
  }

  // Permet de piloter le terminal depuis l'extérieur (auto-démo neofetch quand le
  // terminal atteint sa taille max — voir initHeroTermGrow). `isAutoOutput` marque
  // cette séquence comme automatique, pour pouvoir l'annuler/l'effacer sans toucher
  // à une commande que l'utilisateur aurait tapée lui-même par-dessus.
  let isAutoOutput = false;
  // jeton dédié à la séquence (distinct de typingGen, que runCommand incrémente à
  // chaque commande) : permet d'enchaîner plusieurs runCommand sans que l'un invalide
  // la suite de la chaîne de setTimeout qui pilote la frappe simulée.
  let autoSeqId = 0;
  window.HeroTerminal = {
    isEmpty: () => output.children.length === 0,
    isAutoOutput: () => isAutoOutput,
    // Rond rouge de la barre du terminal : vide la sortie tapée, comme `clear`.
    clear: () => runCommand('clear'),
    // Tape chaque commande de `commands` dans le champ comme le ferait une vraie
    // personne, puis l'envoie réellement (echo immédiat) dès la frappe finie — chaque
    // commande s'ajoute à la suite de la précédente, sans effacer l'écran entre les deux.
    runAutoSequence: (commands) => {
      isAutoOutput = true;
      autoSeqId += 1;
      const seqId = autoSeqId;
      function typeAt(idx) {
        if (seqId !== autoSeqId) return;
        typingGen += 1;
        const charGen = typingGen;
        typeIntoInput(commands[idx], charGen, () => {
          if (seqId !== autoSeqId) return;
          input.value = '';
          updateHasValue();
          runCommand(commands[idx], idx > 0);
          if (idx < commands.length - 1) {
            setTimeout(() => { if (seqId === autoSeqId) typeAt(idx + 1); }, 450);
          }
        });
      }
      typeAt(0);
    },
    // Coupe net une séquence auto en cours (frappe ou sortie déjà affichée) et nettoie.
    cancelAuto: () => {
      autoSeqId += 1;
      typingGen += 1;
      isAutoOutput = false;
      crackState = null;
      input.value = '';
      updateHasValue();
      output.innerHTML = '';
      setCwd('~');
    },
  };

  // Démo passive dans le champ de saisie : tape "neofetch" lettre par lettre puis
  // l'efface, en boucle, tant que l'utilisateur n'a pas cliqué sur la console —
  // simple incitation visuelle, ne déclenche jamais la commande réellement.
  let idleActive = true;
  let idleGen = 0;
  const idleTextEl = document.getElementById('term-idle-text');

  function idleTypeText(text, gen, onDone) {
    let i = 0;
    function step() {
      if (gen !== idleGen) return;
      i += 1;
      if (idleTextEl) idleTextEl.textContent = text.slice(0, i);
      if (i < text.length) {
        setTimeout(step, 70 + Math.random() * 80);
      } else {
        onDone();
      }
    }
    step();
  }

  function idleEraseText(gen, onDone) {
    function step() {
      if (gen !== idleGen || !idleTextEl) return;
      idleTextEl.textContent = idleTextEl.textContent.slice(0, -1);
      if (idleTextEl.textContent.length > 0) {
        setTimeout(step, 35 + Math.random() * 35);
      } else {
        onDone();
      }
    }
    step();
  }

  function idleLoop() {
    if (!idleActive) return;
    const gen = idleGen;
    idleTypeText('neofetch', gen, () => {
      if (gen !== idleGen) return;
      setTimeout(() => {
        if (gen !== idleGen) return;
        idleEraseText(gen, () => {
          if (gen !== idleGen) return;
          setTimeout(() => { if (gen === idleGen) idleLoop(); }, 2200);
        });
      }, 900);
    });
  }

  function stopIdleTease() {
    if (!idleActive) return;
    idleActive = false;
    idleGen += 1;
    if (idleTextEl) idleTextEl.textContent = '';
    inputRow.classList.remove('is-idle');
  }

  inputRow.classList.add('is-idle');
  setTimeout(idleLoop, 1000);
  window.HeroTerminal.stopIdleTease = stopIdleTease;

  card.addEventListener('click', () => { stopIdleTease(); input.focus(); });
  input.addEventListener('focus', stopIdleTease);
  input.addEventListener('input', () => {
    resetTabCycle();
    updateHasValue();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      resetTabCycle();
      isAutoOutput = false;
      runCommand(input.value);
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      resetTabCycle();
      if (historyIndex > 0) historyIndex -= 1;
      input.value = history[historyIndex] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      resetTabCycle();
      if (historyIndex < history.length) historyIndex += 1;
      input.value = history[historyIndex] || '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (tabMatches.length === 0) {
        const base = input.value.trim().toLowerCase();
        const catNames = (window.HeroCategories && window.HeroCategories.list) ? window.HeroCategories.list() : [];
        // Tab à vide ne propose que les commandes "publiques" (avec desc) plus le
        // sommaire des catégories : les raccourcis cachés (1-5, matrix, crack...)
        // ne sortent que si on a déjà tapé le début de leur nom.
        tabMatches = base
          ? Object.keys(TERM_COMMANDS).concat(catNames).filter((name) => name.toLowerCase().startsWith(base))
          : Object.keys(TERM_COMMANDS).filter((name) => TERM_COMMANDS[name].desc != null).concat(catNames);
        if (tabMatches.length === 0) return;
        tabIndex = 0;
      } else {
        tabIndex = (tabIndex + 1) % tabMatches.length;
      }
      input.value = tabMatches[tabIndex];
    }
    updateHasValue();
  });
}

loadSections();

// Grille de points en fond du hero, qui réagit à la position de la souris (effet magnétique discret).
function initBackgroundGrid() {
  const canvas = document.getElementById('bg-grid');
  const container = canvas ? canvas.closest('.hero') : null;
  const copy = container ? container.querySelector('.hero-copy') : null;
  const navRail = document.querySelector('.dot-rail');
  if (!canvas || !container) return;
  const ctx = canvas.getContext('2d');

  const SPACING = 32;
  const BASE_RADIUS = 1.2;
  const REACT_RADIUS = 140;
  const MAX_OFFSET = 10;
  const MAX_SCALE = 2.4;
  const FEATHER_IN = 40;
  const FEATHER_OUT = 90;
  const MIN_ALPHA = 0.04;
  const ROUND_RADIUS = 10;
  const EXCLUSION_SELECTOR = 'h1, .lede, .btn, .social-row a';
  // déborde sous le hero pour que la grille continue derrière le bord diagonal de la section
  // "about" (.section-divider-bar), au lieu de s'arrêter pile au bas du hero.
  const EXTRA_BELOW = 140;
  const BASE_COLOR = '37,70,200';

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let points = [];
  let exclusionRects = [];
  const mouse = { x: -9999, y: -9999, active: false };

  function smoothstep(edge0, edge1, value) {
    const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
  }

  // Distance signée à un rectangle à coins arrondis (SDF) — négative à l'intérieur, 0 sur le bord, positive à l'extérieur.
  function distToRoundedRect(px, py, rect, radius) {
    const halfW = (rect.right - rect.left) / 2;
    const halfH = (rect.bottom - rect.top) / 2;
    const r = Math.min(radius, halfW, halfH);
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const dx = Math.abs(px - cx) - (halfW - r);
    const dy = Math.abs(py - cy) - (halfH - r);
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
  }

  // Récupère un rectangle par ligne visuelle (pas un seul bloc englobant tout un paragraphe multi-lignes).
  function getLineRects(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    return Array.from(range.getClientRects());
  }

  function updateExclusionRect() {
    exclusionRects = [];
    const containerRect = container.getBoundingClientRect();
    const pad = 3;
    if (copy) {
      copy.querySelectorAll(EXCLUSION_SELECTOR).forEach((el) => {
        getLineRects(el).forEach((r) => {
          if (r.width < 1 || r.height < 1) return;
          exclusionRects.push({
            left: r.left - containerRect.left - pad,
            top: r.top - containerRect.top - pad,
            right: r.right - containerRect.left + pad,
            bottom: r.bottom - containerRect.top + pad,
          });
        });
      });
    }
    // le rail de nav est fixed (sa position relative au hero bouge au scroll) : on
    // l'exclut en plus du texte, pour qu'il bénéficie du même halo feathered que le h1.
    if (navRail) {
      const r = navRail.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) {
        exclusionRects.push({
          left: r.left - containerRect.left - pad,
          top: r.top - containerRect.top - pad,
          right: r.right - containerRect.left + pad,
          bottom: r.bottom - containerRect.top + pad,
        });
      }
    }
  }

  function buildPoints() {
    points = [];
    for (let y = SPACING / 2; y < height; y += SPACING) {
      for (let x = SPACING / 2; x < width; x += SPACING) {
        points.push({ x, y, rgb: BASE_COLOR });
      }
    }
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height + EXTRA_BELOW;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPoints();
    updateExclusionRect();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (const p of points) {
      let alpha = 1;
      if (exclusionRects.length) {
        let minDist = Infinity;
        for (const rect of exclusionRects) {
          const dist = distToRoundedRect(p.x, p.y, rect, ROUND_RADIUS);
          if (dist < minDist) minDist = dist;
        }
        alpha = MIN_ALPHA + (1 - MIN_ALPHA) * smoothstep(-FEATHER_IN, FEATHER_OUT, minDist);
      }
      if (alpha <= 0.01) continue;

      let dx = 0;
      let dy = 0;
      let scale = 1;

      if (mouse.active) {
        const distX = p.x - mouse.x;
        const distY = p.y - mouse.y;
        const dist = Math.hypot(distX, distY);
        if (dist < REACT_RADIUS) {
          const force = 1 - dist / REACT_RADIUS;
          const angle = Math.atan2(distY, distX);
          dx = Math.cos(angle) * force * MAX_OFFSET;
          dy = Math.sin(angle) * force * MAX_OFFSET;
          scale = 1 + force * (MAX_SCALE - 1);
        }
      }

      const r = BASE_RADIUS * scale;
      const fill = `rgba(${p.rgb},${0.6 * alpha})`;

      ctx.beginPath();
      ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  let lastClientX = -9999;
  let lastClientY = -9999;

  function updateMouseFromClient() {
    const rect = container.getBoundingClientRect();
    mouse.x = lastClientX - rect.left;
    mouse.y = lastClientY - rect.top;
  }

  // Écoute sur window (et non sur .hero) pour rester réactif même quand le curseur quitte
  // brièvement la zone ; les coords sont reconverties en repère local via updateMouseFromClient.
  window.addEventListener('mousemove', (e) => {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    updateMouseFromClient();
    mouse.active = true;
  }, { passive: true });
  document.addEventListener('mouseleave', () => {
    mouse.active = false;
  });
  window.addEventListener('scroll', () => {
    if (mouse.active) updateMouseFromClient();
    if (navRail) updateExclusionRect();
  }, { passive: true });
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize);
  }

  resize();
  draw();
}
