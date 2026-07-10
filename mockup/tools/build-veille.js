#!/usr/bin/env node
/*
 * build-veille.js — Générateur de la veille technologique du portfolio.
 *
 * Exécuté côté serveur (GitHub Actions, cron) — JAMAIS dans le navigateur — pour :
 *   1. récupérer les flux RSS des sources cyber choisies (CERT-FR/ANSSI + presse),
 *   2. normaliser chaque publication (titre, lien, date, résumé propre),
 *   3. la corréler aux 4 piliers de compétences et aux projets du portfolio,
 *   4. écrire mockup/js/veille-data.json que la page veille.html se contente de lire.
 *
 * Aucune dépendance npm : fetch natif (Node 18+) + un petit parseur RSS maison.
 * Aucune clé d'API : toutes les sources sont des flux publics.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Fenêtre glissante : on ne conserve que les publications des 3 derniers jours.
const WINDOW_DAYS = 3;

// --------------------------------------------------------------------------
// Sources — flux RSS publics. `type` sert au style (officiel vs presse).
// --------------------------------------------------------------------------
const SOURCES = [
  { id: 'certfr-alerte',   name: 'CERT-FR',           type: 'official', kind: 'alerte',    url: 'https://www.cert.ssi.gouv.fr/alerte/feed/' },
  { id: 'certfr-avis',     name: 'CERT-FR',           type: 'official', kind: 'avis',      url: 'https://www.cert.ssi.gouv.fr/avis/feed/' },
  { id: 'certfr-actu',     name: 'CERT-FR',           type: 'official', kind: 'actualité', url: 'https://www.cert.ssi.gouv.fr/actualite/feed/' },
  { id: 'thehackernews',   name: 'The Hacker News',   type: 'press',    kind: 'article',   url: 'https://feeds.feedburner.com/TheHackersNews' },
  { id: 'bleepingcomputer',name: 'BleepingComputer',  type: 'press',    kind: 'article',   url: 'https://www.bleepingcomputer.com/feed/' },
];

// --------------------------------------------------------------------------
// Corrélation — mots-clés → pilier de compétence + outils/projets du portfolio.
// L'ordre des piliers sert de priorité quand un item matche plusieurs familles.
// --------------------------------------------------------------------------
const PILLARS = {
  security: {
    label: { fr: 'Sécurité défensive', en: 'Defensive security', es: 'Seguridad defensiva' },
    keywords: [
      ['Wazuh', /\bwazuh\b/i], ['Suricata', /\bsuricata\b/i], ['SIEM', /\bsiem\b/i],
      ['IDS/IPS', /\bid[sp]s?\b|intrusion detection/i], ['Honeypot', /\bhoneypot|t-?pot\b/i],
      ['Ransomware', /\bransomware|ran[çc]ongiciel/i], ['Phishing', /\bphishing|hame[çc]onnage/i],
      ['Malware', /\bmalware|maliciel|trojan|backdoor|spyware|infostealer/i],
      ['Bruteforce', /\bbrute[- ]?force|credential stuffing/i],
      ['Exploit', /\bexploit|rce|remote code execution|0-?day|zero-?day/i],
      ['CVE', /\bcve-\d{4}-\d+|vuln[eé]rabilit/i], ['ISO 27001', /\biso ?27001|iso27k/i],
      ['SOC/EDR', /\bsoc\b|\bedr\b|\bxdr\b|threat hunting/i],
      ['Fail2ban', /\bfail2ban\b/i], ['OWASP', /\bowasp\b/i],
    ],
  },
  sysadmin: {
    label: { fr: 'Administration systèmes', en: 'Systems administration', es: 'Administración de sistemas' },
    keywords: [
      ['Active Directory', /\bactive directory|\bad\b|ntlm|kerberos|ldap/i],
      ['Entra ID', /\bentra|azure ad/i], ['Windows Server', /\bwindows server|windows\b/i],
      ['PowerShell', /\bpowershell\b/i], ['GLPI', /\bglpi\b/i],
      ['Debian/Linux', /\bdebian|linux|ubuntu|systemd|sudo\b/i],
      ['GPO', /\bgpo\b|group policy/i], ['Microsoft 365', /\bmicrosoft 365|office 365|\bm365\b|exchange|sharepoint/i],
      ['Ansible', /\bansible\b/i], ['Sauvegarde', /\bbackup|sauvegarde|veeam/i],
    ],
  },
  infra: {
    label: { fr: 'Infrastructure & Cloud', en: 'Infrastructure & Cloud', es: 'Infraestructura y Cloud' },
    keywords: [
      ['Cloudflare', /\bcloudflare\b/i], ['Docker', /\bdocker\b/i], ['Kubernetes', /\bkubernetes|k8s\b/i],
      ['Azure', /\bazure\b/i], ['AWS', /\baws|amazon web/i], ['VMware', /\bvmware|esxi|vcenter|vsphere/i],
      ['pfSense/FW', /\bpfsense|firewall|pare-feu|\bvpn\b|\bwaf\b/i],
      ['Zabbix', /\bzabbix\b/i], ['Grafana', /\bgrafana|prometheus/i],
      ['Nextcloud', /\bnextcloud\b/i], ['Réseau', /\bnetwork|r[eé]seau|\bbgp\b|\bdns\b|\bvlan\b|routeur|router/i],
      ['Nginx', /\bnginx|apache|reverse proxy/i], ['OVHcloud', /\bovh\b|ovhcloud/i],
    ],
  },
  dev: {
    label: { fr: 'Dev & Automatisation', en: 'Dev & Automation', es: 'Desarrollo y Automatización' },
    keywords: [
      ['Python', /\bpython\b/i], ['PHP', /\bphp\b/i], ['JavaScript', /\bjavascript|node\.?js|npm\b/i],
      ['Git', /\bgit\b|github|gitlab/i], ['API', /\bapi\b|rest api/i],
      ['CI/CD', /\bci\/cd|pipeline|devops|devsecops/i], ['Supply chain', /\bsupply[- ]chain/i],
      ['IA/LLM', /\b(ia|ai|llm|gpt|mistral|claude|copilot)\b|intelligence artificielle/i],
    ],
  },
};

// Résonance avec les projets concrets du portfolio (bonus de contexte).
const PROJECTS = [
  { id: 'massy-innove', label: { fr: 'Massy Innove — IA souveraine', en: 'Massy Innove — sovereign AI', es: 'Massy Innove — IA soberana' }, test: /\b(mistral|llm|ia|ai|intelligence artificielle|argon2|souverain|sovereign)\b/i },
  { id: 'homelab',      label: { fr: 'Homelab', en: 'Homelab', es: 'Homelab' }, test: /\b(nextcloud|debian|cloudflare tunnel|self-?host|homelab)\b/i },
  { id: 'supervision',  label: { fr: 'Supervision 24/7', en: '24/7 monitoring', es: 'Supervisión 24/7' }, test: /\b(zabbix|grafana|prometheus|monitoring|supervision|uptime)\b/i },
];

// --------------------------------------------------------------------------
// Parseur RSS minimal (RSS 2.0 / Atom) — suffisant pour les champs qu'on affiche.
// --------------------------------------------------------------------------
function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#039;|&apos;/gi, "'")
    .replace(/&hellip;/gi, '…').replace(/&rsquo;|&#8217;/gi, '’')
    .replace(/\s+/g, ' ').trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function pickLink(block) {
  // RSS : <link>url</link> ; Atom : <link href="url" .../>
  const rss = block.match(/<link>([\s\S]*?)<\/link>/i);
  if (rss && rss[1].trim()) return decodeEntities(rss[1]);
  const atom = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return atom ? atom[1] : '';
}

// Image « à la source » : on la cherche directement dans le bloc RSS brut (donc
// AVANT decodeEntities qui, lui, supprime tout le HTML). Ordre de préférence :
// Media RSS → enclosure typée image → premier <img> du résumé/contenu.
function pickImage(block) {
  let m = block.match(/<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"/i);
  if (m) return m[1];
  m = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image\//i)
    || block.match(/<enclosure[^>]*type="image\/[^"]*"[^>]*\burl="([^"]+)"/i);
  if (m) return m[1];
  m = block.match(/<img[^>]*\bsrc="([^"]+)"/i);
  if (m) return m[1];
  return '';
}

// Fallback réseau : quand le flux n'expose aucune image, on va chercher la balise
// Open Graph (og:image) — présente sur la quasi-totalité des pages d'articles —
// à défaut twitter:image. Réservé au top 3 pour rester à ≤ 3 requêtes en plus.
async function fetchOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PortfolioVeilleBot/1.0 (+https://github.com/Hugo-Massy/Portfolio)' },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const html = await res.text();
    // Les balises meta varient : guillemets simples OU doubles, et l'attribut
    // content parfois avant, parfois après property/name (ex. The Hacker News
    // utilise content='…' property='og:image'). On couvre les deux ordres et
    // les deux styles de guillemets, sinon l'og:image passe inaperçue.
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      || html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
    return m ? decodeEntities(m[1]) : '';
  } catch {
    return '';
  }
}

function parseFeed(xml) {
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const tag = isAtom ? 'entry' : 'item';
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'gi');
  const blocks = xml.match(re) || [];
  return blocks.map((b) => ({
    title: pick(b, 'title'),
    link: pickLink(b),
    date: pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || pick(b, 'dc:date'),
    summary: pick(b, 'description') || pick(b, 'summary') || pick(b, 'content'),
    image: pickImage(b),
  })).filter((it) => it.title && it.link);
}

// Mots-clés « génériques » : signalent bien la cyber, mais ne doivent PAS à eux
// seuls décider du pilier — sinon tout avis CVE finit dans « Sécurité ». On leur
// donne un faible poids pour qu'une techno précise (GitLab→Dev, Juniper→Infra)
// l'emporte quand elle est présente.
const GENERIC_TAGS = new Set(['CVE', 'Exploit']);

// --------------------------------------------------------------------------
// Corrélation d'un item aux piliers / projets du portfolio.
// Le pilier retenu est celui qui cumule le plus de correspondances *spécifiques* ;
// à égalité, l'ordre de déclaration des piliers tranche. « Sécurité » reste le
// filet de sécurité quand seul un signal générique (CVE, exploit) est présent.
// --------------------------------------------------------------------------
function correlate(item) {
  const hay = `${item.title} ${item.summary}`;
  const tags = [];
  const scores = {};
  for (const [key, def] of Object.entries(PILLARS)) {
    scores[key] = 0;
    for (const [label, rx] of def.keywords) {
      if (rx.test(hay)) {
        scores[key] += GENERIC_TAGS.has(label) ? 0.3 : 1;
        if (!tags.includes(label)) tags.push(label);
      }
    }
  }
  let pillar = null;
  let best = 0;
  for (const key of Object.keys(PILLARS)) {
    if (scores[key] > best) { best = scores[key]; pillar = key; }
  }
  // Réordonne les tags pour montrer d'abord la techno concrète, le générique ensuite.
  tags.sort((a, b) => (GENERIC_TAGS.has(a) ? 1 : 0) - (GENERIC_TAGS.has(b) ? 1 : 0));
  const projects = PROJECTS.filter((p) => p.test.test(hay)).map((p) => p.id);
  return { pillar, tags: tags.slice(0, 4), projects };
}

function severityOf(source, item) {
  if (source.kind === 'alerte') return 'high';
  if (source.kind === 'avis') return 'medium';
  if (/\bcritical|critique|activement exploit|actively exploit|zero-?day|0-?day\b/i.test(`${item.title} ${item.summary}`)) return 'high';
  return 'info';
}

// Téléchargement local d'une image : on rapatrie les octets dans assets/veille/
// pour SERVIR l'image en même origine. Le navigateur n'a alors plus à joindre un
// hôte externe (fini les blocages proxy / anti-hotlink / indispos). Renvoie le
// chemin web relatif à veille.html, ou '' en cas d'échec.
const IMG_EXT_BY_TYPE = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
};

async function downloadImage(url, destDir, base) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PortfolioVeilleBot/1.0 (+https://github.com/Hugo-Massy/Portfolio)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    let ext = IMG_EXT_BY_TYPE[ct];
    if (!ext) {
      const m = url.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i);
      ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
    }
    const filename = `${base}.${ext}`;
    fs.writeFileSync(path.join(destDir, filename), Buffer.from(await res.arrayBuffer()));
    return `assets/veille/${filename}`;
  } catch (err) {
    console.warn(`    ⚠ téléchargement image échoué (${err.message}) — repli sur l'URL distante`);
    return '';
  }
}

// --------------------------------------------------------------------------
// Score d'importance — DOIT rester identique à importance() de veille.js pour
// que le top 3 « imagé » au build coïncide avec le top 3 affiché côté client.
// --------------------------------------------------------------------------
const IMPORTANCE_SIGNALS = [
  [50, /actively exploit|exploited in the wild|activement exploit|exploitation active|\bkev\b|known exploited|zero-?day|0-?day|jour[- ]?z[eé]ro/i],
  [35, /ransomware|ran[cç]ongiciel|data breach|fuite de donn|supply[- ]chain|cha[îi]ne d'approvisionnement|breach|piratage/i],
  [30, /\bcritical\b|critique|\brce\b|remote code execution|ex[eé]cution de code|unauthenticated|pre-?auth|non authentifi/i],
  [20, /emergency|urgent|patch now|out-?of-?band|correctif d'urgence|hotfix/i],
  [18, /millions?|thousands?|widespread|massive|worldwide|global|des milliers|des millions|à grande échelle/i],
  [12, /privilege escalation|[eé]l[eé]vation de privil|takeover|prise de contr[ôo]le|bypass|contournement|exfiltrat/i],
  [14, /microsoft|windows|\boffice\b|exchange|outlook|azure|google|chrome|android|apple|\bios\b|macos|cisco|fortinet|forti|ivanti|citrix|vmware|palo alto|\bsap\b|oracle|openssh|openssl|wordpress|linux kernel|kubernetes|docker/i],
];
const SEV_BASE = { high: 40, medium: 18, info: 6 };

function importance(it) {
  let score = SEV_BASE[it.severity] || 0;
  const hay = `${it.title || ''} ${it.summary || ''}`;
  for (const [w, rx] of IMPORTANCE_SIGNALS) if (rx.test(hay)) score += w;
  if (it.sourceType === 'official') score += 8;
  const ageDays = (Date.now() - (Date.parse(it.date) || Date.now())) / 86400000;
  if (isFinite(ageDays)) score += Math.max(0, 12 - ageDays);
  return score;
}

async function fetchFeed(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'PortfolioVeilleBot/1.0 (+https://github.com/Hugo-Massy/Portfolio)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml);
    console.log(`  ✓ ${source.name}/${source.kind} — ${items.length} items`);
    return items.map((it) => ({ ...it, source }));
  } catch (err) {
    console.warn(`  ✗ ${source.name}/${source.kind} — ${err.message}`);
    return [];
  }
}

function toISO(dateStr) {
  const d = new Date(dateStr);
  return isNaN(d) ? null : d.toISOString();
}

async function main() {
  console.log('Veille — récupération des flux…');
  const settled = await Promise.all(SOURCES.map(fetchFeed));
  const raw = settled.flat();

  const seen = new Set();
  const items = [];
  for (const it of raw) {
    const iso = toISO(it.date);
    const link = it.link.trim();
    if (!link || seen.has(link)) continue;
    seen.add(link);
    const { pillar, tags, projects } = correlate(it);
    const summary = it.summary.length > 240 ? it.summary.slice(0, 237).trimEnd() + '…' : it.summary;
    items.push({
      source: it.source.name,
      sourceType: it.source.type,
      kind: it.source.kind,
      title: it.title,
      link,
      date: iso,
      summary,
      pillar,
      pillarLabel: pillar ? PILLARS[pillar].label : null,
      tags,
      projects,
      severity: severityOf(it.source, it),
      image: null,          // renseigné plus bas, uniquement pour le top 3
      _rssImage: it.image,  // image trouvée dans le flux (temporaire, retirée avant écriture)
    });
  }

  // Tri antéchronologique.
  items.sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));

  // Fenêtre glissante : on ne garde que les publications des WINDOW_DAYS derniers
  // jours (les items sans date exploitable sont écartés, faute de pouvoir les situer).
  const cutoff = Date.now() - WINDOW_DAYS * 86400000;
  const windowed = items.filter((it) => it.date && Date.parse(it.date) >= cutoff);

  // Top 10 « imagé » — DOIT rester égal au RETAINED de veille.js (dumpAll) :
  // on descend le classement par importance et on va chercher une image pour
  // chacun des 10 retenus (top 3 en cartes + 7 en liste côté front). Un item
  // qui reste sans image (RSS ni og:image introuvables) retombe sur le
  // placeholder d'initiale côté client. Image de flux d'abord (gratuite) ; à
  // défaut, fallback og:image dans une enveloppe de requêtes bornée.
  // On repart d'un dossier d'images propre pour ne pas accumuler d'orphelins.
  const veilleAssetsDir = path.join(__dirname, '..', 'assets', 'veille');
  fs.rmSync(veilleAssetsDir, { recursive: true, force: true });
  fs.mkdirSync(veilleAssetsDir, { recursive: true });

  const RETAINED = 10;
  const ranked = [...windowed].sort((a, b) => importance(b) - importance(a)).slice(0, RETAINED);
  console.log(`\nSélection du top ${RETAINED} imagé…`);
  let fetchBudget = 16;
  let imaged = 0;
  for (const it of ranked) {
    let src = it._rssImage || '';
    if (!src && fetchBudget > 0) { fetchBudget--; src = await fetchOgImage(it.link); }
    if (!src) { console.log(`  ∅ (pas d'image trouvée) ${it.title.slice(0, 46)}`); continue; }
    // Rapatriement en local ; repli sur l'URL distante si le téléchargement échoue.
    const local = await downloadImage(src, veilleAssetsDir, `top-${imaged + 1}`);
    it.image = local || src;
    imaged++;
    console.log(`  ✓ ${local ? '[local] ' : '[distant] '}${it.title.slice(0, 52)}`);
  }
  // Nettoyage du champ interne avant écriture.
  for (const it of windowed) delete it._rssImage;

  const out = {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    count: windowed.length,
    sources: SOURCES.map((s) => ({ name: s.name, type: s.type, kind: s.kind })),
    pillars: Object.fromEntries(Object.entries(PILLARS).map(([k, v]) => [k, v.label])),
    items: windowed,
  };

  const outPath = path.join(__dirname, '..', 'js', 'veille-data.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\n✓ ${windowed.length} publications (fenêtre ${WINDOW_DAYS} j) écrites dans ${path.relative(process.cwd(), outPath)}`);
  if (windowed.length === 0) {
    console.error('Aucune publication dans la fenêtre — flux injoignables ?');
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
