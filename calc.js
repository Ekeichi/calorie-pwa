// Module "Zero to Hero" : objectifs caloriques et macros (reproduit le calculateur Excel).
// Fonctions pures, sans DOM : utilisables dans le navigateur (global ZeroToHero) et sous node.
// Aucun arrondi ici : on arrondit seulement à l'affichage.
(function (root) {
  const PROTOCOLS = {
    // Écart à la maintenance pour [Semaine initiale, Étape 1, Étape 2] ; null = étape "X" (inexistante)
    1: { name: 'Prise de muscle propre', offsets: [0, 200, 400] },
    2: { name: 'Recomposition corporelle', offsets: [-300, null, null] },
    3: { name: 'Créer le déficit parfait', offsets: [-300, -500, null] },
    4: { name: 'Perte de gras progressive', offsets: [-300, -500, -700] },
  };
  const STAGES = ['Semaine initiale', 'Étape 1', 'Étape 2'];

  // Champ vide -> NaN (et non 0 comme Number(''))
  const n = (v) => (v === '' || v == null ? NaN : Number(v));

  // Message d'erreur, ou null si le profil est exploitable
  function validate(profile) {
    const poids = n(profile.poids), taille = n(profile.taille), age = n(profile.age), bf = n(profile.bodyfat);
    if (!(poids > 0)) return 'Complète ton profil';
    if (Number.isNaN(taille)) return 'Complète ton profil';
    if (!(taille >= 1 && taille <= 2.5)) return 'Vérifie ta taille';
    if (!(age > 0) || !(bf >= 0 && bf < 100)) return 'Complète ton profil';
    if (!PROTOCOLS[profile.protocole]) return 'Choisis un protocole';
    return null;
  }

  const masseMaigre = (poids, bodyfat) => (poids * (100 - bodyfat)) / 100;
  // Formule de Harris-Benedict révisée, version HOMME (comme dans l'Excel d'origine)
  const bmr1 = (poids, taille, age) => 13.707 * poids + 492.3 * taille - 6.673 * age + 77.607;
  // Formule de Katch-McArdle (basée sur la masse maigre)
  const bmr2 = (mm) => 21.6 * mm + 370;
  const proteines = (poids, mm) => (1.5 * poids + 2 * mm) / 2;
  const lipides = (mm) => 1.2 * mm;
  const glucides = (kcal, prot, lip) => (kcal - prot * 4 - lip * 9) / 4;

  // Calcul complet. Renvoie { error } ou toutes les valeurs + les étapes disponibles du protocole
  function compute(profile) {
    const error = validate(profile);
    if (error) return { error };
    const poids = n(profile.poids), taille = n(profile.taille), age = n(profile.age), bf = n(profile.bodyfat);
    const mm = masseMaigre(poids, bf);
    const b1 = bmr1(poids, taille, age), b2 = bmr2(mm);
    const bmr = (b1 + b2) / 2;
    const maintenance = bmr * 1.5;
    const p = proteines(poids, mm), f = lipides(mm);
    const target = (kcal) => ({ kcal, p, c: glucides(kcal, p, f), f });

    const stages = PROTOCOLS[profile.protocole].offsets
      .map((off, index) => (off === null ? null : { index, name: STAGES[index], ...target(maintenance + off) }))
      .filter(Boolean); // les étapes "X" ne sont pas renvoyées

    return {
      masseMaigre: mm, bmr1: b1, bmr2: b2, bmr, maintenance, proteines: p, lipides: f,
      maintien: target(maintenance), stages,
    };
  }

  const api = { PROTOCOLS, STAGES, validate, compute, masseMaigre, bmr1, bmr2, proteines, lipides, glucides };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZeroToHero = api;
})(this);
