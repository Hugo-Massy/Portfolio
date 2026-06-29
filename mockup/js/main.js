// Charge chaque section depuis sections/*.html et l'injecte dans son placeholder.
const SECTIONS = ['nav', 'hero'];

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
  initTerminal();
  initBackgroundGrid();
  initTabSpy();
  initHeroCycle();
  initHeroTermGrow();
}

// La page ne fait jamais plus de 100vh (pas de vrai scroll de document) : la croissance
// de la console est donc pilotée directement par la molette/le tactile (scroll-jacking),
// avec un "progress" virtuel 0→1 qu'on anime à la main plutôt que de lire window.scrollY.
function initHeroTermGrow() {
  const card = document.getElementById('term-card');
  const copy = document.querySelector('.hero-copy');
  const scrollDownBtn = document.querySelector('.scroll-down');
  const categories = document.getElementById('term-categories');
  const outputDefault = document.getElementById('term-output-default');
  if (!card) return;

  const grid = card.parentNode;
  let initRect = null;
  let progress = 0;
  let targetProgress = 0;
  // neofetch s'affiche tout seul une fois le terminal arrivé à sa taille max et resté
  // stable 1 s ; le timer est annulé si l'utilisateur ressort du plein écran avant.
  let neofetchShown = false;
  let neofetchTimer = null;
  // un ancêtre (.reveal.is-visible) porte un transform, qui re-ancre tout descendant
  // position:fixed à sa propre boîte au lieu du viewport ; on échappe donc vers
  // document.body pendant la croissance pour que le fixed reste bien collé à l'écran.
  let inBody = false;

  function captureInitRect() {
    initRect = card.getBoundingClientRect();
  }
  captureInitRect();

  // Efface le contenu par défaut comme une frappe inversée : on tronque chaque ligne à
  // un nombre de caractères restants qui diminue avec le scroll, en partant de la fin.
  const lines = outputDefault
    ? Array.from(outputDefault.querySelectorAll('.l')).map((el) => ({
        el, html: el.innerHTML, length: el.textContent.length,
      }))
    : [];
  const totalChars = lines.reduce((sum, l) => sum + l.length, 0);

  function truncateToChars(container, maxChars) {
    let remaining = maxChars;
    function walk(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (remaining <= 0) { node.removeChild(child); return; }
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.data.length > remaining) child.data = child.data.slice(0, remaining);
          remaining -= Math.min(child.data.length, remaining);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    }
    walk(container);
  }

  function renderErase() {
    if (!lines.length) return;
    const visibleTotal = Math.round(totalChars * Math.min(Math.max(1 - progress / 0.7, 0), 1));
    let cumulative = 0;
    lines.forEach((line) => {
      const lineVisible = Math.min(Math.max(visibleTotal - cumulative, 0), line.length);
      if (lineVisible >= line.length) {
        line.el.style.display = '';
        if (line.el.innerHTML !== line.html) line.el.innerHTML = line.html;
      } else if (lineVisible <= 0) {
        line.el.style.display = 'none';
      } else {
        line.el.style.display = '';
        line.el.innerHTML = line.html;
        truncateToChars(line.el, lineVisible);
      }
      cumulative += line.length;
    });
  }

  // Tape l'aperçu des catégories caractère par caractère entre 70% et 100% du scroll,
  // comme si on le saisissait au clavier (avec un curseur clignotant pendant la frappe).
  const catHTML = categories ? categories.innerHTML : '';
  const catTotalChars = categories ? categories.textContent.length : 0;

  function renderTypeCategories() {
    if (!categories) return;
    const t = Math.min(Math.max((progress - 0.7) / 0.3, 0), 1);
    const visibleChars = Math.round(catTotalChars * t);
    categories.innerHTML = catHTML;
    truncateToChars(categories, visibleChars);
    if (t > 0 && t < 1) {
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      categories.appendChild(cursor);
    }
  }

  function render() {
    if (progress <= 0) {
      if (inBody) { grid.appendChild(card); inBody = false; }
      card.style.position = '';
      card.style.top = card.style.left = card.style.width = card.style.height = '';
      captureInitRect();
    } else {
      if (!inBody) { document.body.appendChild(card); inBody = true; }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const targetW = vw * 0.80;
      const targetH = vh * 0.7;
      const targetTop = (vh - targetH) / 2;
      const targetLeft = (vw - targetW) / 2;
      const r = initRect;
      card.style.position = 'fixed';
      card.style.top = `${r.top + (targetTop - r.top) * progress}px`;
      card.style.left = `${r.left + (targetLeft - r.left) * progress}px`;
      card.style.width = `${r.width + (targetW - r.width) * progress}px`;
      card.style.height = `${r.height + (targetH - r.height) * progress}px`;
    }

    if (copy) {
      copy.style.pointerEvents = progress > 0.05 ? 'none' : 'auto';
    }
    if (scrollDownBtn) scrollDownBtn.classList.toggle('is-hidden', progress > 0.05);
    // le contenu par défaut s'efface entre 0 et 70% du scroll, puis l'ASCII des
    // catégories se tape progressivement entre 70% et 100%.
    renderErase();
    renderTypeCategories();

    // arrivé en plein écran : on lance un compte à rebours de 1 s avant d'afficher
    // neofetch ; toute sortie de l'état plein écran annule le timer.
    if (progress > 0.995) {
      if (!neofetchShown && !neofetchTimer) {
        neofetchTimer = setTimeout(() => {
          neofetchTimer = null;
          neofetchShown = true;
          if (window.HeroTerminal && window.HeroTerminal.isEmpty()) {
            window.HeroTerminal.runAutoSequence(['cd ~/hugo', 'cat neofetch']);
          }
        }, 500);
      }
    } else {
      if (neofetchTimer) {
        clearTimeout(neofetchTimer);
        neofetchTimer = null;
      }
      // on quitte le plein écran : on efface neofetch (s'il s'agit bien de lui, et pas
      // d'une commande tapée entre-temps par l'utilisateur) pour qu'il puisse se
      // réafficher proprement la prochaine fois qu'on revient en plein écran.
      if (neofetchShown) {
        neofetchShown = false;
        if (window.HeroTerminal && window.HeroTerminal.isAutoOutput()) {
          window.HeroTerminal.cancelAuto();
        }
      }
    }
  }

  const TRAVEL_PX = 700; // quantité de molette pour parcourir 0 → 1
  const EASE = 0.35; // facteur de lissage : plus petit = plus fluide/inertiel
  let looping = false;

  function loop() {
    const diff = targetProgress - progress;
    if (Math.abs(diff) < 0.001) {
      progress = targetProgress;
      render();
      looping = false;
      return;
    }
    progress += diff * EASE;
    render();
    requestAnimationFrame(loop);
  }

  function setTargetProgress(next) {
    targetProgress = Math.min(Math.max(next, 0), 1);
    if (!looping) {
      looping = true;
      requestAnimationFrame(loop);
    }
  }

  window.addEventListener('wheel', (e) => {
    if (targetProgress <= 0 && e.deltaY < 0) return; // déjà au repos, on laisse remonter normalement
    e.preventDefault();
    setTargetProgress(targetProgress + e.deltaY / TRAVEL_PX);
  }, { passive: false });

  let touchY = null;
  window.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (touchY === null) return;
    const dy = touchY - e.touches[0].clientY;
    if (targetProgress <= 0 && dy < 0) { touchY = e.touches[0].clientY; return; }
    e.preventDefault();
    setTargetProgress(targetProgress + dy / TRAVEL_PX);
    touchY = e.touches[0].clientY;
  }, { passive: false });

  if (scrollDownBtn) {
    scrollDownBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setTargetProgress(1);
    });
  }

  // Menu des catégories : cliquable directement, et sélectionnable en tapant son
  // numéro (1-5) dans le champ de saisie du terminal — voir TERM_COMMANDS plus bas,
  // qui relaie l'appel via window.HeroCategories.select(). Délégation sur le
  // conteneur stable : renderTypeCategories() réécrit innerHTML à chaque frame pour
  // la troncature, donc les <a> sont recréés en permanence et ne peuvent pas garder
  // d'écouteur attaché directement.
  function selectCategory(key) {
    if (!categories) return false;
    const item = categories.querySelector(`.term-cat-item[data-cat="${key}"]`);
    if (!item) return false;
    categories.querySelectorAll('.term-cat-item').forEach((el) => el.classList.remove('is-selected'));
    item.classList.add('is-selected');
    const href = item.getAttribute('href');
    if (href) window.location.hash = href;
    setTargetProgress(0);
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
  window.HeroCategories = { select: selectCategory };

  window.addEventListener('resize', () => {
    if (!inBody) captureInitRect();
    render();
  });

  render();
}

