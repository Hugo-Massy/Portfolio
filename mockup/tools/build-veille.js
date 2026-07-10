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
    });
  }

  // Tri antéchronologique ; les items sans date passent en fin.
  items.sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
  const trimmed = items.slice(0, 48);

  const out = {
    generatedAt: new Date().toISOString(),
    count: trimmed.length,
    sources: SOURCES.map((s) => ({ name: s.name, type: s.type, kind: s.kind })),
    pillars: Object.fromEntries(Object.entries(PILLARS).map(([k, v]) => [k, v.label])),
    items: trimmed,
  };

  const outPath = path.join(__dirname, '..', 'js', 'veille-data.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\n✓ ${trimmed.length} publications écrites dans ${path.relative(process.cwd(), outPath)}`);
  if (trimmed.length === 0) {
    console.error('Aucune publication récupérée — flux injoignables ?');
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
