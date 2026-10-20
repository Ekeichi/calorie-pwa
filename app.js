// ===== Compteur de calories =====
// Données en localStorage :
//   cal:goal         objectif kcal (nombre)
//   cal:macros       objectifs de macros optionnels { p, c, f } en g
//   cal:YYYY-MM-DD   entrées du jour : [{ id, meal, name, code?, unit, base, qty }]
//                    unit 'g'       -> base = valeurs pour 100 g, qty en grammes
//                    unit 'portion' -> base = valeurs pour 1 portion, qty en portions
//   cal:recents      20 derniers aliments (même forme, sans id ni meal)
//   cal:products     cache des produits scannés : code -> { name, kcal, p, c, f } pour 100 g
//   cal:profile      profil Zero to Hero { age, taille, poids, bodyfat, protocole }
//   cal:stage        étape active du plan (0, 1 ou 2), ou null = objectifs manuels
const $ = (id) => document.getElementById(id);
const MEALS = { breakfast: 'Petit-déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', snack: 'Collations' };
const RING = 2 * Math.PI * 52; // circonférence de l'anneau (r = 52)
const DEL_W = 96; // largeur du bouton "Supprimer" révélé par swipe
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let day = new Date(); // jour affiché
let addMeal = 'breakfast'; // repas sélectionné dans l'écran Ajouter

// ---------- Stockage et utilitaires ----------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Nombre saisi au clavier FR ("12,5") -> 12.5 ; undefined si vide
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : undefined; };
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');

// Entrées du jour affiché (avec migration des entrées v1 : { name, kcal, p, c, f })
function getEntries() {
  return load('cal:' + keyOf(day), []).map((e, i) => e.base ? e : {
    id: 'v1-' + i, meal: 'snack', name: e.name, unit: 'portion', qty: 1,
    base: { kcal: e.kcal, p: e.p, c: e.c, f: e.f },
  });
}
const setEntries = (list) => save('cal:' + keyOf(day), list);

// Valeurs réelles d'un aliment pour une quantité
function values(food, qty = food.qty) {
  const r = food.unit === 'g' ? qty / 100 : qty;
  const m = (v) => (v == null ? undefined : Math.round(v * r * 10) / 10);
  return { kcal: Math.round((food.base.kcal || 0) * r), p: m(food.base.p), c: m(food.base.c), f: m(food.base.f) };
}
const qtyLabel = (food, qty = food.qty) =>
  food.unit === 'g' ? `${fmt(qty)} g` : `${fmt(qty)} portion${qty > 1 ? 's' : ''}`;

// Repas par défaut selon l'heure
function mealByHour(h = new Date().getHours()) {
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
}

// "Aujourd'hui", "Hier" ou date longue
function label(d) {
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Compteur animé (désactivé si prefers-reduced-motion)
function animateNumber(el, to) {
  const from = Number(el.dataset.v ?? to);
  el.dataset.v = to;
  if (reduceMotion.matches || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 250);
    el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1 && el.dataset.v == to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2000);
}

// Pastilles de macros colorées (fiche aliment)
function macroChips(el, v) {
  el.replaceChildren();
  [['p', 'prot.'], ['c', 'gluc.'], ['f', 'lip.']].forEach(([k, l]) => {
    if (v[k] == null) return;
    const s = document.createElement('span');
    s.className = k;
    s.innerHTML = '<i class="dot"></i>';
    s.append(`${fmt(v[k])} g ${l}`);
    el.append(s);
  });
}

