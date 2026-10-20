// Scan de codes-barres (EAN-13, EAN-8, UPC-A) + fiche Open Food Facts.
// Utilise vendor/barcode-detector.js (global BarcodeDetectionAPI, polyfill zxing-wasm)
// et app.js ($, load, save, macro, addEntry).
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
let product = null; // produit affiché dans la fiche (valeurs pour 100 g)

const msg = (text) => { $('scan-msg').textContent = text; $('scan-msg').hidden = !text; };
const toNum = (v) => (v === '' || v == null || isNaN(v) ? undefined : Number(v));

// ---------- Caméra ----------
async function openScanner() {
  msg('');
  if (!navigator.mediaDevices?.getUserMedia) return cameraError('Caméra indisponible (HTTPS requis).');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (err) {
    return cameraError(['NotAllowedError', 'SecurityError'].includes(err.name)
      ? 'Accès à la caméra refusé (Réglages > Safari > Caméra).'
      : 'Impossible d’ouvrir la caméra.');
  }
  $('scan-status').textContent = 'Visez le code-barres…';
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
  $('scanner').classList.remove('found');
}

// Feedback (vibration si dispo, cadre vert), arrêt caméra, puis recherche
function onDetected(code) {
  navigator.vibrate?.(100);
  $('scanner').classList.add('found');
  $('scan-status').textContent = 'Code détecté : ' + code;
  stopCamera();
  setTimeout(() => { closeScanner(); lookup(code); }, 400);
}

function cameraError(text) {
  msg(text + ' Tapez le code ci-dessous.');
  $('ean').focus();
}

// ---------- Produit ----------
async function lookup(raw) {
  const code = raw.length === 12 ? '0' + raw : raw; // UPC-A -> EAN-13
  const cache = load('cal:products', {});
  if (cache[code]) return showProduct(cache[code]); // déjà connu : pas de réseau

  msg('Recherche du produit…');
  let data;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,nutriments`);
    if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch {
    return manual(code, '', 'Réseau indisponible.');
  }
  const p = data.product;
  if (data.status !== 1 || !p) return manual(code, '', 'Produit introuvable.');

  const n = p.nutriments || {};
  const name = p.product_name?.trim() || 'Produit ' + code;
  const prod = {
    name, kcal: toNum(n['energy-kcal_100g']),
    p: toNum(n.proteins_100g), c: toNum(n.carbohydrates_100g), f: toNum(n.fat_100g),
  };
  if (prod.kcal === undefined) return manual(code, name, 'Valeurs nutritionnelles manquantes.');

  cache[code] = prod;
  save('cal:products', cache);
  msg('');
  showProduct(prod);
}

// Valeurs pour une quantité donnée (en g)
function scaled(prod, grams) {
  const r = grams / 100, round1 = (v) => (v === undefined ? undefined : Math.round(v * r * 10) / 10);
  return { kcal: Math.round(prod.kcal * r), p: round1(prod.p), c: round1(prod.c), f: round1(prod.f) };
}
const describe = (v) => [v.kcal + ' kcal', macro(v.p, 'P'), macro(v.c, 'G'), macro(v.f, 'L')].filter(Boolean).join(' · ');

function showProduct(prod) {
  product = prod;
  $('p-name').textContent = prod.name;
  $('p-per100').textContent = 'Pour 100 g : ' + describe(prod);
  $('p-qty').value = 100;
  updateCalc();
  $('product').showModal();
}
function updateCalc() {
  const g = parseFloat($('p-qty').value) || 0;
  $('p-calc').textContent = describe(scaled(product, g));
}

// Validation de la fiche : ajout au journal du jour
$('product').addEventListener('close', () => {
  const g = parseFloat($('p-qty').value);
  if ($('product').returnValue !== 'add' || !(g > 0)) return;
  const v = scaled(product, g);
  const entry = { name: `${product.name} (${g} g)`, kcal: v.kcal };
  ['p', 'c', 'f'].forEach((k) => { if (v[k]) entry[k] = v[k]; });
  addEntry(entry);
});

// Repli : formulaire manuel pré-rempli avec le code-barres
function manual(code, name, reason) {
  const f = $('form').elements;
  f.name.value = name ? `${name} (${code})` : 'Produit ' + code;
  msg(reason + ' Complétez la saisie manuelle ci-dessous.');
  $('form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  f.kcal.focus();
}

// ---------- Événements ----------
$('scan-btn').onclick = openScanner;
$('scan-close').onclick = closeScanner;
$('p-qty').oninput = updateCalc;
$('ean-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  lookup($('ean').value.trim());
  ev.target.reset();
});
// Coupe la caméra si l'app passe en arrière-plan
document.addEventListener('visibilitychange', () => { if (document.hidden && stream) closeScanner(); });
