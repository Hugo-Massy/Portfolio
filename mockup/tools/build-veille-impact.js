#!/usr/bin/env node
/*
 * build-veille-impact.js — Complète les images manquantes de veille-impact.json.
 *
 * Contrairement à build-veille.js (flux automatique, régénéré et purgé en
 * entier à chaque run), veille-impact.json est un contenu écrit à la main et
 * permanent : ce script ne touche donc QUE le champ `image` des entrées qui en
 * sont dépourvues, et écrit les fichiers dans assets/veille-impact/ (jamais
 * purgé), sous un nom stable dérivé du lien source — jamais "top-N" comme le
 * flux principal, pour ne pas dépendre d'un ordre qui change à chaque build.
 *
 * Usage : node mockup/tools/build-veille-impact.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { fetchOgImage, downloadImage } = require('./build-veille.js');

const dataPath = path.join(__dirname, '..', 'js', 'veille-impact.json');
const assetsDir = path.join(__dirname, '..', 'assets', 'veille-impact');

// UA de navigateur plutôt que le bot déclaré du flux principal : ce script ne
// tourne qu'occasionnellement sur une poignée d'articles choisis à la main
// (pas de scraping en masse), et certains sites (Cloudflare) bloquent plus
// volontiers un User-Agent qui s'annonce comme bot que celui d'un navigateur.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function slugify(link) {
  return link
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  fs.mkdirSync(assetsDir, { recursive: true });

  let changed = 0;
  for (const e of data.entries) {
    if (e.image || !e.source || !e.source.link) continue;
    console.log(`  … ${e.title.slice(0, 60)}`);
    const og = await fetchOgImage(e.source.link, UA);
    if (!og) { console.log('    ∅ pas d\'og:image trouvée'); continue; }
    const base = slugify(e.source.link);
    const local = await downloadImage(og, assetsDir, base, UA);
    if (local) {
      e.image = local;
      changed++;
      console.log(`    ✓ ${local}`);
    } else {
      console.log('    ✗ téléchargement échoué');
    }
  }

  if (changed) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`\n✓ ${changed} image(s) renseignée(s) dans ${path.relative(process.cwd(), dataPath)}`);
  } else {
    console.log('\nAucune image à récupérer (déjà toutes renseignées, ou flux injoignable).');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