// ---------- Écran Journal ----------
function renderJournal() {
  const entries = getEntries();
  const goal = load('cal:goal', 2000);
  const mg = load('cal:macros', {});
  const tot = { kcal: 0, p: 0, c: 0, f: 0 };
  entries.forEach((e) => { const v = values(e); for (const k in tot) tot[k] += v[k] || 0; });
  const left = goal - tot.kcal;
  const ratio = goal ? tot.kcal / goal : 0;

  $('date').textContent = label(day);
  $('next').disabled = keyOf(day) === keyOf(new Date()); // pas de futur

  // Anneau : progression plafonnée à 100 %, orange au-delà (sans message culpabilisant)
  $('ring-fill').style.strokeDashoffset = RING * (1 - Math.min(ratio, 1));
  $('ring-fill').style.opacity = ratio > 0 ? 1 : 0;
  $('summary').dataset.state = left < 0 ? 'over' : left === 0 && goal ? 'ok' : '';
  animateNumber($('left'), Math.abs(left));
  $('left-label').textContent = left < 0 ? 'au-delà' : 'restantes';
  $('goal-val').textContent = goal;
  animateNumber($('eaten'), tot.kcal);

  // Macros : "xx / objectif g", ou seulement les grammes sans objectif
  for (const k of ['p', 'c', 'f']) {
    $('m-' + k).textContent = mg[k] ? `${fmt(tot[k])} / ${fmt(mg[k])} g` : `${fmt(tot[k])} g`;
    $('bar-' + k).style.width = mg[k] ? Math.min(100, (tot[k] / mg[k]) * 100) + '%' : '0';
    $('bar-' + k).parentElement.hidden = !mg[k];
  }

  // Sections de repas
  const box = $('meals');
  box.replaceChildren();
  for (const [meal, title] of Object.entries(MEALS)) {
    const card = $('tpl-meal').content.firstElementChild.cloneNode(true);
    const list = entries.filter((e) => e.meal === meal);
    card.querySelector('h2').textContent = title;
    card.querySelector('.meal-kcal').textContent = list.length ? list.reduce((s, e) => s + values(e).kcal, 0) + ' kcal' : '';
    const add = card.querySelector('.meal-add');
    add.setAttribute('aria-label', 'Ajouter au ' + title.toLowerCase());
    add.onclick = () => { addMeal = meal; showTab('add'); };
    card.querySelector('.empty').hidden = list.length > 0;
    list.forEach((e) => card.querySelector('.entries').append(entryRow(e)));
    box.append(card);
  }
}

// Ligne d'entrée : tap = modifier, swipe gauche = révéler "Supprimer"
function entryRow(e) {
  const li = $('tpl-entry').content.firstElementChild.cloneNode(true);
  const main = li.querySelector('.entry-main');
  li.querySelector('.entry-name').textContent = e.name;
  li.querySelector('.entry-qty').textContent = qtyLabel(e);
  li.querySelector('.entry-kcal').textContent = values(e).kcal + ' kcal';
  main.setAttribute('aria-label', `${e.name}, ${qtyLabel(e)}, ${values(e).kcal} kcal. Modifier`);
  li.querySelector('.entry-del').setAttribute('aria-label', 'Supprimer ' + e.name);
  li.querySelector('.entry-del').onclick = () => deleteEntry(e.id);

  let x0 = null, dx = 0, open = false, moved = false;
  const place = (x) => { main.style.transform = x ? `translateX(${x}px)` : ''; };
  main.addEventListener('pointerdown', (ev) => {
    x0 = ev.clientX; dx = open ? -DEL_W : 0; moved = false; main.style.transition = 'none';
  });
  main.addEventListener('pointermove', (ev) => {
    if (x0 === null) return;
    if (Math.abs(ev.clientX - x0) > 8) moved = true;
    dx = Math.max(-DEL_W * 1.3, Math.min(0, ev.clientX - x0 + (open ? -DEL_W : 0)));
    if (moved) place(dx);
  });
  const end = (cancel) => {
    if (x0 === null) return;
    x0 = null; main.style.transition = '';
    if (moved && !cancel) open = dx < -DEL_W / 2;
    place(open ? -DEL_W : 0);
  };
  main.addEventListener('pointerup', () => end(false));
  main.addEventListener('pointercancel', () => end(true)); // scroll vertical pris par le navigateur
  main.addEventListener('click', () => {
    if (moved) return; // fin d'un swipe, pas un tap
    if (open) { open = false; place(0); } else openFood(e, e.id);
  });
  return li;
}

function deleteEntry(id) {
  setEntries(getEntries().filter((e) => e.id !== id));
  renderJournal();
  toast('Supprimé');
}

// Navigation entre les jours (flèches + swipe horizontal hors des entrées)
function shift(n) {
  const next = new Date(day);
  next.setDate(day.getDate() + n);
  if (keyOf(next) > keyOf(new Date())) return;
  day = next;
  renderJournal();
}
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
{
  let start = null;
  const j = $('journal');
  j.addEventListener('pointerdown', (ev) => {
    start = ev.target.closest('.entry, button, input') ? null : { x: ev.clientX, y: ev.clientY };
  });
  j.addEventListener('pointerup', (ev) => {
    if (!start) return;
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) shift(dx < 0 ? 1 : -1);
    start = null;
  });
  j.addEventListener('pointercancel', () => { start = null; });
}

