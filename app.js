// Compteur de calories — données en localStorage :
//   "cal:goal"        -> objectif journalier (nombre)
//   "cal:YYYY-MM-DD"  -> tableau d'entrées { name, kcal, p, c, f }
const $ = (id) => document.getElementById(id);
let day = new Date(); // jour affiché

// Date locale au format YYYY-MM-DD (pas toISOString, qui est en UTC)
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Lecture / écriture JSON tolérante aux erreurs
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const getGoal = () => load('cal:goal', 2000);
const getEntries = () => load('cal:' + keyOf(day), []);
const setEntries = (list) => save('cal:' + keyOf(day), list);

// Libellé du jour : "Aujourd'hui", "Hier" ou date complète
function label(d) {
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Affiche une macro uniquement si elle est renseignée
const macro = (v, l) => (v ? `${Math.round(v * 10) / 10} g ${l}` : '');

function render() {
  const entries = getEntries();
  const goal = getGoal();
  const total = entries.reduce((s, e) => s + e.kcal, 0);
  const left = goal - total;

  $('date').textContent = label(day);
  $('next').disabled = keyOf(day) === keyOf(new Date()); // pas de futur
  $('goal').value = goal;
  $('total').textContent = total;
  $('left').textContent = Math.abs(left);
  $('left').classList.toggle('over', left < 0);
  $('left-label').textContent = left < 0 ? 'en trop' : 'restantes';
  $('fill').style.width = Math.min(100, goal ? (total / goal) * 100 : 0) + '%';
  $('fill').classList.toggle('over', left < 0);

  // Totaux des macros (si au moins une est renseignée)
  const sum = (k) => entries.reduce((s, e) => s + (e[k] || 0), 0);
  $('macros').textContent = [macro(sum('p'), 'prot.'), macro(sum('c'), 'gluc.'), macro(sum('f'), 'lip.')]
    .filter(Boolean).join(' · ');

  // Liste (textContent partout : pas d'injection HTML)
  const list = $('list');
  list.replaceChildren();
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<div class="info"><div class="name"></div><div class="sub"></div></div>' +
      '<span class="kcal"></span><button class="del" aria-label="Supprimer">✕</button>';
    li.querySelector('.name').textContent = e.name;
    li.querySelector('.sub').textContent = [macro(e.p, 'P'), macro(e.c, 'G'), macro(e.f, 'L')].filter(Boolean).join(' · ');
    li.querySelector('.kcal').textContent = e.kcal + ' kcal';
    li.querySelector('.del').onclick = () => {
      const next = getEntries();
      next.splice(i, 1);
      setEntries(next);
      render();
    };
    list.append(li);
  });
  $('empty').hidden = entries.length > 0;
}

// Ajout d'une entrée
$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const num = (k) => parseFloat(f.get(k)) || 0;
  const entry = { name: f.get('name').trim(), kcal: Math.round(num('kcal')) };
  ['p', 'c', 'f'].forEach((k) => { if (num(k)) entry[k] = num(k); });
  if (!entry.name) return;
  setEntries([...getEntries(), entry]);
  ev.target.reset();
  render();
});

// Objectif modifiable (sauvegardé à chaque changement)
$('goal').addEventListener('change', (ev) => {
  const v = parseInt(ev.target.value, 10);
  if (v >= 0) save('cal:goal', v);
  render();
});

// Navigation entre les jours
const shift = (n) => { day.setDate(day.getDate() + n); render(); };
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);

// Rafraîchit l'affichage (libellé "Aujourd'hui", etc.) au retour dans l'app
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();

// Service worker : mise en cache pour le hors ligne
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log('Service worker enregistré'))
    .catch((err) => console.error('Échec du service worker', err));
}
