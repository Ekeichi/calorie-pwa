// Tests du module Zero to Hero : node calc.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('./calc.js');

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) <= 0.01, `${label} : attendu ${expected}, obtenu ${actual}`);
const base = { poids: 80, taille: 1.8, age: 25, bodyfat: 15, protocole: 1 };

test('valeurs de référence (80 kg, 1,80 m, 25 ans, 15 %)', () => {
  const r = Z.compute(base);
  close(r.bmr1, 1893.482, 'bmr1');
  close(r.bmr2, 1838.8, 'bmr2');
  close(r.bmr, 1866.141, 'bmr');
  close(r.maintenance, 2799.2115, 'maintenance');
  close(r.masseMaigre, 68, 'masseMaigre');
  close(r.proteines, 128, 'proteines');
  close(r.lipides, 81.6, 'lipides');
  close(r.maintien.c, 388.2, 'glucides à la maintenance');
  close(r.maintien.kcal, r.maintenance, 'kcal maintien');
});

test('pas d’arrondi dans calc.js', () => {
  const r = Z.compute(base);
  assert.equal(r.maintenance, r.bmr * 1.5);
  assert.ok(!Number.isInteger(r.maintenance) && !Number.isInteger(r.maintien.c));
});

test('protocole 1 : maintenance, +200, +400 ; protéines/lipides constants, glucides variables', () => {
  const r = Z.compute(base);
  assert.deepEqual(r.stages.map((s) => s.name), ['Semaine initiale', 'Étape 1', 'Étape 2']);
  close(r.stages[0].kcal, 2799.2115, 'initiale');
  close(r.stages[1].kcal, 2999.2115, 'étape 1');
  close(r.stages[2].kcal, 3199.2115, 'étape 2');
  r.stages.forEach((s) => { close(s.p, 128, 'p'); close(s.f, 81.6, 'f'); });
  close(r.stages[1].c, 388.2 + 50, 'glucides étape 1'); // +200 kcal = +50 g
});

test('protocole 2 : étapes 1 et 2 = X (non renvoyées)', () => {
  const r = Z.compute({ ...base, protocole: 2 });
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].name, 'Semaine initiale');
  close(r.stages[0].kcal, 2499.2115, 'initiale');
  assert.equal(r.stages.find((s) => s.index > 0), undefined);
});

test('protocoles 3 et 4', () => {
  const p3 = Z.compute({ ...base, protocole: 3 });
  assert.deepEqual(p3.stages.map((s) => Math.round(s.kcal - p3.maintenance)), [-300, -500]);
  const p4 = Z.compute({ ...base, protocole: 4 });
  assert.deepEqual(p4.stages.map((s) => Math.round(s.kcal - p4.maintenance)), [-300, -500, -700]);
});

test('poids vide ou nul : "Complète ton profil"', () => {
  for (const poids of ['', null, undefined, 0]) {
    assert.deepEqual(Z.compute({ ...base, poids }), { error: 'Complète ton profil' });
  }
});

test('taille 0,9 (hors 1–2,5 m) : "Vérifie ta taille"', () => {
  assert.deepEqual(Z.compute({ ...base, taille: 0.9 }), { error: 'Vérifie ta taille' });
  assert.deepEqual(Z.compute({ ...base, taille: 2.6 }), { error: 'Vérifie ta taille' });
  assert.equal(Z.compute({ ...base, taille: 1 }).error, undefined);
  assert.equal(Z.compute({ ...base, taille: 2.5 }).error, undefined);
});