// ---------- Ajout au journal ----------
function addEntry(food) {
  const entry = { id: uid(), meal: addMeal, name: food.name, code: food.code, unit: food.unit, base: food.base, qty: food.qty };
  setEntries([...getEntries(), entry]);
  if (!food.quick) pushRecent(entry);
  showTab('journal');
  toast('Ajouté');
}

// Récents : 20 derniers aliments, dédoublonnés (code-barres ou nom)
function pushRecent({ id, meal, ...food }) {
  const same = (r) => (food.code ? r.code === food.code : !r.code && r.name === food.name);
  save('cal:recents', [food, ...load('cal:recents', []).filter((r) => !same(r))].slice(0, 20));
}

// ---------- Onglets ----------
function showTab(name) {
  document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name));
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== name; });
  $('content').scrollTop = 0;
  if (name === 'journal') renderJournal();
  if (name === 'add') renderAdd();
  if (name === 'plan') renderPlan();
  if (name === 'settings') renderSettings();
}
document.querySelectorAll('[role=tab]').forEach((t) => {
  t.onclick = () => {
    if (t.dataset.tab === 'add') addMeal = mealByHour();
    showTab(t.dataset.tab);
  };
});

// ---------- Écran Ajouter ----------
function renderAdd() {
  $('add-day').textContent = label(day);
  document.querySelectorAll('.pills [role=radio]').forEach((b) => b.setAttribute('aria-checked', b.dataset.meal === addMeal));
  $('add-msg').hidden = true;
  const recents = load('cal:recents', []);
  const ul = $('recents');
  ul.replaceChildren();
  recents.forEach((food) => {
    const li = document.createElement('li');
    li.innerHTML = '<button class="rec"><span><span class="rec-name"></span><span class="rec-sub"></span></span>' +
      '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></button>';
    li.querySelector('.rec-name').textContent = food.name;
    li.querySelector('.rec-sub').textContent = `${qtyLabel(food)} · ${values(food).kcal} kcal`;
    li.querySelector('button').onclick = () => openFood(food);
    ul.append(li);
  });
  ul.hidden = !recents.length;
  $('recents-empty').hidden = recents.length > 0;
}
document.querySelectorAll('.pills [role=radio]').forEach((b) => {
  b.onclick = () => { addMeal = b.dataset.meal; renderAdd(); };
});
$('quick-btn').onclick = () => { $('quick-form').reset(); openSheet('sheet-quick'); };
$('manual-btn').onclick = () => openManual();