// Fait défiler le mot-clé du titre du Hero, puis s'arrête définitivement sur "protège".
function initHeroCycle() {
  const el = document.getElementById('cycle-word');
  const suffix = document.getElementById('cycle-suffix');
  if (!el) return;

  const PHRASES = [
    'consolide',
    'assure',
    'enrichie',
    'renforce',
    'solidifie',
    'muscle',
    'raffermit',
    'protège',
  ];
  const HOLD_MS = 2200;
  const SWAP_MS = 350;
  let i = 0;

  const timer = setInterval(() => {
    i += 1;
    el.classList.add('is-swapping');
    setTimeout(() => {
      el.textContent = PHRASES[i];
      el.classList.remove('is-swapping');
      if (i === PHRASES.length - 1) {
        clearInterval(timer);
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

// Terminal interactif du Hero — commandes prédéfinies, "help" pour la liste.
const TERM_COMMANDS = {
  help: {
    desc: 'liste des commandes disponibles',
    run: () => Object.entries(TERM_COMMANDS)
      .filter(([, cmd]) => cmd.desc)
      .map(([name, cmd]) => `<span class="k">${name.padEnd(10, ' ')}</span>— ${cmd.desc}`),
  },
  clear: {
    desc: 'vide le terminal',
    run: () => [],
  },
  whoami: {
    desc: 'stack technique actuelle',
    run: () => [
      '<span class="k">systèmes</span><span class="sep">:</span> Active Directory, Entra ID, Windows Server, Debian, GPO',
      '<span class="k">réseau</span><span class="sep">:</span> VLAN/VLSM, pfSense, IPsec VPN, routage',
      '<span class="k">cloud</span><span class="sep">:</span> Docker, GitHub Actions, OVH VPS, Vault, CI/CD',
      '<span class="k">sécu</span><span class="sep">:</span> SOC/Blue Team, Wazuh, Suricata, T-Pot, CERT-FR/CVE, IAM/RBAC',
      '<span class="k">dev</span><span class="sep">:</span> FastAPI, React/TypeScript, PostgreSQL, Redis, Python',
    ],
  },
  status: {
    desc: 'disponibilité pour une alternance',
    run: () => [
      '→ disponible pour une alternance Mastère (2 ans) dès sept. 2026 <svg class="ok-mark" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
      'Poste recherché : Administrateur Systèmes &amp; Réseaux / Cloud.',
    ],
  },
  about: {
    desc: 'qui je suis, en une ligne',
    run: () => [
      'Hugo Menu — Mastère Cybersécurité &amp; Ethical Hacking (EFREI Panthéon-Assas).',
      'Alternant DSI Mairie de Massy : AD/Entra ID, parc de 130+ applications, veille CVE quotidienne.',
      'À la croisée de l\'infra, du cloud et de la sécurité — avec une vraie culture du logiciel libre',
      'et de la souveraineté numérique (OVH, Mistral AI), forgée dans les contraintes du secteur public.',
    ],
  },
  skills: {
    desc: 'compétences clés',
    run: () => [
      '<span class="k">systèmes</span><span class="sep">:</span> AD, Entra ID, Windows Server, Debian/Linux, GPO',
      '<span class="k">réseau</span><span class="sep">:</span> VLAN/VLSM, pfSense, IPsec VPN, pare-feu',
      '<span class="k">cloud</span><span class="sep">:</span> Docker, GitHub Actions, OVH VPS, HashiCorp Vault, CI/CD',
      '<span class="k">sécurité</span><span class="sep">:</span> SOC/Blue Team, Wazuh, Suricata, T-Pot, CERT-FR/CVE, IAM/RBAC',
      '<span class="k">dev</span><span class="sep">:</span> FastAPI, React/TypeScript, PostgreSQL, Redis, Python',
      'Détail complet et preuves à l\'appui dans la section <span class="k">#skills</span>.',
    ],
  },
  projects: {
    desc: 'projets phares',
    run: () => [
      '<span class="k">Massy Innove</span> — plateforme IA interne 100% souveraine (FastAPI/React, Argon2id,',
      '  rate limiting, IDS Suricata, routage multi-modèles Mistral AI).',
      '<span class="k">Fil Rouge SOC</span> — SOC complet (Wazuh 4.7, Suricata, T-Pot) avec DAT, plan de',
      '  sauvegarde et analyse d\'amélioration, pour la certification RNCP.',
      '<span class="k">Homelab perso</span> — Debian 12, Nextcloud via Cloudflare Tunnel, supervision',
      '  Zabbix 7.2, zéro port ouvert sur le LAN.',
      '<span class="k">Plugins GLPI</span> — Pretaporter (signature électronique) &amp; Import SIM,',
      '  process papier supprimé à la DSI de Massy.',
      'Repos, démos et détails dans la section <span class="k">#projects</span>.',
    ],
  },
  contact: {
    desc: 'comment me contacter',
    run: () => [
      '<span class="k">email</span><span class="sep">:</span> contact@hugomenu.dev',
      '<span class="k">linkedin</span><span class="sep">:</span> linkedin.com/in/hugomenu',
      '<span class="k">github</span><span class="sep">:</span> github.com/hugomenu',
      'Réponse sous 24h — parlons de votre besoin.',
    ],
  },
  neofetch: {
    desc: 'carte d\'identité système',
    run: () => [
      '<span class="nf-k">OS:</span> Mastère Cybersécurité &amp; Ethical Hacking',
      '<span class="nf-k">Host:</span> EFREI · Panthéon-Assas',
      '<span class="nf-k">Role:</span> Alternant DSI — Mairie de Massy',
      '<span class="nf-k">Uptime:</span> 2 ans en production',
      '<span class="nf-k">Stack:</span> AD · Entra ID · pfSense · Docker · Wazuh',
      '<span class="nf-k">Locale:</span> fr_FR · en_US · Île-de-France',
      '<span class="nf-k">Focus:</span> SOC / Blue Team · IAM · souveraineté num.',
      '<span class="nf-k">Status:</span> dispo alternance — sept. 2026',
    ],
  },
  banner: {
    desc: 'petit dessin ASCII',
    run: () => [
      '      ╔═══╗',
      '     ╔╝▓▓▓╚╗',
      '     ║▓▓▓▓▓║',
      '     ║▓ ✓ ▓║',
      '     ╚╗▓▓▓╔╝',
      '      ╚═╦═╝',
      '        ║',
      '  [ HM — SECURED ]',
    ],
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
  run: () => [
    'lancement de <span class="k">crack-fw.sh</span> — bypass du portail captif pfSense...',
    'code d\'accès à 4 chiffres uniques détecté sur l\'interface WAN.',
    'tape une combinaison de 4 chiffres pour tenter ta chance — <span class="k">exit</span> pour abandonner.',
  ],
};
TERM_COMMANDS.hack = TERM_COMMANDS.crack; // alias caché, même mini-jeu

// Motifs de commandes "piégées" : pas de clé exacte dans TERM_COMMANDS (l'argument varie),
// on les teste donc par regex juste avant d'afficher "commande introuvable".
const TERM_EASTER_PATTERNS = [
  {
    re: /^sudo\b/i,
    run: () => [
      '<span class="error">[sudo] mot de passe pour hugo :</span> ********',
      'Permission denied (publickey,password). Ce terminal n\'a pas de root —',
      'tape <span class="k">contact</span> si tu veux les vraies clés d\'accès.',
    ],
  },
  {
    re: /^rm\s+-rf\s+\/?$/i,
    run: () => [
      'nice try.',
      'aucune action effectuée — ce terminal n\'a pas de vrai shell, et moi je fais des sauvegardes.',
    ],
  },
  {
    re: /^su(\s|$)/i,
    run: () => ['tu es déjà l\'utilisateur le plus permissif possible ici : invité.'],
  },
  {
    re: /^(ssh|nc|netcat)\b/i,
    run: () => ['connexion refusée — il n\'y a pas de serveur à pirater ici, juste un site web.'],
  },
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
      return ['format invalide — attends 4 chiffres uniques (ex: 1709).'];
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
      return [
        `accès au pare-feu accordé en ${attempts} tentative${attempts > 1 ? 's' : ''}. <span class="ok-mark">✓</span>`,
        'bypass réussi — un code à 4 chiffres se devine toujours, en vrai vie comme ici.',
        'change tes mots de passe par défaut, n\'en réutilise jamais un d\'un service à l\'autre,',
        'et préfère une phrase de passe longue et unique (ou un gestionnaire de mots de passe).',
      ];
    }
    const lines = [`${bulls} bien placé(s), ${cows} présent(s) mais mal placé(s) — tentative #${crackState.attempts}.`];
    // toutes les 3 tentatives ratées, on révèle un chiffre supplémentaire du code (dans
    // l'ordre des positions) pour éviter que le brute-force pur ne devienne décourageant.
    if (crackState.attempts % 3 === 0 && crackState.revealed.size < crackState.code.length) {
      let idx = 0;
      while (crackState.revealed.has(idx)) idx += 1;
      crackState.revealed.add(idx);
      lines.push(`indice : le chiffre en position ${idx + 1} est <span class="k">${crackState.code[idx]}</span>.`);
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
    }

    // mini-jeu "crack"/"hack" en cours : toute saisie hors exit/quit est une tentative de code.
    if (crackState) {
      printLine(`${promptHtml(CRACK_CWD)} ${escapeHtml(cmd)}`, 'cmd');
      history.push(cmd);
      historyIndex = history.length;
      if (['exit', 'quit'].includes(cmd.toLowerCase())) {
        crackState = null;
        setCwd('~');
        typeLines(['abandon. le pare-feu reste debout (pour l\'instant).'], null, 4, gen);
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
      const easter = TERM_EASTER_PATTERNS.find((p) => p.re.test(cmd));
      if (easter) {
        typeLines(easter.run(), 'error', 4, gen);
        return;
      }
      typeLines([`commande introuvable : ${escapeHtml(cmd)} — tape <span class="k">help</span> pour la liste.`], 'error', 4, gen);
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
        tabMatches = base
          ? Object.keys(TERM_COMMANDS).filter((name) => name.startsWith(base))
          : Object.keys(TERM_COMMANDS);
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
  if (!canvas || !container) return;
  const ctx = canvas.getContext('2d');

  // Canvas secondaire qui prolonge la même grille de points dans la zone creusée de la vague (dans
  // #about, qui remonte par-dessus le bas du hero). Il partage la grille et la réactivité souris du
  // canvas du hero : on dessine les MÊMES points, simplement décalés de waveOffsetY (distance
  // verticale entre le haut de ce canvas et le haut du hero) — donc rendu rigoureusement identique.
  const waveCanvas = document.getElementById('bg-grid-wave');
  const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;
  let waveW = 0;
  let waveH = 0;
  let waveOffsetY = 0;

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
    if (!copy) return;
    const containerRect = container.getBoundingClientRect();
    const pad = 3;
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

  function buildPoints() {
    points = [];
    for (let y = SPACING / 2; y < height; y += SPACING) {
      for (let x = SPACING / 2; x < width; x += SPACING) {
        points.push({ x, y });
      }
    }
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPoints();
    updateExclusionRect();

    if (waveCanvas) {
      const wrect = waveCanvas.getBoundingClientRect();
      waveW = wrect.width;
      waveH = wrect.height;
      // décalage vertical entre le haut du canvas de vague et le haut du hero : permet de réutiliser
      // les mêmes points (coordonnées locales au hero) en les translatant pour ce canvas.
      waveOffsetY = wrect.top - rect.top;
      waveCanvas.width = waveW * dpr;
      waveCanvas.height = waveH * dpr;
      waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (waveCtx) waveCtx.clearRect(0, 0, waveW, waveH);

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
      const fill = `rgba(77,111,203,${0.45 * alpha})`;

      ctx.beginPath();
      ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      // même point reporté dans le canvas de la vague (coords locales = coords hero - waveOffsetY) ;
      // on ne dessine que ce qui tombe dans sa boîte (le clip-path CSS masque ensuite sous la courbe).
      if (waveCtx) {
        const wy = p.y + dy - waveOffsetY;
        if (wy > -2 && wy < waveH + 2) {
          waveCtx.beginPath();
          waveCtx.arc(p.x + dx, wy, r, 0, Math.PI * 2);
          waveCtx.fillStyle = fill;
          waveCtx.fill();
        }
      }
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

  // Écoute sur window (et non sur .hero) : la zone de la vague est visuellement #about, posée
  // par-dessus le bas du hero, donc un listener sur .hero ne se déclencherait pas quand le curseur
  // y passe. Les coords restent locales au hero (via updateMouseFromClient) pour que les deux canvas
  // partagent le même repère.
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
  }, { passive: true });
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize);
  }

  resize();
  draw();
}
