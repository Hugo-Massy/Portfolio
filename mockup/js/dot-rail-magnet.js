// Le blob de section active (.dot-rail-indicator) se déforme mollement en direction du
// curseur quand celui-ci passe à proximité, comme une goutte qui se tend vers lui : seul
// l'avant (côté curseur) s'allonge, l'arrière reste ancré à sa place — contrairement à un
// simple scale symétrique qui étirerait les deux côtés à l'identique (effet "ballon de
// rugby" plat et peu naturel). L'ancrage arrière est obtenu en compensant le scale par une
// translation le long du même axe (rotate → translate → scale → rotate inverse), calculée
// pour que le bord arrière ne bouge jamais.
//
// En plus de ça, quand on clique un autre point (ou que le scroll-spy change de section),
// le blob voyage le long du rail via la transition CSS sur `top` (cf. styles.css) : pendant
// ce trajet, on mesure sa vitesse verticale image par image et on l'étire dans le sens du
// déplacement ("squash & stretch" classique de l'animation) — plus il va vite, plus il
// s'allonge, et il reprend sa forme ronde dès qu'il arrive et s'immobilise. On ne réimplémente
// pas le déplacement lui-même (toujours géré par le scroll-spy de main.js / details.js /
// veille.js) : on se contente d'observer offsetTop, que la transition CSS anime déjà.
(function () {
  const indicator = document.querySelector('.dot-rail-indicator');
  const rail = document.querySelector('.dot-rail');
  if (!indicator || !rail) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const RADIUS = 60;        // portée de l'attraction souris (px) : au-delà, plus de déformation
  const MAX_STRETCH = 0.3;  // allongement max vers le curseur (fraction du rayon du blob)
  const EASE = 0.2;         // inertie de la déformation vers le curseur
  // rayon non transformé du blob, lu une seule fois sur son layout (offsetWidth n'est
  // jamais affecté par `transform`, contrairement à getBoundingClientRect) : sert à calculer
  // de combien décaler l'ancrage pour compenser le scale.
  const BASE_RADIUS = indicator.offsetWidth / 2;

  const VELOCITY_NORM = 3;     // vitesse (px/frame) qui sature l'étirement de déplacement
  const MAX_VEL_STRETCH = 0.4; // allongement max le long du rail en pleine vitesse
  const VEL_EASE = 0.35;       // réactivité du squash & stretch

  const mouse = { x: -9999, y: -9999 };
  let stretch = 0;
  let velStretch = 0;
  let prevTop = indicator.offsetTop;

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  function tick() {
    // Centre réel (non transformé) du blob : offsetLeft/offsetTop sont relatifs à son
    // offsetParent (.dot-rail) et ignorent tout transform déjà appliqué, donc pas de
    // rétroaction avec la déformation qu'on est en train de calculer. offsetTop, lui,
    // reflète bien la position courante animée par la transition CSS sur `top`.
    const top = indicator.offsetTop;
    const railRect = rail.getBoundingClientRect();
    const cx = railRect.left + indicator.offsetLeft + indicator.offsetWidth / 2;
    const cy = railRect.top + top + indicator.offsetHeight / 2;
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const dist = Math.hypot(dx, dy);

    const targetStretch = dist < RADIUS ? (1 - dist / RADIUS) * MAX_STRETCH : 0;
    const angle = Math.atan2(dy, dx);
    stretch += (targetStretch - stretch) * EASE;

    const sx = 1 + stretch;
    const sy = 1 - stretch * 0.12;
    // décale l'ancrage vers l'avant de la moitié de l'allongement, pour que le bord arrière
    // (opposé au curseur) reste exactement là où il était avant déformation.
    const tx = BASE_RADIUS * stretch;

    // vitesse de déplacement le long du rail (toujours vertical) : plus le blob voyage vite
    // entre deux points, plus il s'étire dans le sens du trajet.
    const speed = Math.min(Math.abs(top - prevTop) / VELOCITY_NORM, 1);
    prevTop = top;
    velStretch += (speed * MAX_VEL_STRETCH - velStretch) * VEL_EASE;
    const velSy = 1 + velStretch;
    const velSx = 1 - velStretch * 0.3;

    indicator.style.transform =
      `translateY(-50%) scale(${velSx.toFixed(3)}, ${velSy.toFixed(3)}) ` +
      `rotate(${angle}rad) translate(${tx.toFixed(2)}px,0) ` +
      `scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${-angle}rad)`;

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