// ---------- Feuilles modales ----------
function openSheet(id) {
  const w = $(id);
  clearTimeout(w.timer);
  w.hidden = false;
  w.querySelector('.sheet').style.transform = '';
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open')));
}
function closeSheet(id) {
  const w = $(id);
  w.classList.remove('open');
  w.querySelector('.sheet').style.transform = '';
  w.timer = setTimeout(() => { w.hidden = true; }, 260);
}
document.querySelectorAll('.sheet-wrap').forEach((w) => {
  // Fermeture : tap sur le fond assombri
  w.querySelector('.backdrop').onclick = () => closeSheet(w.id);
  // Fermeture : glisser la poignée / l'en-tête vers le bas
  const sheet = w.querySelector('.sheet'), head = w.querySelector('.sheet-head');
  let y0 = null, dy = 0;
  head.addEventListener('pointerdown', (ev) => { y0 = ev.clientY; dy = 0; sheet.style.transition = 'none'; head.setPointerCapture(ev.pointerId); });
  head.addEventListener('pointermove', (ev) => {
    if (y0 === null) return;
    dy = Math.max(0, ev.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null; sheet.style.transition = '';
    if (dy > 80) closeSheet(w.id); else sheet.style.transform = '';
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') document.querySelectorAll('.sheet-wrap.open').forEach((w) => closeSheet(w.id));
});

// --- Fiche aliment : ajout (entryId absent) ou modification de quantité ---
let sheetFood = null, sheetEntryId = null;
function openFood(food, entryId = null) {
  sheetFood = food;
  sheetEntryId = entryId;
  $('f-name').textContent = food.name;
  $('f-base').textContent = (food.unit === 'g' ? 'Pour 100 g : ' : 'Par portion : ') + values(food, food.unit === 'g' ? 100 : 1).kcal + ' kcal';
  $('f-unit').textContent = food.unit === 'g' ? 'Quantité (g)' : 'Portions';
  $('f-qty').value = String(food.qty).replace('.', ',');
  $('f-submit').textContent = entryId ? 'Enregistrer' : 'Ajouter au journal';
  $('f-delete').hidden = !entryId;
  updateFood();
  openSheet('sheet-food');
}
function updateFood() {
  const v = values(sheetFood, num($('f-qty').value) || 0);
  animateNumber($('f-kcal'), v.kcal);
  macroChips($('f-macros'), v);
}
$('f-qty').addEventListener('input', updateFood);
$('f-qty').addEventListener('focus', (ev) => setTimeout(() => ev.target.select(), 0)); // sélection au focus
$('food-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const qty = num($('f-qty').value);
  if (!(qty > 0)) { $('f-qty').focus(); return; }
  closeSheet('sheet-food');
  if (sheetEntryId) {
    setEntries(getEntries().map((e) => (e.id === sheetEntryId ? { ...e, qty } : e)));
    renderJournal();
    toast('Modifié');
  } else {
    addEntry({ ...sheetFood, qty });
  }
});
$('f-delete').onclick = () => { closeSheet('sheet-food'); deleteEntry(sheetEntryId); };

// --- Ajout rapide : kcal seulement ---
$('quick-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  closeSheet('sheet-quick');
  addEntry({ name: f.name.value.trim() || 'Ajout rapide', unit: 'portion', qty: 1, base: { kcal: Math.round(num(f.kcal.value)) }, quick: true });
});

// --- Saisie manuelle (aussi utilisée en secours après un scan) ---
let manualCode;
function openManual({ name = '', code, message = '' } = {}) {
  $('manual-form').reset();
  $('manual-form').elements.name.value = name;
  manualCode = code;
  $('m-msg').textContent = message;
  $('m-msg').hidden = !message;
  openSheet('sheet-manual');
}
$('manual-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  closeSheet('sheet-manual');
  addEntry({
    name: f.name.value.trim(), code: manualCode, unit: 'portion', qty: 1,
    base: { kcal: Math.round(num(f.kcal.value)), p: num(f.p.value), c: num(f.c.value), f: num(f.f.value) },
  });
});

// ---------- Écran Mon plan (calculs dans calc.js) ----------
const getProfile = () => load('cal:profile', { protocole: 1 });
const PROFILE_FIELDS = ['age', 'taille', 'poids', 'bodyfat'];

// Étape active du plan si elle existe pour le protocole et que le profil est complet
function activeStage() {
  const index = load('cal:stage', null);
  if (index === null) return null;
  return ZeroToHero.compute(getProfile()).stages?.find((s) => s.index === index) || null;
}

// Recopie l'étape active dans les objectifs du Journal (arrondis à l'affichage seulement)
function syncPlan() {
  const s = activeStage();
  if (!s) return;
  save('cal:goal', Math.round(s.kcal));
  save('cal:macros', { p: Math.round(s.p), c: Math.max(0, Math.round(s.c)), f: Math.round(s.f) });
}

function renderPlan() {
  const profile = getProfile();
  const plan = ZeroToHero.compute(profile);
  const active = activeStage();
  $('plan-sub').textContent = ZeroToHero.PROTOCOLS[profile.protocole]?.name || '';
  $('plan-error').hidden = !plan.error;
  $('plan-error-text').textContent = plan.error || '';
  $('plan-base').textContent = plan.error ? ''
    : `Maintenance ${Math.round(plan.maintenance)} kcal · BMR ${Math.round(plan.bmr)} kcal · Masse maigre ${fmt(plan.masseMaigre)} kg`;
  // Étape choisie absente de ce protocole : on le signale, sans en choisir une autre
  const stored = load('cal:stage', null);
  $('plan-hint').hidden = plan.error || stored === null || !!active;
  $('plan-hint').textContent = `Ton étape choisie (${ZeroToHero.STAGES[stored]}) n'existe pas dans ce protocole. Choisis une étape ci-dessous.`;
  const box = $('plan-cards');
  box.replaceChildren();
  if (plan.error) return;
  plan.stages.forEach((s) => box.append(planCard(s, active?.index === s.index)));
  box.append(planCard({ name: 'Maintien', ...plan.maintien }, false, true));
}

