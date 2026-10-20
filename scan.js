// Scan de codes-barres (EAN-13, EAN-8, UPC-A) + fiche Open Food Facts.
// Utilise vendor/barcode-detector.js (global BarcodeDetectionAPI, polyfill zxing-wasm)
// et app.js ($, load, save, num, openFood, openManual).
const { BarcodeDetector, prepareZXingModule } = BarcodeDetectionAPI;

// Le .wasm est servi depuis vendor/ (et non le CDN par défaut) : mis en cache par le SW
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) =>
      path.endsWith('.wasm') ? new URL('vendor/' + path, location.href).href : prefix + path,
  },
});
const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] });

let stream = null; // flux caméra en cours
let timer = null; // boucle de détection

const addMsg = (text) => { $('add-msg').textContent = text; $('add-msg').hidden = !text; };
const status = (text, loading) => {
  $('scan-status').textContent = text;
  if (loading) $('scan-status').insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
};

// ---------- Caméra ----------
async function openScanner() {
  addMsg('');
  if (!navigator.mediaDevices?.getUserMedia) return cameraError('Caméra indisponible (HTTPS requis).');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (err) {
    return cameraError(['NotAllowedError', 'SecurityError'].includes(err.name)
      ? 'Accès à la caméra refusé (Réglages > Safari > Caméra).'
      : 'Impossible d’ouvrir la caméra.');
  }
  status('Place le code-barres dans le cadre');
  $('scanner').classList.remove('found');
  $('scanner').hidden = false;
  $('video').srcObject = stream;
  $('video').play().catch(() => {});
  detectLoop();
}

// Analyse une image toutes les 200 ms jusqu'à détection
async function detectLoop() {
  if (!stream) return;
  try {
    if ($('video').readyState >= 2) {
      const [hit] = await detector.detect($('video'));
      if (hit && stream) return onDetected(hit.rawValue);
    }
  } catch (err) { console.warn(err); }
  if (stream) timer = setTimeout(detectLoop, 200);
}

// Libère la caméra (indispensable sur iOS pour éteindre le voyant)
function stopCamera() {
  clearTimeout(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('video').srcObject = null;
}
function closeScanner() {
  stopCamera();
  $('scanner').hidden = true;
}

// Détection : vibration + cadre vert, arrêt caméra, recherche, puis fiche
async function onDetected(code) {
  navigator.vibrate?.(60);
  $('scanner').classList.add('found');
  stopCamera();
  status('Recherche du produit…', true);
  const result = await lookup(code);
  if ($('scanner').hidden) return; // fermé entre-temps
  closeScanner();
  showResult(result);
}

function cameraError(text) {
  addMsg(text + ' Tapez le code ci-dessous.');
  $('ean').focus();
}

// ---------- Produit ----------
// Renvoie { food } ou { error, code, name? }
async function lookup(raw) {
  const code = raw.length === 12 ? '0' + raw : raw; // UPC-A -> EAN-13
  const cache = load('cal:products', {});
  if (cache[code]) return { food: toFood(code, cache[code]) }; // déjà connu : pas de réseau

  let data;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,nutriments`);
    if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch {
    return { code, error: 'Réseau indisponible.' };
  }
  const p = data.product;
  if (data.status !== 1 || !p) return { code, error: 'Produit introuvable.' };

  const n = p.nutriments || {};
  const name = p.product_name?.trim() || 'Produit ' + code;
  const prod = { name, kcal: num(n['energy-kcal_100g']), p: num(n.proteins_100g), c: num(n.carbohydrates_100g), f: num(n.fat_100g) };
  if (prod.kcal === undefined) return { code, name, error: 'Valeurs nutritionnelles manquantes.' };

  cache[code] = prod;
  save('cal:products', cache);
  return { food: toFood(code, prod) };
}

// Produit (pour 100 g) -> aliment, avec la dernière quantité utilisée si connue
function toFood(code, { name, kcal, p, c, f }) {
  const last = load('cal:recents', []).find((r) => r.code === code);
  return { name, code, unit: 'g', qty: last?.qty || 100, base: { kcal, p, c, f } };
}

// Fiche produit, ou saisie manuelle pré-remplie en secours
function showResult({ food, error, code, name }) {
  addMsg('');
  if (food) return openFood(food);
  openManual({ name: name ? `${name} (${code})` : 'Produit ' + code, code, message: error + ' Complète la saisie.' });
}

// ---------- Événements ----------
$('scan-btn').onclick = openScanner;
$('scan-close').onclick = closeScanner;
$('scan-manual').onclick = () => { closeScanner(); $('ean').focus(); };
$('ean-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const code = $('ean').value.trim();
  ev.target.reset();
  addMsg('Recherche du produit…');
  showResult(await lookup(code));
});
// Coupe la caméra si l'app passe en arrière-plan
document.addEventListener('visibilitychange', () => { if (document.hidden && stream) closeScanner(); });
