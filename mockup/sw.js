// SERVICE WORKER — met en cache l'intégralité du site (pages, styles, scripts, données,
// images, illustrations, icônes, polices) pour que l'utilisateur n'ait plus jamais rien à
// télécharger après la première visite : navigation instantanée entre les pages, et site
// pleinement fonctionnel hors ligne.
//
// Deux temps :
//  1. INSTALL — met en cache la « coquille » du site (les fichiers indispensables à l'affichage
//     d'une page : HTML, CSS, JS, données). Liste courte et stable, connue d'avance.
//  2. MESSAGE {type:'CACHE_URLS'} — reçoit de js/preload-pages.js la liste COMPLÈTE des
//     ressources réellement référencées par le site (découverte à l'exécution en lisant le
//     contenu des pages, feuilles de style, JSON et scripts : voir preload-pages.js). C'est ce
//     second temps qui couvre les ~85 images/logos/illustrations, dont les noms de fichiers
//     changent au fil du contenu et qu'il serait illusoire de maintenir à la main ici.
//
// CACHE_NAME est versionné à la main : le faire changer (v2 → v3...) force le remplacement
// intégral du cache au prochain déploiement, plutôt que de laisser d'anciens fichiers s'y
// attarder indéfiniment. À BUMPER À CHAQUE MISE EN LIGNE d'un contenu modifié.
const CACHE_NAME = 'portfolio-cache-v3';

// Coquille minimale : ce sans quoi une page ne peut pas s'afficher du tout.
const PRECACHE_URLS = [
  'index.html',
  'details.html',
  'veille.html',
  // styles.css est demandé avec ET sans paramètre de cache-busting selon la page
  // (index.html porte "?v=2", pas les autres) : ce sont deux entrées de cache distinctes.
  'css/styles.css',
  'css/styles.css?v=2',
  'css/details.css',
  'css/veille.css',
  'js/i18n.js',
  'js/knockout.js',
  'js/main.js',
  'js/details.js',
  'js/veille.js',
  'js/dot-rail-magnet.js',
  'js/page-blob.js',
  'js/cursor.js',
  'js/preload-pages.js',
  'js/veille-data.json',
  'js/veille-impact.json',
];

// Met en cache une URL sans jamais faire échouer l'ensemble : cache.addAll() est atomique
// (un seul 404 et TOUTE l'installation est abandonnée, donc plus aucun cache du tout). Ici
// une ressource manquante est simplement ignorée, les autres restent en cache.
//
// Déjà en cache = on ne retélécharge pas : la page renvoie sa liste à CHAQUE chargement, sans
// ce test le site rechargerait ses ~85 images à chaque visite — exactement ce qu'on cherche à
// supprimer. La fraîcheur n'en souffre pas : le gestionnaire de fetch plus bas rafraîchit
// chaque ressource au moment où elle sert réellement, et un changement de CACHE_NAME repart
// de toute façon d'un cache vide.
async function cacheOne(cache, url) {
  try {
    if (await cache.match(url)) return;
    const response = await fetch(url);
    if (response && response.ok) await cache.put(url, response);
  } catch (e) {
    /* ressource indisponible : on continue avec les suivantes */
  }
}

// Téléchargements menés par petits paquets plutôt que tous d'un coup : ~85 requêtes
// simultanées saturent la file du navigateur et retardent d'autant les ressources dont la
// page affichée a réellement besoin tout de suite.
const BATCH_SIZE = 6;
async function cacheAll(urls) {
  const cache = await caches.open(CACHE_NAME);
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    await Promise.all(urls.slice(i, i + BATCH_SIZE).map((url) => cacheOne(cache, url)));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheAll(PRECACHE_URLS)
      // Active immédiatement, sans attendre la fermeture des onglets déjà ouverts : la mise
      // en cache pendant l'écran d'accueil n'a d'intérêt que si elle sert dès la page suivante.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réception de la liste complète découverte par la page (voir preload-pages.js). On répond au
// client quand tout est en cache, pour qu'il puisse le signaler (évènement 'site-precached').
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    cacheAll(data.urls).then(() => {
      if (event.source) event.source.postMessage({ type: 'CACHE_URLS_DONE', count: data.urls.length });
    })
  );
});

// Domaines tiers dont les ressources font partie intégrante du rendu (polices Google) : elles
// doivent être servies depuis le cache comme le reste, sinon le texte attend le réseau à
// chaque visite. Les autres domaines sont laissés au navigateur.
const CACHEABLE_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

// Ce qui constitue le SITE lui-même (pages, styles, scripts, données) : ces fichiers changent à
// chaque mise à jour, contrairement aux images et aux polices.
const CODE_RE = /\.(html?|css|js|json)$/i;

// Range la réponse au cache, puis la renvoie telle quelle.
function keep(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

// DEUX STRATÉGIES, selon ce qui est demandé — et la distinction n'est pas une coquetterie, elle
// vient d'un piège rencontré en développement :
//
//  - PAGES / STYLES / SCRIPTS : réseau d'abord, cache en secours. En cache d'abord, toute
//    modification mettait DEUX rechargements à apparaître (le premier renvoyait la version en
//    cache et ne téléchargeait la nouvelle qu'en arrière-plan) — de quoi croire, à tort, qu'une
//    correction n'a pas fonctionné. Le cache reste le filet en cas de coupure réseau, donc le
//    site continue de fonctionner hors ligne.
//
//  - IMAGES / POLICES : cache d'abord, réponse instantanée. C'est là que se trouve l'essentiel
//    des octets (~70 images), et leur contenu ne change pas sous le même nom de fichier : rien
//    à revalider, donc aucune raison d'attendre le réseau.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_ORIGINS.includes(url.origin)) return;

  const isCode = event.request.mode === 'navigate' || (sameOrigin && CODE_RE.test(url.pathname));

  if (isCode) {
    event.respondWith(
      fetch(event.request)
        .then((response) => keep(event.request, response))
        // Hors ligne : on se rabat sur le cache. Response.error() si on n'a rien, plutôt que de
        // laisser respondWith() recevoir undefined (ce qui ferait échouer la requête sans rien dire).
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached
      || fetch(event.request)
        .then((response) => keep(event.request, response))
        .catch(() => Response.error()))
  );
});