function planCard(s, isActive, isRef = false) {
  const card = $('tpl-plan').content.firstElementChild.cloneNode(true);
  card.querySelector('h2').textContent = s.name + (isRef ? ' (référence)' : '');
  card.querySelector('.plan-kcal strong').textContent = Math.round(s.kcal);
  ['p', 'c', 'f'].forEach((k) => { card.querySelector(`.${k} strong`).textContent = Math.round(s[k]) + ' g'; });
  card.classList.toggle('active', isActive);
  card.classList.toggle('ref', isRef);
  card.querySelector('.badge').hidden = !isActive;
  const use = card.querySelector('.plan-use');
  use.hidden = isActive || isRef;
  use.setAttribute('aria-label', 'Utiliser ' + s.name);
  use.onclick = () => {
    save('cal:stage', s.index); // seul endroit où l'étape change : jamais automatique
    syncPlan();
    renderPlan();
    toast('Objectif mis à jour');
  };
  return card;
}
$('plan-profile').onclick = () => {
  showTab('settings');
  $('profile-form').scrollIntoView({ block: 'center' });
};

// ---------- Écran Réglages ----------
function renderSettings() {
  const mg = load('cal:macros', {});
  $('s-goal').value = load('cal:goal', 2000);
  ['p', 'c', 'f'].forEach((k) => { $('s-' + k).value = mg[k] ? String(mg[k]).replace('.', ',') : ''; });

  // Objectifs pilotés par le plan : champs verrouillés
  const s = activeStage();
  $('plan-note').hidden = !s;
  $('plan-note-text').textContent = s ? `Objectifs définis par Mon plan (${s.name}).` : '';
  ['s-goal', 's-p', 's-c', 's-f'].forEach((id) => { $(id).disabled = !!s; });

  // Profil
  const profile = getProfile();
  const f = $('profile-form').elements;
  PROFILE_FIELDS.forEach((k) => { f[k].value = profile[k] == null ? '' : String(profile[k]).replace('.', ','); });
  f.protocole.value = profile.protocole || 1;
  const err = ZeroToHero.validate(profile);
  $('profile-msg').textContent = err || '';
  $('profile-msg').hidden = !err;
}

// Profil modifié : recalcul + mise à jour de l'objectif, sans changer d'étape
$('profile-form').addEventListener('change', () => {
  const f = $('profile-form').elements;
  const profile = { protocole: Number(f.protocole.value) };
  PROFILE_FIELDS.forEach((k) => { profile[k] = num(f[k].value) ?? null; });
  save('cal:profile', profile);
  syncPlan();
  renderSettings();
});
$('profile-form').addEventListener('submit', (ev) => ev.preventDefault());
$('plan-off').onclick = () => { save('cal:stage', null); renderSettings(); };
$('s-goal').addEventListener('change', (ev) => {
  const v = parseInt(ev.target.value, 10);
  if (v >= 0) save('cal:goal', v);
  renderSettings();
});
['p', 'c', 'f'].forEach((k) => $('s-' + k).addEventListener('change', (ev) => {
  const mg = load('cal:macros', {});
  const v = num(ev.target.value);
  if (v > 0) mg[k] = v; else delete mg[k];
  save('cal:macros', mg);
  renderSettings();
}));
$('settings-form').addEventListener('submit', (ev) => ev.preventDefault());
$('reset').onclick = () => {
  if (!confirm('Effacer toutes les données (journal, objectifs, récents) ? Cette action est définitive.')) return;
  Object.keys(localStorage).filter((k) => k.startsWith('cal:')).forEach((k) => localStorage.removeItem(k));
  day = new Date();
  renderSettings();
  toast('Données réinitialisées');
};

// ---------- Démarrage ----------
showTab('journal');
// Au retour dans l'app : rafraîchir (la date a pu changer)
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('journal').hidden) renderJournal(); });

// Service worker : cache hors ligne + mise à jour automatique
if ('serviceWorker' in navigator) {
  // Une nouvelle version vient de prendre le contrôle : recharger pour l'afficher
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      console.log('Service worker enregistré');
      // iOS réveille l'app sans la recharger : on vérifie les mises à jour au retour
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
    })
    .catch((err) => console.error('Échec du service worker', err));
}
