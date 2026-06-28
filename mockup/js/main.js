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
  initScrollDownHide();
  initHeroCycle();
  initHeroTermGrow();
}

// Au scroll dans le hero, la console grossit progressivement jusqu'à occuper 95% de
// l'écran (overlay recentré) tandis que le texte du hero s'efface ; une fois pleinement
// grossie, elle est déplacée dans #term-landing pour redevenir un élément de flux normal
// qui défile avec la page.
function initHeroTermGrow() {
  const hero = document.getElementById('hero');
  const card = document.getElementById('term-card');
  const copy = document.querySelector('.hero-copy');
  const landing = document.getElementById('term-landing');
  if (!hero || !card || !landing) return;

  const grid = card.parentNode;
  let initRect = null;
  let isLanded = false;

  function captureInitRect() {
    initRect = card.getBoundingClientRect();
  }

  function update() {
    const heroHeight = hero.offsetHeight;
    const progress = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targetW = vw * 0.95;
    const targetH = vh * 0.95;
    const targetTop = (vh - targetH) / 2;
    const targetLeft = (vw - targetW) / 2;

    if (progress >= 1) {
      if (!isLanded) {
        landing.appendChild(card);
        isLanded = true;
      }
      landing.style.height = `${vh}px`;
      card.style.position = 'absolute';
      card.style.top = `${targetTop}px`;
      card.style.left = `${targetLeft}px`;
      card.style.width = `${targetW}px`;
      card.style.height = `${targetH}px`;
    } else {
      if (isLanded) {
        grid.appendChild(card);
        isLanded = false;
      }
      landing.style.height = '0px';

      if (progress <= 0) {
        card.style.position = '';
        card.style.top = card.style.left = card.style.width = card.style.height = '';
        captureInitRect();
      } else {
        if (!initRect) captureInitRect();
        const r = initRect;
        card.style.position = 'fixed';
        card.style.top = `${r.top + (targetTop - r.top) * progress}px`;
        card.style.left = `${r.left + (targetLeft - r.left) * progress}px`;
        card.style.width = `${r.width + (targetW - r.width) * progress}px`;
        card.style.height = `${r.height + (targetH - r.height) * progress}px`;
      }
    }

    if (copy) {
      copy.style.opacity = String(1 - progress);
      copy.style.pointerEvents = progress > 0.05 ? 'none' : 'auto';
    }
  }

  captureInitRect();

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!isLanded && card.style.position !== 'fixed') captureInitRect();
    update();
  });

  update();
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
function initScrollDownHide() {
  const btn = document.querySelector('.scroll-down');
  if (!btn) return;

  btn.addEventListener('click', () => btn.classList.add('is-hidden'));
  window.addEventListener('scroll', () => {
    btn.classList.toggle('is-hidden', window.scrollY > 4);
  }, { passive: true });
}

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
    run: () => Object.entries(TERM_COMMANDS).map(
      ([name, cmd]) => `<span class="k">${name.padEnd(10, ' ')}</span>— ${cmd.desc}`
    ),
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
};

function initTerminal() {
  const card = document.getElementById('term-card');
  const output = document.getElementById('term-output');
  const input = document.getElementById('term-input');
  if (!card || !output || !input) return;

  const history = [];
  let historyIndex = -1;

  function printLine(html, extraClass) {
    const line = document.createElement('div');
    line.className = extraClass ? `l ${extraClass}` : 'l';
    line.innerHTML = html;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
    return line;
  }

  // Découpe le HTML en tokens : une balise entière = un seul token, sinon un caractère.
  // Permet de "taper" du HTML coloré sans jamais couper une balise en deux.
  function tokenizeHtml(html) {
    return html.match(/<[^>]+>|[^<]/g) || [];
  }

  function typeLine(line, html, speed, onDone) {
    const tokens = tokenizeHtml(html);
    let i = 0;
    function step() {
      line.innerHTML = tokens.slice(0, i + 1).join('');
      output.scrollTop = output.scrollHeight;
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
  function typeLines(lines, extraClass, speed) {
    let i = 0;
    function next() {
      if (i >= lines.length) return;
      const line = printLine('', extraClass);
      typeLine(line, lines[i], speed, () => {
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

  function runCommand(raw) {
    const cmd = raw.trim();
    if (!cmd) return;

    output.innerHTML = '';
    if (cmd.toLowerCase() === 'clear') {
      history.push(cmd);
      historyIndex = history.length;
      return;
    }
    printLine(`<span class="prompt">$</span> ${escapeHtml(cmd)}`);
    history.push(cmd);
    historyIndex = history.length;

    const entry = TERM_COMMANDS[cmd.toLowerCase()];
    if (!entry) {
      typeLines([`commande introuvable : ${escapeHtml(cmd)} — tape <span class="k">help</span> pour la liste.`], 'error', 4);
      return;
    }
    typeLines(entry.run(), null, 4);
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

  card.addEventListener('click', () => input.focus());
  input.addEventListener('input', () => {
    resetTabCycle();
    updateHasValue();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      resetTabCycle();
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
