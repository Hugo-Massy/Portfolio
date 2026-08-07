// PRÉCHARGEMENT INTÉGRAL DU SITE — pendant que l'écran d'accueil retient l'utilisateur
// (#preloader, voir initPreloader dans js/main.js), on télécharge et met en cache TOUT le site :
// les trois pages, leurs styles et scripts, les données JSON, toutes les images/illustrations/
// logos/icônes qu'elles référencent, et les polices distantes. Objectif : passé l'écran
// d'accueil, l'utilisateur n'a plus jamais rien à attendre — navigation instantanée, et site
// complet même hors ligne.
//
// La mise en cache elle-même est faite par le service worker (sw.js), qui travaille sur SON
// PROPRE THREAD : le téléchargement des ~85 images ne peut donc pas saccader l'animation de
// l'écran d'accueil ni le défilement. Ce fichier-ci ne fait que deux choses : découvrir la
// liste des ressources, puis la lui transmettre.
//
// POURQUOI DÉCOUVRIR À L'EXÉCUTION plutôt que lister les fichiers en dur : les images vivent
// dans quatre endroits différents (attributs HTML, url() des CSS, chemins dans les JSON de
// veille, et une table de logos dans js/veille.js), et changent au fil du contenu. Une liste
// écrite à la main se serait désynchronisée au premier ajout, silencieusement — l'image
// oubliée se serait simplement remise à charger depuis le réseau. On lit donc les fichiers du
// site et on en extrait les références, ce qui reste juste sans maintenance.
(function initPagePreload() {
  if (!('serviceWorker' in navigator)) return;

  // Respecte les préférences data de l'utilisateur : ce préchargement télécharge tout le site
  // (~85 ressources, plusieurs Mo) en arrière-plan. Sur connexion lente/plafonnée ou en mode
  // "économie de données", ce coût n'a rien de justifié pour un premier visiteur — la
  // navigation restera simplement normale (chaque page se charge à la demande), sans le confort
  // "hors ligne / instantané" que ce préchargement apporte sur une bonne connexion.
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    if (conn.saveData) return;
    if (typeof conn.effectiveType === 'string' && /^(slow-2g|2g|3g)$/.test(conn.effectiveType)) return;
  }

  // Fichiers « source » qu'on lit pour y trouver des références à d'autres ressources.
  const SOURCES = [
    'index.html', 'details.html', 'veille.html',
    'css/styles.css', 'css/details.css', 'css/veille.css',
    'js/main.js', 'js/details.js', 'js/veille.js', 'js/i18n.js',
    'js/veille-data.json', 'js/veille-impact.json',
  ];

  const found = new Set();

  // Ne retient que ce qui vaut la peine d'être mis en cache : même origine (les ressources du
  // site) ou polices Google. Écarte au passage mailto:, les ancres #, data: et les liens
  // externes (GitHub, LinkedIn…), qui n'ont rien à faire dans le cache du site.
  const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
  function add(raw, base) {
    if (!raw) return;
    const value = raw.trim();
    if (!value || value.startsWith('#') || value.startsWith('data:')
      || value.startsWith('mailto:') || value.startsWith('javascript:')) return;
    let url;
    try {
      url = new URL(value, base || location.href);
    } catch (e) {
      return;
    }
    if (url.origin !== location.origin && !FONT_ORIGINS.includes(url.origin)) return;
    url.hash = '';
    found.add(url.href);
  }

  // srcset = "imageA.webp 2x, imageB.webp 3x" : on découpe sur les virgules puis on garde le
  // premier mot de chaque candidat (le descripteur 2x/3x/480w n'est pas une URL). C'est
  // précisément pourquoi un nom de fichier contenant des espaces doit y être encodé (%20) —
  // sans quoi l'espace se lirait comme le début du descripteur.
  function addSrcset(value, base) {
    if (!value) return;
    value.split(',').forEach((candidate) => add(candidate.trim().split(/\s+/)[0], base));
  }

  // Références trouvées dans un document HTML : tous les attributs qui désignent une ressource.
  function scanHTML(text, base) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('[src]').forEach((el) => add(el.getAttribute('src'), base));
    doc.querySelectorAll('[href]').forEach((el) => add(el.getAttribute('href'), base));
    doc.querySelectorAll('[poster]').forEach((el) => add(el.getAttribute('poster'), base));
    doc.querySelectorAll('[srcset]').forEach((el) => addSrcset(el.getAttribute('srcset'), base));
    scanText(text, base); // filet : url() dans un attribut style, chemins écrits en dur…
  }

  // Références trouvées dans du texte brut (CSS, JS, JSON) : les url(...) des feuilles de style,
  // et toute chaîne entre guillemets qui ressemble à un chemin de ressource. Le motif s'arrête
  // au guillemet fermant et non à l'espace : les noms de fichiers en contiennent
  // ("Avatar pc assis.webp"), un découpage sur les espaces les tronquerait.
  const ASSET_RE = /["'`]([^"'`\n]*\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|mp4|webm|pdf|json))["'`]/gi;
  const URL_RE = /url\(\s*(["']?)([^)"']+)\1\s*\)/gi;
  function scanText(text, base) {
    let m;
    while ((m = ASSET_RE.exec(text)) !== null) add(m[1], base);
    while ((m = URL_RE.exec(text)) !== null) add(m[2], base);
  }

  // Feuille de style des polices Google : elle ne contient pas les polices elles-mêmes mais
  // des @font-face qui pointent vers fonts.gstatic.com. Sans cette seconde lecture, on
  // mettrait en cache la feuille mais pas les fichiers .woff2 qu'elle réclame — et le texte
  // continuerait d'attendre le réseau à chaque visite.
  function fontStylesheets() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((l) => l.href)
      .filter((href) => FONT_ORIGINS.some((o) => href.startsWith(o)));
  }

  // Répertoire des pages du site : c'est LUI qui sert de repère aux chemins écrits dans les JS
  // et les JSON. Un chemin comme "assets/veille/top-1.jpg" stocké dans js/veille-data.json est
  // en effet destiné à être posé dans un <img> de veille.html : il se lit donc depuis la page,
  // pas depuis le JSON. Le résoudre depuis le JSON donnerait "js/assets/..." — introuvable.
  const PAGE_BASE = new URL('.', location.href).href;

  // À quel repère rattacher les chemins trouvés dans un fichier, selon son type :
  //   - CSS  → au fichier CSS lui-même (c'est la règle de url() : "../assets/x.png" part du CSS) ;
  //   - HTML → au document lui-même ;
  //   - JS / JSON → au répertoire des pages (cf. PAGE_BASE ci-dessus).
  function baseFor(url) {
    if (/\.css($|\?)/i.test(url)) return url;
    if (/\.html?($|\?)/i.test(url)) return url;
    return PAGE_BASE;
  }

  async function readInto(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const text = await response.text();
      add(url);
      const base = baseFor(url);
      if (/\.html?($|\?)/i.test(url)) scanHTML(text, base);
      else scanText(text, base);
    } catch (e) {
      /* source illisible : les autres suffisent */
    }
  }

  async function discover() {
    // La page courante est déjà chargée : on la lit directement, sans la retélécharger.
    scanHTML(document.documentElement.outerHTML, location.href);
    SOURCES.forEach(add);
    await Promise.all(SOURCES.map(readInto));
    await Promise.all(fontStylesheets().map(readInto));
    return Array.from(found);
  }

  async function run() {
    let registration;
    try {
      registration = await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      return; // pas de service worker (http:// non sécurisé, navigation privée…) : on abandonne
    }
    // Il faut un worker ACTIF pour lui parler : au tout premier chargement il vient d'être
    // enregistré et démarre encore.
    await navigator.serviceWorker.ready;
    const urls = await discover();
    const target = registration.active || navigator.serviceWorker.controller;
    if (!target) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'CACHE_URLS_DONE') return;
      // Signal pour qui voudrait s'en servir (ex. n'autoriser la sortie de l'écran d'accueil
      // qu'une fois le site entièrement en cache).
      document.dispatchEvent(new CustomEvent('site-precached', { detail: { count: event.data.count } }));
    });
    target.postMessage({ type: 'CACHE_URLS', urls });
  }

  // Après "load" : la découverte lit une douzaine de fichiers et le worker en télécharge ~85,
  // ça ne doit pas entrer en concurrence avec les ressources dont la page affichée a besoin
  // tout de suite (police, images du hero).
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
})();
