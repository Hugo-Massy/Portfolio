// BLOB DU HERO — reprend la forme bleue organique de l'écran de chargement
// (.preloader-blob / initPreloaderBlob dans js/main.js) pour suivre le curseur DANS LE HERO de
// chaque page : même ressort à amortissement critique, même étirement selon la vitesse, même
// sillage de bulles, même découpe blanche du contenu survolé. Remplace l'ancienne grille de
// points réactive (#bg-grid sur l'accueil, #dp-bg-grid sur détails/veille), retirée des trois pages.
//
// Différence avec le préloader : celui-ci est un écran fixe (jamais de scroll), la forme et
// sa découpe n'ont donc qu'à connaître la position du curseur dans le viewport. Ici la page
// défile : la copie du contenu est posée dans une fenêtre fixe à la taille du viewport
// (.page-blob-clone, position:fixed comme l'était #preloader), et son contenu est décalé de
// -scrollY (.page-blob-clone-shift) pour rester cadré exactement comme ce qui est réellement
// affiché à l'écran — un miroir qui suit le défilement plutôt qu'un calque immobile.
//
// LIMITE UNIQUE : LE BORD HAUT DU BLEU — la forme suit le curseur partout sur la page, et une
// seule chose la borne : elle ne doit jamais dépasser le haut des aplats bleus (bandeau de
// #about, bandeaux inclinés de la page détails). C'est un clip-path recalculé au défilement sur
// la frontière haute réelle du bleu qui l'assure ; la fenêtre, elle, reste plein écran (c'est
// elle qui donne son repère à toute la chaîne de découpe, cf. ci-dessus). Rogner ainsi plutôt que
// redimensionner la fenêtre garde intacte l'arithmétique de la découpe : sans ça, il faudrait
// soustraire l'origine de la zone dans .page-blob-origin ET dans .page-blob-clone-shift, deux
// endroits à garder en phase pour un résultat identique.
// Aucune autre condition ne fait disparaître la forme (ni sortie du hero, ni passage sur le
// bleu, ni défilement) — seul le curseur qui quitte la fenêtre l'éteint.
//
// La copie doit aussi rester à jour : contrairement au mot du préloader (statique le temps de
// l'écran), le contenu des pages change (terminal tapé, calendrier de dispo, langue, carrousel).
// Elle est donc reconstruite sur quelques évènements ponctuels et rares (langue, redimensionnement)
// plutôt que sur chaque mutation du DOM — voir le commentaire plus bas sur rebuildClone/scheduleRebuild
// pour le pourquoi (un observeur générique a d'abord fait ramer tout le site).
(function initPageBlob() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (document.getElementById('page-blob-viewport')) return;

  // .hero  → accueil (#hero) et page détails (#dp-hero) ; .vl-head → page veille (#vl-hero-head).
  // Sans hero sur la page, il n'y a rien à décorer : on n'installe rien du tout.
  const hero = document.querySelector('.hero, .vl-head');
  if (!hero) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mesures mises en cache le temps d'une image et écritures gardées : voir js/frame.js. Les
  // mêmes aplats bleus sont mesurés ici (frontière du rognage), par le point du curseur et par
  // chacune des découpes de bouton — une seule mesure sert désormais les trois.
  const rectOf = (el) => window.FrameLoop.rect(el);
  const setStyle = (el, prop, value) => window.FrameLoop.setStyle(el, prop, value);
  const setVar = (el, name, value) => window.FrameLoop.setVar(el, name, value);

  /* ---------- construction du DOM ---------- */

  const viewport = document.createElement('div');
  viewport.id = 'page-blob-viewport';
  viewport.className = 'page-blob-viewport';
  viewport.setAttribute('aria-hidden', 'true');

  const bubbleLayer = document.createElement('span');
  bubbleLayer.className = 'page-blob-bubbles';

  const blob = document.createElement('span');
  blob.className = 'page-blob';
  blob.innerHTML = `
    <span class="page-blob-stretch">
      <span class="page-blob-shape">
        <span class="page-blob-knockout">
          <span class="page-blob-origin">
            <div class="page-blob-clone"><div class="page-blob-clone-shift"></div><div class="page-blob-clone-fixed"></div></div>
          </span>
        </span>
      </span>
    </span>`;

  // ordre d'ajout = ordre de peinture : les bulles doivent rester sous la forme.
  viewport.appendChild(bubbleLayer);
  viewport.appendChild(blob);
  document.body.appendChild(viewport);

  const cloneBox = blob.querySelector('.page-blob-clone');
  const cloneShift = blob.querySelector('.page-blob-clone-shift');
  const cloneFixed = blob.querySelector('.page-blob-clone-fixed');

  // Taille de la fenêtre de copie, posée en px depuis clientWidth/clientHeight — et surtout PAS
  // en 100vw/100vh : ces unités COMPTENT la barre de défilement, alors que le contenu réel de la
  // page est mis en page dans la largeur qui l'exclut. La copie serait donc ~15px plus large que
  // l'original, et tout ce qui est centré (.wrap { margin:0 auto }) se retrouverait décalé de la
  // moitié de cet écart — la découpe ne tomberait plus sur le texte qu'elle est censée recouvrir.
  // (L'écran de chargement échappait au problème : html.is-preloading masque le défilement, donc
  // aucune barre, donc 100vw y valait bien la largeur réelle.)
  // Écriture seulement quand la mesure a changé : cette fonction est appelée depuis le scroll
  // (via updateScroll) et il ne faut pas y toucher au style à chaque image pour rien.
  let cloneW = 0;
  let cloneH = 0;
  function syncCloneSize() {
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    if (w === cloneW && h === cloneH) return;
    cloneW = w;
    cloneH = h;
    cloneBox.style.width = `${w}px`;
    cloneBox.style.height = `${h}px`;
  }
  syncCloneSize();
  window.addEventListener('resize', syncCloneSize);

  // Distance totale défilable du document, pour l'animation à timeline de scroll ci-dessus
  // (styles.css, .page-blob-clone-shift) : elle mappe linéairement 0%→100% de la course réelle sur
  // translateY(0)→translateY(-max), il lui faut donc connaître max pour retomber exactement sur
  // -scrollY à chaque instant. N'affecte que ce navigateurs qui la supportent, mais posée
  // inconditionnellement : lire scrollHeight force une mise en page de toute façon, autant ne pas
  // dupliquer les points d'appel selon le support.
  let scrollMax = -1;
  function updateScrollMax() {
    const max = Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
    if (max === scrollMax) return;
    scrollMax = max;
    blob.style.setProperty('--pgblob-scroll-max', `${max}px`);
  }
  updateScrollMax();
  window.addEventListener('resize', updateScrollMax);
  // La largeur utile change AUSSI sans redimensionnement de fenêtre, et ça nous est arrivé de
  // plein fouet : ce module démarre pendant l'écran d'accueil, or html.is-preloading pose
  // overflow:hidden — donc aucune barre de défilement, donc un clientWidth plus large d'une
  // quinzaine de px que la réalité. À la fermeture de l'écran la barre apparaît, la largeur utile
  // se réduit… et aucun évènement "resize" n'est émis pour le signaler. La copie restait donc
  // trop large, et tout ce qui est centré (.wrap { margin:0 auto }) s'y retrouvait décalé vers la
  // droite de la moitié de l'écart. Un ResizeObserver sur <html>, lui, voit ce changement.
  if (window.ResizeObserver) {
    new ResizeObserver(syncCloneSize).observe(document.documentElement);
  }

  /* ---------- clonage du contenu de la page (pour la découpe blanche) ---------- */

  // Le blob lui-même, le curseur personnalisé (cf. cursor.js) et le préloader (accueil
  // uniquement, fermé ou non) n'ont rien à faire dans leur propre copie.
  const EXCLUDE_SELECTOR = '#page-blob-viewport, .cursor-dot, #preloader, script, canvas';
  const FIXED_UI_SELECTOR = '.dot-rail, .lang-switch, .back-to-top, .page-tag, .scroll-progress';
  // Ceux de ces habillages qui passent SOUS la forme, et dont la copie doit donc être peinte
  // (dans le calque non défilant, cf. rebuildFixedCopies). Les autres restent seulement masqués.
  const FIXED_SELECTOR = '.page-tag, .dot-rail';

  // Correspondance « élément réel de haut niveau → sa copie ». Sert à retrouver dans la copie le
  // pendant exact d'un élément survolé (cf. syncHover) : sous ces racines, cloneNode(true) a
  // reproduit la structure à l'identique, donc les mêmes rangs d'enfants y mènent au même nœud.
  // Indispensable de passer par cette table plutôt que par le rang dans <body> : la copie saute
  // les éléments exclus, ses enfants de premier niveau ne sont donc pas alignés sur ceux du vrai
  // <body>.
  const cloneRoots = new Map();

  function rebuildClone() {
    cloneShift.innerHTML = '';
    cloneRoots.clear();
    Array.from(document.body.children).forEach((child) => {
      if (child.matches && child.matches(EXCLUDE_SELECTOR)) return;
      const copy = child.cloneNode(true);
      // Les id sont CONSERVÉS, contrairement à la découpe de l'écran de chargement qui les
      // retire. La raison y était l'ordre du DOM : la copie du préloader précède son original,
      // donc ses doublons auraient été trouvés en premier par getElementById. Ici c'est
      // l'inverse — la fenêtre du blob est ajoutée en dernier dans <body> (cf. plus haut), les
      // originaux la précèdent toujours, et toute recherche par id ou par sélecteur continue
      // donc de tomber sur la vraie page.
      //
      // Et il FAUT les garder : plusieurs règles de mise en page sont écrites sur des id
      // (#dp-hero .term-bar-title, #homelab .dp-xp-list, #experience …). Sans id, ces règles ne
      // s'appliquent plus à la copie, qui se met alors en page différemment de l'original — la
      // découpe se décale, et le texte blanc ne tombe plus sur le texte qu'il doit recouvrir.
      copy.querySelectorAll('script').forEach((n) => n.remove());
      // Définitions SVG (dégradés, motifs animés) inutiles ici puisque tout repasse en
      // blanc : autant ne pas faire tourner une seconde fois leurs animations.
      copy.querySelectorAll('defs').forEach((n) => n.remove());
      // src/srcset retirés (et non l'élément lui-même, pour garder la mise en page intacte
      // via ses width/height) : la copie entière est reconstruite à chaque rebuild, laisser
      // ces attributs ferait retélécharger/redécoder les mêmes images en boucle — coûteux,
      // et inutile puisque cette copie ne sert qu'à la couleur du texte qu'elle recouvre.
      copy.querySelectorAll('img').forEach((n) => { n.removeAttribute('src'); n.removeAttribute('srcset'); });
      copy.querySelectorAll('source').forEach((n) => n.removeAttribute('srcset'));
      // Les habillages en position:fixed (rail, sélecteur de langue, bouton de remontée, nav de
      // page) sont MASQUÉS dans la copie — masqués et non retirés, la nuance compte : supprimer
      // un nœud décale l'indice de tous ses frères suivants, or l'appariement d'un élément réel
      // avec sa copie (counterpartOf) se fait précisément par ces indices. Les retirer faussait
      // donc le report du survol et le recalage des animations pour tout ce qui les suit dans le
      // document. display:none ne change rien à la mise en page ici, ces éléments étant hors flux.
      // Deux raisons de ne pas les peindre, et la première est un vrai défaut visible :
      //   - dans la copie, ils se trouvent sous des ancêtres transformés (.page-blob & co). Or un
      //     position:fixed placé sous un transform ne se résout plus contre le viewport mais
      //     contre cet ancêtre : leurs copies se recollent donc autour de la forme et se
      //     promènent avec elle, à quelques dizaines de px de leur vraie place ;
      //   - ils portent tous un z-index ≥ 50, au-dessus de la fenêtre du blob (40) : les vrais
      //     ne sont donc jamais recouverts par la forme, et leur copie ne servirait à rien.
      copy.querySelectorAll(FIXED_UI_SELECTOR).forEach((n) => { n.style.display = 'none'; });
      if (copy.matches && copy.matches(FIXED_UI_SELECTOR)) copy.style.display = 'none';
      cloneRoots.set(child, copy);
      cloneShift.appendChild(copy);
    });
    rebuildFixedCopies();
    collectTransformed();
    collectSticky();
    collectClassPairs();
    // Les classes pilotées au scroll sont posées dans la foulée : sans ça, la copie fraîchement
    // reconstruite repart de l'état figé du clonage (lignes de stats à opacity:0, par exemple)
    // jusqu'à la première frame qui la synchronisera.
    syncClasses();
    hoverMarked = [];
    // Après insertion, le temps que le navigateur applique les styles et crée les animations.
    requestAnimationFrame(syncCloneAnimations);
  }

  /* ---------- recalage des animations de la copie ---------- */

  // Une animation CSS démarre quand son élément apparaît. Les originaux ont donc démarré au
  // chargement de la page, et les copies au moment du clonage : elles jouent la même animation,
  // mais décalées dans leur cycle. Sur la pastille de défilement (.scroll-down, qui rebondit en
  // 2,2s et se déforme en 9s), la copie vue à travers la forme ne rebondissait donc pas en même
  // temps que la vraie juste à côté.
  // On aligne leur startTime sur celui de l'original : partageant la même horloge (celle du
  // document), elles restent alors en phase indéfiniment — plutôt que d'être approchées par un
  // animation-delay négatif qu'il faudrait recalculer sans cesse.
  // Le filtre sur animationName n'est pas décoratif : getAnimations() renvoie AUSSI les
  // transitions CSS, dont l'état diffère forcément entre l'original et sa copie (l'une est en
  // cours de survol, l'autre non…). Les compter faussait toute mise en correspondance.
  const cssAnimations = (el) => el.getAnimations().filter((a) => a.animationName);

  function syncCloneAnimations() {
    const handled = new Set();
    cloneRoots.forEach((copyRoot, srcRoot) => {
      if (!srcRoot.getAnimations) return;
      // On part des animations réellement présentes dans l'original pour n'inspecter que les
      // éléments concernés, puis on remonte à leur élément porteur.
      srcRoot.getAnimations({ subtree: true }).forEach((s) => {
        if (!s.animationName) return;
        const el = s.effect && s.effect.target;
        if (!el || handled.has(el)) return;
        handled.add(el);
        // Appariement par ÉLÉMENT et non par rang global dans la liste : plusieurs éléments
        // partagent la même animation (preloader-blob-morph anime la pastille de défilement,
        // mais aussi chaque point du rail, avec des décalages volontairement différents). Un
        // appariement par ordre d'apparition aurait synchronisé la pastille sur un point du rail.
        const copyEl = counterpartOf(el);
        if (!copyEl) return;
        const srcList = cssAnimations(el);
        cssAnimations(copyEl).forEach((c) => {
          const match = srcList.find((a) => a.animationName === c.animationName);
          if (match && match.startTime !== null) c.startTime = match.startTime;
        });
      });
    });
  }

  /* ---------- copies des habillages en position:fixed ---------- */

  // Un élément position:fixed placé sous un ancêtre transformé ne se résout plus contre le
  // viewport mais contre cet ancêtre : recopié tel quel dans .page-blob-clone-shift, il se
  // recollerait autour de la forme. Ses copies vivent donc dans un calque à part, HORS du
  // décalage de défilement (elles ne défilent pas, justement), et sont posées en absolu à leur
  // position écran mesurée — ce qui les fait tomber exactement sur les vraies.
  let fixedPairs = [];
  // Indicateur de section du rail : sa position (top) et sa déformation (transform) sont
  // réécrites À CHAQUE IMAGE par js/dot-rail-magnet.js, en style en ligne. Le clone les fige au
  // moment de la copie, il faut donc les recopier en continu (cf. syncRailIndicator).
  let railIndicator = null;
  let railIndicatorCopy = null;

  function rebuildFixedCopies() {
    cloneFixed.innerHTML = '';
    fixedPairs = [];
    railIndicator = null;
    railIndicatorCopy = null;
    document.querySelectorAll(FIXED_SELECTOR).forEach((src) => {
      const copy = src.cloneNode(true);
      // transform:none est indispensable. Le rail se centre verticalement avec top:50% PUIS
      // translateY(-50%) ; or on place la copie à sa position mesurée (getBoundingClientRect),
      // qui tient déjà compte de ce recentrage. Sans neutraliser la transform, le -50%
      // s'appliquerait une seconde fois et la copie remonterait d'une demi-hauteur.
      // display réinitialisé : ces mêmes éléments sont masqués dans la copie défilante, et
      // .cloneNode reprendrait ce masquage si la copie était prise après coup.
      copy.style.cssText += ';position:absolute; bottom:auto; margin:0; display:; transform:none;';
      cloneFixed.appendChild(copy);
      // De quel bord l'original est-il ancré ? La copie doit reprendre le MÊME, sinon les deux
      // divergent dès que leur largeur change : le rail se déplie au survol (le label passe de
      // max-width:0 à 140px), et un élément ancré à droite s'élargit vers la gauche quand un
      // élément ancré à gauche s'élargit vers la droite.
      const anchorRight = getComputedStyle(src).right !== 'auto';
      fixedPairs.push({ src, copy, anchorRight });
      // Déclarés comme racines de correspondance pour que le report du survol et le recalage des
      // animations sachent les retrouver (cf. counterpartOf) : ils ne se trouvent pas sous les
      // racines clonées de premier niveau.
      cloneRoots.set(src, copy);
      const ind = src.querySelector('.dot-rail-indicator');
      if (ind) {
        railIndicator = ind;
        railIndicatorCopy = copy.querySelector('.dot-rail-indicator');
      }
    });
    positionFixedCopies();
  }

  // Recopie les styles en ligne que dot-rail-magnet.js réécrit à chaque image. Deux lectures et
  // deux écritures de chaînes, sans aucune mesure de mise en page : négligeable par image.
  // Renvoie vrai si quelque chose a réellement changé — c'est ce qui dit à la boucle du ressort
  // que l'indicateur est encore en train de voyager le long du rail (transition CSS sur `top`,
  // déformation réécrite par js/dot-rail-magnet.js) et qu'elle ne peut donc pas encore
  // s'endormir, même si la forme, elle, est posée.
  function syncRailIndicator() {
    if (!railIndicator || !railIndicatorCopy) return false;
    const a = setStyle(railIndicatorCopy, 'top', railIndicator.style.top);
    const b = setStyle(railIndicatorCopy, 'transform', railIndicator.style.transform);
    return a || b;
  }

  // Seuls left/top sont posés : la copie porte les mêmes classes que l'original, sa taille
  // naturelle est donc déjà la bonne. Lui imposer une largeur/hauteur mesurée ne ferait
  // qu'ajouter une occasion de diverger.
  function positionFixedCopies() {
    if (!fixedPairs.length) return;
    const vw = document.documentElement.clientWidth;
    fixedPairs.forEach(({ src, copy, anchorRight }) => {
      const r = rectOf(src);
      setStyle(copy, 'top', `${r.top.toFixed(2)}px`);
      // Le bord ancré est celui qui ne bouge pas quand la largeur change : on le fige, et on
      // laisse l'autre libre, exactement comme l'original (cf. anchorRight à la construction).
      if (anchorRight) {
        setStyle(copy, 'left', 'auto');
        setStyle(copy, 'right', `${(vw - r.right).toFixed(2)}px`);
      } else {
        setStyle(copy, 'right', 'auto');
        setStyle(copy, 'left', `${r.left.toFixed(2)}px`);
      }
    });
  }
  window.addEventListener('resize', positionFixedCopies);

  // Les états du rail (section active) et de la nav vivent dans des CLASSES, que le scroll-spy
  // change en cours de route ; la copie, elle, les fige. On la refait donc à chaque changement de
  // classe — c'est rare, et bien moins coûteux que de recloner toute la page.
  // attributeFilter sur 'class' est indispensable : dot-rail-magnet.js réécrit le style en ligne
  // de l'indicateur à chaque image, un observateur non filtré se déclencherait 60 fois par seconde.
  let fixedRebuildTimer = null;
  function scheduleFixedRebuild() {
    clearTimeout(fixedRebuildTimer);
    fixedRebuildTimer = setTimeout(() => {
      rebuildFixedCopies();
      requestAnimationFrame(syncCloneAnimations);
    }, 80);
  }
  document.querySelectorAll(FIXED_SELECTOR).forEach((el) => {
    new MutationObserver(scheduleFixedRebuild)
      .observe(el, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  // La position mesurée peut être TRANSITOIRE, et ça nous est arrivé : la nav vit à l'intérieur
  // de #app, auquel html.is-preloading applique translateY(24px). Un position:fixed sous un
  // ancêtre transformé se résout contre cet ancêtre — pendant l'écran d'accueil, la vraie nav est
  // donc 24px plus bas que sa place définitive. Or la copie est construite à ce moment-là, et
  // rien ensuite ne la recalculait : elle restait décalée d'une hauteur de ligne.
  // On la repositionne donc à la fermeture de l'écran, puis une seconde fois une fois la
  // transition de #app (1,4s) terminée, quand la nav a rejoint sa position définitive.
  document.addEventListener('preloader-hidden', () => {
    positionFixedCopies();
    setTimeout(positionFixedCopies, 1600);
  });

  /* ---------- report de l'état de survol sur la copie ---------- */

  // La copie n'est jamais survolée par la souris : aucune règle :hover ne s'y applique. Sans
  // rien de plus, survoler un bouton ou un point du rail SOUS la forme donnerait deux états
  // différents — l'original passe en survol (le label du rail se déplie, le bouton se soulève),
  // la copie reste au repos, et la découpe blanche ne recouvre plus ce qu'elle devrait.
  // On recopie donc l'état : le pendant de l'élément survolé, ET toute sa lignée d'ancêtres
  // (c'est ainsi que :hover se propage), reçoit la classe .pgblob-hover, sur laquelle la
  // feuille de style rejoue les mêmes effets (cf. styles.css).
  const HOVER_CLASS = 'pgblob-hover';
  let hoverMarked = [];
  // Seuls les éléments qui portent réellement un effet de survol sont suivis : remonter la
  // lignée pour n'importe quel nœud coûterait cher à chaque mouvement de souris.
  const HOVERABLE_SELECTOR = 'a, button, .btn, [role="button"], .xp-tile, .skill-item, .ref-card, .cal-day, .term-cat-item';

  // Retrouve dans la copie le nœud correspondant à `el` : on remonte jusqu'à l'élément de
  // premier niveau en notant le rang à chaque étage, puis on redescend les mêmes rangs dans sa
  // copie. Renvoie null si l'élément n'est pas dans la partie clonée (ou si la copie est
  // périmée, ce qui se corrige au prochain rebuild).
  function counterpartOf(el) {
    const path = [];
    let node = el;
    // On remonte jusqu'à la première racine dont on connaît la copie. Ce sont les éléments de
    // premier niveau, mais aussi les habillages fixes recopiés à part (cf. rebuildFixedCopies) —
    // d'où ce test à chaque étage plutôt qu'un arrêt sur <body>, qui les manquerait et
    // redescendrait un chemin invalide dans la copie défilante.
    while (node && !cloneRoots.has(node)) {
      const parent = node.parentElement;
      if (!parent) return null;
      path.push(Array.prototype.indexOf.call(parent.children, node));
      node = parent;
    }
    let copy = cloneRoots.get(node);
    if (!copy) return null;
    for (let i = path.length - 1; i >= 0; i--) {
      copy = copy.children[path[i]];
      if (!copy) return null;
    }
    return copy;
  }

  /* ---------- recopie des transforms animées par JS (parallax de #about) ---------- */

  // initAboutParallax (js/main.js) fait REMONTER #about et toutes les sections qui suivent d'un
  // translateY qui grandit avec le défilement (jusqu'à --about-lift, 220px), réécrit en style en
  // ligne à chaque image. cloneNode recopie l'attribut style, donc la copie FIGE ce décalage à
  // l'instant du clonage : le bandeau bleu de la copie (repeint en blanc, cf. .page-blob-clone
  // .section-divider-bar dans styles.css) se retrouvait alors des dizaines de px au-dessus du
  // vrai. D'où la diagonale invisible en travers de la forme — sa découpe blanche commençait bien
  // avant le bleu réel, alors même que le rognage, lui, tombe juste (il mesure le vrai bandeau).
  // On recopie donc ces transforms en continu, comme pour l'indicateur du rail.
  //
  // Les porteurs sont trouvés par leur style en ligne plutôt que codés en dur (#about et ses
  // suivants) : la liste exacte est une décision de initAboutParallax, et la dupliquer ici
  // reviendrait à devoir la tenir en phase avec elle.
  //
  // `height` est recopiée pour la même raison, et le défaut qu'elle corrige est bien pire qu'un
  // simple décalage local : la piste du carrousel épinglé de la page veille (.vl-showcase-track)
  // reçoit une hauteur en ligne de plus de 3000px pendant la séquence, que initShowcaseScrub
  // RETIRE d'un coup une fois la séquence jouée (finalize). La copie, elle, garde la valeur figée
  // au clonage : elle reste donc ~2280px plus haute que la vraie page, et tout ce qui suit la
  // piste — #vl-grid, #vl-impact et surtout l'aplat bleu de #contact, repeint en blanc dans la
  // copie — se retrouve décalé d'autant. D'où un grand bloc blanc invisible en plein milieu de
  // la page, qui fait blanchir la forme là où il n'y a rien. Mesuré : 2280px d'écart pendant
  // toute la seconde ou deux que met le ResizeObserver plus bas à reconstruire la copie.
  // Recopier la hauteur par image supprime cette latence — le filet ne sert plus qu'aux cas
  // qu'on n'a pas prévus.
  const INLINE_LAYOUT_SELECTOR = '[style*="transform"], [style*="height"]';
  let transformPairs = [];
  function collectTransformed() {
    transformPairs = [];
    document.querySelectorAll(INLINE_LAYOUT_SELECTOR).forEach((src) => {
      if (src.closest(EXCLUDE_SELECTOR)) return;
      const copy = counterpartOf(src);
      if (copy) transformPairs.push({ src, copy });
    });
  }

  // Quelques lectures et écritures de chaînes par élément concerné (trois ou quatre), sans
  // aucune mesure de mise en page : négligeable par image.
  function syncTransforms() {
    let changed = false;
    for (const { src, copy } of transformPairs) {
      if (setStyle(copy, 'transform', src.style.transform)) changed = true;
      if (setStyle(copy, 'height', src.style.height)) changed = true;
    }
    return changed;
  }

  /* ---------- recalage des éléments en position:sticky ---------- */

  // Un élément figé (position:sticky) ne peut pas fonctionner dans la copie, et c'est
  // structurel : le figement ne réagit qu'au défilement RÉEL d'un ancêtre, or la copie ne
  // défile jamais — js/page-blob.js y simule le défilement par un translateY sur
  // .page-blob-clone-shift, qu'un sticky ignore complètement. La copie restait donc à sa
  // position de repos pendant que l'original, lui, se figeait à l'écran : les deux dérivaient
  // l'un par rapport à l'autre pendant tout le figement, et la forme tranchait un aplat blanc
  // le long de ce décalage.
  //
  // On REJOUE ce figement : la feuille de style repasse la copie en position:static — donc à sa
  // place de repos, celle qu'elle occuperait sans figement — et on lui applique ici le
  // déplacement exact que le figement produit sur l'original. Même mécanique que
  // syncTransforms/syncRailIndicator juste au-dessus.
  //
  // .vl-showcase-pin (le top 3 épinglé de la page veille) N'EST PAS ICI : un z-index positif posé
  // sur un DESCENDANT de .vl-showcase-pin (position:sticky) ne remonte apparemment pas, dans ce
  // Chrome, au-delà de cet ancêtre jusqu'au contexte racine — même avec le z-index:auto de
  // .vl-showcase-pin, qui sur le papier ne devrait créer aucun contexte d'empilement (vérifié en
  // forçant temporairement .vl-showcase-pin en position:static : la forme redevenait alors
  // correctement invisible sous les cartes, confirmant le sticky comme seul coupable). Posé sur
  // l'ÉLÉMENT STICKY LUI-MÊME, en revanche, le z-index fonctionne : voir .vl-showcase-pin
  // (veille.css), qui porte maintenant z-index:41 directement.
  //
  // .vl-meta, EN REVANCHE, EST ICI — et c'est nouveau : elle est sortie de .vl-showcase-pin
  // (veille.html) pour ne pas être promue avec lui (elle doit continuer à recevoir la découpe
  // blanche normale), et tient donc désormais son propre position:sticky (veille.css) pour rester
  // visuellement groupée avec le pin au figement. Mais ça la rend structurellement identique au
  // problème que ce module corrige déjà pour .about-card/.xp-bento-stick : sa copie, elle aussi
  // sticky, ne peut pas se figer dans une fenêtre qui ne défile jamais réellement (le défilement
  // de la copie est simulé par un translateY sur .page-blob-clone-shift, qu'un sticky ignore).
  // Repéré à l'usage : sans cette entrée, la copie de #vl-meta dérivait n'importe où, et la forme
  // ne peignait plus qu'un aplat bleu uni dessus, sans aucun texte blanc découpé.
  const STICKY_SELECTOR = '.vl-meta, .about-card, .xp-bento-stick';
  let stickyPairs = [];

  // Ordonnée d'un nœud de la copie dans son repère de mise en page, en remontant la chaîne des
  // offsetParent jusqu'à .page-blob-clone (seul ancêtre positionné). Ne tient compte d'AUCUNE
  // transform — ni celle qui simule le défilement sur .page-blob-clone-shift, ni celles que
  // syncTransforms recopie : c'est bien la position « au repos » qu'on veut ici.
  function staticTopOf(node) {
    let y = 0;
    for (let n = node; n && n !== cloneBox; n = n.offsetParent) y += n.offsetTop;
    return y;
  }

  function collectSticky() {
    stickyPairs = [];
    document.querySelectorAll(STICKY_SELECTOR).forEach((src) => {
      if (src.closest(EXCLUDE_SELECTOR)) return;
      const copy = counterpartOf(src);
      if (!copy || !copy.parentElement || !src.parentElement) return;
      // Décalage de l'élément DANS SON PARENT, au repos. Mesuré une fois par reconstruction (la
      // mise en page ne bouge pas entre deux) plutôt que par image : une remontée d'offsetTop
      // force un recalcul de mise en page.
      const offsetInParent = staticTopOf(copy) - staticTopOf(copy.parentElement);
      stickyPairs.push({ src, copy, offsetInParent });
    });
  }

  // Déplacement dû au figement = écart actuel entre l'élément et son parent, moins l'écart
  // qu'ils ont au repos. Vaut 0 tant que l'élément n'est pas figé, et croît exactement comme le
  // figement pendant qu'il l'est.
  //
  // Mesuré RELATIVEMENT AU PARENT, et non en coordonnées de document, parce que les deux
  // subissent à l'identique les transforms de leurs ancêtres — qui s'annulent donc dans la
  // soustraction. Un calcul en coordonnées de document, lui, absorbait le translateY du parallax
  // de #about (jusqu'à --about-lift, 220px) : la copie le recevait alors DEUX FOIS, une fois par
  // l'ancêtre que recopie syncTransforms et une fois par ce recalage, et la carte d'identité
  // comme le bento de l'accueil dérivaient d'autant. STICKY_SELECTOR ne contient plus d'élément
  // de la page veille (cf. plus haut), le défaut n'y était donc de toute façon plus observable.
  function syncSticky() {
    let changed = false;
    for (const p of stickyPairs) {
      const d = rectOf(p.src).top - rectOf(p.src.parentElement).top - p.offsetInParent;
      const t = Math.abs(d) < 0.5 ? '' : `translateY(${d.toFixed(1)}px)`;
      if (setStyle(p.copy, 'transform', t)) changed = true;
    }
    return changed;
  }

  /* ---------- recopie des classes pilotées par le scroll ---------- */

  // Certains effets ne passent NI par un style en ligne (donc invisibles pour syncTransforms) NI
  // par le survol (syncHover) : c'est une classe, posée en JS au fil du défilement, qui déclenche
  // une règle CSS. La copie, elle, fige la classe telle qu'elle était AU MOMENT DU CLONAGE — et
  // comme ces règles jouent sur l'opacité, une copie prise au mauvais moment reste durablement
  // invisible. La forme ne peint alors qu'un disque bleu plein, sans le moindre texte blanc
  // découpé : pas un décalage (l'alignement peut être parfait), mais bien du contenu ABSENT.
  //
  //   - .vl-meta-line / .is-visible — les lignes de la phrase de stats de la page veille sont à
  //     opacity:0 au repos et ne sont révélées qu'une à une par le scrub (applySteps dans
  //     js/veille.js). Le premier clonage a lieu bien avant, donc la copie était figée à
  //     opacity:0 : le texte « Les 10 actualités… » ne passait jamais en blanc sous la forme.
  //
  // Le rappel de retour (.details-link, ex-.dp-foot, cf. details.js/veille.js) n'a pas besoin
  // d'entrée ici : comme sur l'accueil, son apparition passe par --avatar-arm-opacity, posée en
  // continu à la fois sur l'avatar ET sur #contact (l'ancêtre commun) — la copie de #contact
  // recopie cette variable à chaque clonage/rebuild, pas besoin d'un suivi image par image.
  //
  // Rien à faire pour .is-spotlight / .is-showcasing (cartes du top 3) : elles passent devant la
  // forme (z-index, cf. .vl-showcase-pin dans veille.css), leur copie n'est donc jamais visible.
  const SYNCED_CLASSES = [
    { selector: '.vl-meta-line', cls: 'is-visible' },
  ];
  let classPairs = [];

  function collectClassPairs() {
    classPairs = [];
    for (const { selector, cls } of SYNCED_CLASSES) {
      document.querySelectorAll(selector).forEach((src) => {
        if (src.closest(EXCLUDE_SELECTOR)) return;
        const copy = counterpartOf(src);
        if (copy) classPairs.push({ src, copy, cls });
      });
    }
  }

  // Une lecture et (rarement) une écriture de classe par élément suivi — quelques-uns par page,
  // sans aucune mesure de mise en page : négligeable par image.
  function syncClasses() {
    let changed = false;
    for (const { src, copy, cls } of classPairs) {
      const on = src.classList.contains(cls);
      if (copy.classList.contains(cls) !== on) {
        copy.classList.toggle(cls, on);
        changed = true;
      }
    }
    return changed;
  }

  function syncHover(target) {
    const next = [];
    let node = target instanceof Element ? target.closest(HOVERABLE_SELECTOR) : null;
    if (node) {
      const copy = counterpartOf(node);
      // La lignée entière, comme :hover : un effet peut être écrit sur un ancêtre
      // (.dot-rail a:hover .dot-label) aussi bien que sur l'élément lui-même.
      for (let n = copy; n && n !== cloneShift; n = n.parentElement) next.push(n);
    }
    if (next.length === hoverMarked.length && next.every((n, i) => n === hoverMarked[i])) return;
    hoverMarked.forEach((n) => n.classList.remove(HOVER_CLASS));
    next.forEach((n) => n.classList.add(HOVER_CLASS));
    hoverMarked = next;
  }

  // Le { timeout } n'est PAS optionnel ici : sans lui, requestIdleCallback attend un vrai
  // moment de repos, qui peut ne jamais venir sur une page qui anime en permanence (boucle rAF
  // de l'écran d'accueil, frappe du terminal, morphing des pastilles). La copie n'était alors
  // jamais construite et le blob n'était qu'un disque bleu opaque posé sur le texte.
  const idle = window.requestIdleCallback
    ? (cb) => window.requestIdleCallback(cb, { timeout: 1500 })
    : (cb) => setTimeout(cb, 200);
  idle(rebuildClone);

  // cloneNode(true) de tout <body> n'est pas gratuit : sur les pages les plus riches (accueil,
  // détails — nombreuses icônes SVG, bannières, cartes), le refaire à intervalle régulier
  // suffisait à saccader tout le site, alors qu'il passait inaperçu sur des pages plus légères
  // (veille). Un MutationObserver sur <body> posait le même problème en pire : la page contient
  // du texte qui s'anime déjà en continu (frappe/effacement de "neofetch" dans le terminal au
  // repos...), qui le redéclenchait en quasi-permanence.
  //
  // La copie n'est donc reconstruite QUE sur des évènements ponctuels et rares — jamais sur une
  // minuterie — et chaque reconstruction est en plus posée en tâche de fond (requestIdleCallback,
  // hors du chemin des animations en cours), pour ne jamais entrer en concurrence avec le scroll
  // ou une frame du ressort. Le prix : un contenu très dynamique (calendrier, carrousel, saisie
  // du terminal) peut rester visible avec un léger retard sous la forme tant qu'aucun de ces
  // évènements ne survient — invisible en pratique, la forme ne s'y attarde jamais assez
  // longtemps pour que ça se remarque.
  let rebuildTimer = null;
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => idle(rebuildClone), 400);
  }
  document.addEventListener('langchange', scheduleRebuild);
  // Émis par js/veille.js (dumpAll/renderImpact) une fois le flux chargé par fetch — donc bien
  // après le premier clonage (idle, ci-dessus).
  document.addEventListener('veille-content-change', scheduleRebuild);

  // FILET GÉNÉRAL — tout ce qui change la HAUTEUR du document décale verticalement, dans la
  // copie, l'intégralité de ce qui se trouve en dessous : le contenu ne tombe plus sur son
  // original, et la forme tranche alors un aplat blanc franc n'importe où, sans rapport avec
  // ce qu'elle survole vraiment. La page veille en donnait quatre exemples à elle seule (flux
  // chargé par fetch, hauteur de piste du scrub posée puis reprise par layout(), même piste
  // libérée par finalize(), images du top 3 qui arrivent), et chacun a d'abord été traité à la
  // main avant qu'il ne devienne clair qu'ils n'étaient qu'un seul et même défaut.
  //
  // Un ResizeObserver sur <body> les attrape TOUS d'un coup, sans que chaque endroit qui
  // modifie la mise en page ait à penser à prévenir ce module — ce qu'aucune liste
  // d'évènements ne peut garantir sur la durée. Et contrairement au MutationObserver écarté
  // plus haut, il ne réagit pas au contenu qui s'anime en permanence (frappe du terminal, mot
  // du hero) : ces animations ne changent pas la hauteur du document, donc il reste muet.
  // Aucune boucle de rétroaction possible : la copie vit dans une fenêtre position:fixed, hors
  // du flux, elle ne compte donc pas dans la hauteur de <body>.
  if (window.ResizeObserver) {
    let lastBodyH = 0;
    new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      if (Math.abs(h - lastBodyH) < 1) return;
      lastBodyH = h;
      updateScrollMax();
      scheduleRebuild();
    }).observe(document.body);
  }
  window.addEventListener('resize', scheduleRebuild);

  /* ---------- décalage de scroll (aligne la copie sur ce qui est réellement affiché) ---------- */

  // Un scroll rapide/à l'inertie peut émettre l'évènement "scroll" plusieurs fois par image :
  // le travail réel (écrire la variable CSS) est donc reporté à la prochaine image plutôt que
  // rejoué à chaque évènement, pour ne jamais réécrire le style plus vite que l'écran ne peut
  // l'afficher.
  // Reste-t-il quelque chose à peindre ? Sert à arrêter complètement la boucle d'animation quand
  // le rognage ne laisse plus rien passer : sans ça, le ressort, les bulles et les écritures de
  // style continueraient de tourner à chaque image pour une forme invisible — du travail pur
  // perdu sur tout le reste de la page.
  let shapeVisible = true;
  // Dernier contour envoyé au clip-path, en coordonnées écran. Exposé (cf. window.PageBlobShape)
  // pour que js/cursor.js sache où la forme est RÉELLEMENT peinte : il doit inverser le point du
  // curseur exactement sur cette zone, et pas sur une approximation qui lui serait propre.
  let lastClip = null;

  // Ordonnée du bleu le plus haut à l'abscisse x, tous aplats confondus (Infinity si aucun
  // n'occupe cette colonne). On coupe chaque arête du polygone par la verticale d'abscisse x et
  // on garde l'intersection la plus haute : c'est exactement le bord supérieur peint à cet
  // endroit, diagonale comprise.
  function blueFrontierAt(polys, x) {
    let min = Infinity;
    for (const poly of polys) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        // Lecture par indice plutôt que par déstructuration : cette boucle tourne quelques
        // centaines de fois par image, et chaque déstructuration y allouerait un itérateur.
        const a = poly[j];
        const b = poly[i];
        const x1 = a[0];
        const y1 = a[1];
        const x2 = b[0];
        const y2 = b[1];
        if (x < Math.min(x1, x2) || x > Math.max(x1, x2)) continue;
        // Arête verticale : ses deux extrémités sont candidates, aucune interpolation possible.
        if (x1 === x2) {
          if (y1 < min) min = y1;
          if (y2 < min) min = y2;
          continue;
        }
        const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
        if (y < min) min = y;
      }
    }
    return min;
  }

  // Abscisses auxquelles échantillonner la frontière. Les sommets des polygones en font partie :
  // la frontière est linéaire par morceaux, et ses ruptures de pente tombent précisément là — les
  // omettre arrondirait les angles. Une grille régulière est ajoutée par-dessus pour approcher
  // finement les croisements entre deux aplats, seuls points de rupture que les sommets ne
  // donnent pas.
  //
  // La grille était à 64 pas. C'est beaucoup trop cher pour ce qu'elle apporte, et elle se paie
  // trois fois : au calcul (chaque pas coûte un parcours de toutes les arêtes de tous les
  // aplats), à l'écriture (un clip-path de ~70 sommets réécrit sur une fenêtre plein écran qui
  // contient une copie entière de la page), et au rendu (le moteur doit rogner sur ce contour à
  // chaque image). Or les SOMMETS, eux, sont exacts et toujours présents : la grille ne sert
  // qu'aux croisements entre deux aplats, où l'erreur d'un échantillonnage à 20 pas est de
  // quelques px sur une diagonale — invisible, et seulement là où deux bandeaux se recouvrent
  // (la page détails, jamais l'accueil ni la veille).
  const FRONTIER_STEPS = 20;
  // Réutilisé d'une image à l'autre plutôt que réalloué : cette fonction est appelée à chaque
  // image pendant tout un lissage de parallax.
  const frontierXs = [];
  function frontierSamples(polys, left, right) {
    frontierXs.length = 0;
    frontierXs.push(left, right);
    for (let i = 1; i < FRONTIER_STEPS; i++) frontierXs.push(left + ((right - left) * i) / FRONTIER_STEPS);
    for (const poly of polys) {
      for (const p of poly) {
        const px = p[0];
        if (px > left && px < right) frontierXs.push(px);
      }
    }
    return frontierXs.sort((a, b) => a - b);
  }

  // Dernier contour écrit dans le clip-path, sous sa forme sérialisée : tant que la frontière du
  // bleu ne bouge pas (c'est-à-dire tant qu'on ne défile pas et que le parallax est posé), la
  // réécrire à l'identique ferait re-rogner pour rien une fenêtre plein écran qui contient une
  // copie entière de la page.
  let lastClipText = '';

  function updateScroll() {
    setVar(blob, '--pgblob-scroll-y', `${window.scrollY}px`);
    // Filet supplémentaire au cas où le ResizeObserver manquerait (ou serait absent) : la
    // fonction ne touche au style que si la mesure a réellement bougé.
    syncCloneSize();
    // Les habillages fixes ne défilent pas, mais leur position À L'ÉCRAN peut changer sans
    // redimensionnement (transform d'un ancêtre, cf. plus haut) : on la revalide ici, où une
    // lecture de mise en page est de toute façon déjà faite pour le hero.
    positionFixedCopies();
    // Le figement dépend directement du défilement : c'est ici qu'il bouge, et la boucle
    // d'animation peut très bien être à l'arrêt (rien à peindre) au moment où il le fait.
    syncSticky();
    syncClasses();

    // SEULE limite de la forme : le BORD HAUT DU BLEU, qu'elle ne doit jamais dépasser. Elle est
    // libre partout au-dessus — toute la largeur de la fenêtre, jusqu'en haut — et n'est plus
    // confinée au hero. Un inset() rectangulaire ne pouvait pas suivre ce bord : il est en
    // diagonale (et incliné sur la page détails), donc une coupe horizontale posée à son point le
    // plus haut laissait un intervalle blanc partout ailleurs, tandis qu'une coupe plus basse
    // laissait la forme déborder sur le bleu — où la copie l'inverse en blanc, l'artefact en
    // travers du bandeau. D'où un polygone, échantillonné sur la frontière.
    const polys = window.BlueSurfaces ? window.BlueSurfaces.polygons() : [];

    const left = 0;
    // clientWidth, PAS innerWidth : les aplats bleus (.contact-fill & co) sont mesurés via
    // getBoundingClientRect(), qui s'arrête au bord réel du document — hors scrollbar verticale.
    // innerWidth, lui, l'inclut. L'écart (~15px selon les navigateurs) créait une colonne sans
    // aucun bleu détecté juste avant ce bord, où la frontière retombait au maxBottom avant de
    // remonter brutalement dès la vraie largeur — un point rentrant dans un contour que
    // clipToPolygon (plus bas dans js/cursor.js) suppose pourtant convexe. Un seul point rentrant
    // suffit à lui faire rejeter la totalité du blob, bien au-delà de cette colonne.
    const right = document.documentElement.clientWidth;
    // Sans aucun bleu dans une colonne (page veille, bandeau hors champ), rien ne borne la forme :
    // elle va jusqu'au bas de la fenêtre.
    const maxBottom = window.innerHeight;

    const pts = [[left, 0], [right, 0]];
    // Bord inférieur parcouru de la droite vers la gauche, pour fermer le contour dans le bon sens.
    const xs = frontierSamples(polys, left, right);
    let maxY = 0;
    for (let i = xs.length - 1; i >= 0; i--) {
      const x = xs[i];
      const y = Math.max(0, Math.min(maxBottom, blueFrontierAt(polys, x)));
      if (y > maxY) maxY = y;
      pts.push([x, y]);
    }

    // Le bleu recouvre toute la fenêtre : plus une seule bande libre au-dessus de lui.
    shapeVisible = maxY > 0;
    if (!shapeVisible) {
      // Polygone dégénéré plutôt qu'un inset : rien n'est peint, et la forme disparaît d'elle-même.
      if (lastClipText !== 'none') {
        lastClipText = 'none';
        viewport.style.clipPath = 'polygon(0 0, 0 0, 0 0)';
      }
      lastClip = null;
      return false;
    }
    const text = `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`;
    if (text !== lastClipText) {
      lastClipText = text;
      viewport.style.clipPath = text;
    }
    lastClip = pts;
    // La boucle a pu s'arrêter pendant que rien n'était peint : c'est ici, et nulle part ailleurs,
    // qu'on sait qu'il y a de nouveau quelque chose à animer.
    startLoop();
    // Un seul passage par réveil : le recalage ne dépend que du défilement et du parallax, tous
    // deux évènementiels.
    return false;
  }
  // Inscrit avant la boucle du ressort (cf. ORDER dans js/frame.js) : c'est lui qui décide si la
  // forme a encore quelque chose à peindre, et la boucle le lit dans la foulée.
  const scrollTask = window.FrameLoop.add(window.FrameLoop.ORDER.SCROLL, updateScroll);
  function scheduleScrollUpdate() {
    window.FrameLoop.wake(scrollTask);
  }
  // Premier calcul déclenché tout en bas du module, et non ici : updateScroll relance la boucle
  // d'animation (startLoop), qui lit des variables déclarées plus loin — les appeler maintenant
  // les toucherait avant leur initialisation.
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate);
  // Le bandeau bleu continue de bouger APRÈS le dernier évènement de défilement : le parallax
  // rattrape sa cible en douceur (lerp) pendant encore quelques images. Sans se recaler dessus,
  // le rognage resterait sur la position d'il y a quelques images et la forme mordrait sur le
  // bleu. Émis une fois par image par initAboutParallax, et seulement tant qu'il anime.
  window.addEventListener('parallax-tick', scheduleScrollUpdate);
  // syncTransforms/syncSticky tournent normalement dans frame(), la boucle à ressort du blob —
  // mais cette boucle s'arrête dès qu'il n'y a plus rien à peindre (!shapeVisible, cf. frame()),
  // ce qui arrive facilement pendant un lissage de parallax (la souris n'a pas forcément bougé).
  // Sans ce second appel, la copie de #about (et de tout ce que le parallax entraîne avec lui)
  // retardait alors sur l'original pendant tout le lissage — mesuré jusqu'à 48px d'écart en plein
  // milieu du mouvement — et la forme tranchait un aplat blanc le long de cet écart, ou décalait
  // la copie de .about-card/.xp-bento-stick recalée par syncSticky (qui hérite du retard de
  // l'ancêtre transformé sous lequel elle vit). initAboutParallax dispatche cet évènement à
  // chaque image tant qu'il anime, donc à une cadence largement suffisante pour rester en phase —
  // appelé directement ici, sans passer par une file requestAnimationFrame, pour ne perdre aucune
  // image de la synchronisation même quand frame() est arrêtée.
  window.addEventListener('parallax-tick', () => { syncTransforms(); syncSticky(); syncClasses(); });

  /* ---------- sillage de bulles (identique à initPreloaderBlob, js/main.js) ---------- */

  const BUBBLE_COUNT = 14;
  const SPAWN_STEP = 90;
  const MAX_PER_FRAME = 1;
  const BUBBLE_MIN = 3;
  const BUBBLE_MAX = 10;
  const LIFE_MIN = 0.9;
  const LIFE_MAX = 2.6;
  const LIFE_JITTER = 0.22;
  const INHERIT = 0.09;
  const SCATTER = 30;
  const DRAG = 2.8;
  const RISE = 28;
  const POP_S = 0.18;
  const RADIUS_JITTER = 16;

  function randomBlobRadius() {
    const r = [];
    for (let n = 0; n < 8; n++) r.push(`${Math.round(50 + (Math.random() * 2 - 1) * RADIUS_JITTER)}%`);
    return `${r.slice(0, 4).join(' ')} / ${r.slice(4).join(' ')}`;
  }

  const bubbles = [];
  if (!reduce) {
    for (let n = 0; n < BUBBLE_COUNT; n++) {
      const node = document.createElement('span');
      node.className = 'page-blob-bubble';
      bubbleLayer.appendChild(node);
      bubbles.push({ node, alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, rot: 0 });
    }
  }
  let nextBubble = 0;
  let travel = 0;

  function spawnBubble(px, py, svx, svy) {
    const b = bubbles[nextBubble];
    nextBubble = (nextBubble + 1) % bubbles.length;
    const size = BUBBLE_MIN + Math.random() * (BUBBLE_MAX - BUBBLE_MIN);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * blob.offsetWidth * 0.42;
    b.x = px + Math.cos(a) * r;
    b.y = py + Math.sin(a) * r;
    b.vx = svx * INHERIT + (Math.random() - 0.5) * SCATTER;
    b.vy = svy * INHERIT + (Math.random() - 0.5) * SCATTER;
    b.life = 0;
    const grow = (size - BUBBLE_MIN) / (BUBBLE_MAX - BUBBLE_MIN);
    b.max = LIFE_MIN + grow * (LIFE_MAX - LIFE_MIN) + (Math.random() - 0.5) * LIFE_JITTER;
    b.node.style.width = `${size.toFixed(1)}px`;
    b.node.style.height = `${(size * (0.82 + Math.random() * 0.36)).toFixed(1)}px`;
    b.node.style.setProperty('--bubble-radius', randomBlobRadius());
    b.rot = Math.random() * 360;
    b.alive = true;
  }

  // Renvoie le nombre de bulles encore en vie : la boucle du ressort ne peut pas s'endormir
  // tant qu'il en reste une à faire monter et s'effacer, même si la forme, elle, est posée.
  function updateBubbles(dt) {
    const damp = Math.exp(-DRAG * dt);
    let live = 0;
    for (const b of bubbles) {
      if (!b.alive) continue;
      b.life += dt;
      if (b.life >= b.max) {
        b.alive = false;
        b.node.style.opacity = '0';
        continue;
      }
      live++;
      b.vy -= RISE * dt;
      b.vx *= damp;
      b.vy *= damp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const pop = Math.min(b.life / POP_S, 1);
      const scale = 0.35 + 0.65 * pop * (2 - pop);
      const t = b.life / b.max;
      b.node.style.opacity = ((1 - t * t) * 0.9).toFixed(3);
      b.node.style.transform =
        `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0) translate(-50%, -50%) ` +
        `rotate(${b.rot.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
    }
    return live;
  }

  /* ---------- ressort à amortissement critique (identique à initPreloaderBlob) ---------- */

  const STIFFNESS = 14;
  const MAX_DT = 1 / 30;
  const REF_SPEED = 2000;
  const MAX_STRETCH = 1.2;
  const MIN_SPEED = 30;

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let x = targetX;
  let y = targetY;
  let vx = 0;
  let vy = 0;
  let placed = false;
  let looping = false;
  let prev = 0;
  let angle = 0;
  // En dessous, la forme est arrivée sur sa cible et n'a plus rien à intégrer : le ressort est
  // posé, l'étirement est revenu à 1. Un demi-pixel d'écart et 5 px/s de vitesse résiduelle sont
  // très en dessous de ce qui se voit.
  const REST_DIST = 0.5;
  const REST_SPEED = 5;

  // La forme suit le curseur PARTOUT sur la page : aucune zone ne l'éteint plus (ni la sortie du
  // hero, ni l'arrivée sur un aplat bleu, ni le défilement). C'est le rognage, et lui seul, qui
  // décide de ce qui reste visible — la forme ne peut jamais dépasser le bord haut du bleu.
  // Seule exception conservée : le curseur qui quitte la fenêtre, où il n'y a plus rien à suivre.
  function onMove(e) {
    syncHover(e.target);
    targetX = e.clientX;
    targetY = e.clientY;
    if (!placed) {
      placed = true;
      x = targetX;
      y = targetY;
      vx = 0;
      vy = 0;
      blob.classList.add('is-active');
    }
    // La souris a bougé : il y a de nouveau une cible à rattraper, même si la boucle s'était
    // endormie faute de mouvement.
    startLoop();
  }
  function onLeave() {
    placed = false;
    blob.classList.remove('is-active');
  }

  // Relance la boucle si elle s'était arrêtée (faute de zone à peindre, ou parce que tout
  // était posé).
  function startLoop() {
    if (looping) return;
    looping = true;
    prev = 0; // repart d'un dt nul plutôt que du temps écoulé pendant l'arrêt
    window.FrameLoop.wake(blobTask);
  }
  function stopLoop() {
    looping = false;
    return false;
  }

  function frame(now) {
    // Plus rien de peint : on rend la main au navigateur au lieu de continuer à intégrer le
    // ressort et les bulles dans le vide. Le défilement relancera la boucle en revenant.
    if (!shapeVisible) return stopLoop();
    const dt = prev ? Math.min((now - prev) / 1000, MAX_DT) : 0;
    prev = now;
    const fromX = x;
    const fromY = y;
    let liveBubbles = 0;
    let speed = 0;
    if (reduce) {
      x = targetX;
      y = targetY;
    } else if (dt) {
      const ax = STIFFNESS * STIFFNESS * (targetX - x) - 2 * STIFFNESS * vx;
      const ay = STIFFNESS * STIFFNESS * (targetY - y) - 2 * STIFFNESS * vy;
      vx += ax * dt;
      vy += ay * dt;
      x += vx * dt;
      y += vy * dt;

      speed = Math.hypot(vx, vy);
      if (speed > MIN_SPEED) angle = Math.atan2(vy, vx) * 180 / Math.PI;
      const stretch = 1 + Math.min(speed / REF_SPEED, 1) * (MAX_STRETCH - 1);
      setVar(blob, '--pgblob-angle', `${angle.toFixed(1)}deg`);
      setVar(blob, '--pgblob-stretch', stretch.toFixed(3));
      setVar(blob, '--pgblob-squash', (1 / stretch).toFixed(3));

      if (placed && bubbles.length) {
        travel += Math.hypot(x - fromX, y - fromY);
        let n = 0;
        while (travel >= SPAWN_STEP && n < MAX_PER_FRAME) {
          travel -= SPAWN_STEP;
          spawnBubble(x, y, vx, vy);
          n++;
        }
        if (n === MAX_PER_FRAME) travel = 0;
      }
      liveBubbles = updateBubbles(dt);
    }
    setVar(blob, '--pgblob-x', `${x.toFixed(1)}px`);
    setVar(blob, '--pgblob-y', `${y.toFixed(1)}px`);
    // Recopié ICI en plus de updateScroll : le "scroll" DOM n'est pas garanti de se déclencher à
    // chaque image pendant un défilement rapide/à l'inertie (les navigateurs peuvent le limiter à
    // moins d'une fois par image sous charge), alors que le défilement RÉEL, lui, continue d'avancer
    // à chaque image via le compositeur. Sans ce second point de synchronisation, le contenu recopié
    // dans la forme retardait de quelques images sur ce qui est réellement affiché à l'écran pendant
    // le scroll — un décalage vertical visible et grandissant tant que l'inertie dure.
    setVar(blob, '--pgblob-scroll-y', `${window.scrollY}px`);
    // Chacune de ces recopies dit si elle a réellement écrit quelque chose : c'est ce qui décide
    // de la mise en veille plus bas (cf. le commentaire qui l'accompagne).
    let busy = syncRailIndicator();
    if (syncTransforms()) busy = true;
    if (syncSticky()) busy = true;
    if (syncClasses()) busy = true;

    // Le curseur personnalisé (js/cursor.js) s'inverse en blanc sur la forme : il doit donc se
    // recalculer quand c'est ELLE qui bouge sous une souris immobile — le ressort met encore
    // quelques images à la rattraper après le dernier pointermove. Émis seulement si la forme
    // s'est réellement déplacée : une fois posée, le signal cesse, sinon cursor.js relancerait
    // un elementsFromPoint à chaque image pour un résultat identique.
    const moved = Math.hypot(x - fromX, y - fromY);
    if (moved > 0.3) {
      window.dispatchEvent(new Event('blob-tick'));
    }

    // MISE EN VEILLE — la souris passe l'essentiel du temps immobile, et cette boucle tournait
    // pourtant à chaque image du chargement à la fermeture de l'onglet : intégration du ressort,
    // écriture de cinq variables CSS, recopie des transforms, mesure des éléments figés… pour un
    // résultat rigoureusement identique d'une image à l'autre. On s'arrête donc dès que plus rien
    // ne bouge, comme le fait déjà js/dot-rail-magnet.js pour l'indicateur du rail.
    // Plusieurs choses peuvent encore bouger alors que la forme, elle, est posée — et chacune doit
    // retenir la boucle :
    //   - le ressort n'a pas fini de rattraper le curseur (distance ou vitesse résiduelle) ;
    //   - une bulle du sillage n'a pas fini de monter et de s'effacer ;
    //   - une des recopies ci-dessus a encore quelque chose à écrire (`busy`), ce qui couvre
    //     l'indicateur du rail en plein voyage, le parallax en cours de lissage, un élément figé
    //     qui glisse encore et les classes posées au fil du défilement.
    // Le réveil est assuré par onMove (la souris), par updateScroll (défilement, redimensionnement,
    // parallax) et par le premier calcul en bas de module.
    // (En mouvement réduit, x/y sautent directement sur la cible : les tests de repos sont alors
    // vrais d'office dès l'image qui suit le saut, et la boucle s'endort tout de suite.)
    const atRest = Math.abs(targetX - x) < REST_DIST && Math.abs(targetY - y) < REST_DIST
      && speed < REST_SPEED
      && moved <= 0.3;
    if (dt && atRest && !liveBubbles && !busy) return stopLoop();
    return true;
  }

  // Inscrite dans la boucle partagée AVANT les découpes de bouton et le curseur (cf. ORDER dans
  // js/frame.js) : ces deux-là consomment les variables --pgblob-* qu'on vient de poser, ils
  // travaillent donc sur la position de l'image courante et non sur celle de la précédente.
  const blobTask = window.FrameLoop.add(window.FrameLoop.ORDER.BLOB, frame);

  // Zone réellement peinte par la forme, pour js/cursor.js (qui doit y inverser son point en
  // blanc). Une seule source de vérité : c'est le contour effectivement passé au clip-path.
  // `painted` est indispensable À CÔTÉ de `clip` : celui-ci vaut null dans DEUX cas opposés —
  // rien à rogner (tout est peint) et rognage total (rien n'est peint, cf. !shapeVisible dans
  // updateScroll). Un consommateur qui lit clip() seul confond les deux et croit la forme
  // partout dès qu'elle a disparu.
  window.PageBlobShape = { clip: () => lastClip, painted: () => shapeVisible };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  // Le défilement n'éteint plus la forme ; c'est updateScroll qui relance la boucle dès qu'il y a
  // de nouveau une zone à peindre — d'où ce premier calcul, qui la démarre.
  updateScroll();
})();
