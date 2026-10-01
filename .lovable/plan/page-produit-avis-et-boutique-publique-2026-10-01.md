# Page produit, avis et boutique publique

## Résultat attendu
- La photo d’un produit ouvre toujours sa fiche complète, avec galerie, zoom, promotion, stock, variantes, ventes et notes.
- Les réactions « J’aime » et « J’adore », les commentaires et le partage utilisent de vraies données et de vrais liens.
- Les clients ayant reçu une commande peuvent publier un avis noté avec photos ; les autres peuvent consulter et signaler les avis.
- Le nom du vendeur ouvre une boutique publique avec ses informations, ses statistiques et sa grille de produits.
- La barre fixe conserve Message boutique, Ajouter au panier et Acheter maintenant, adaptée aux petits écrans Android.

## Mise en œuvre
1. **Données protégées**
   - Ajouter les avis produit, photos d’avis et signalements avec règles d’accès strictes.
   - Vérifier côté base qu’un avis dit « achat vérifié » correspond à une commande réellement reçue par ce client.
   - Ajouter les agrégats de notes produit/boutique et un espace d’images dédié aux avis.
   - Faire évoluer les réactions existantes pour distinguer « J’aime » et « J’adore » sans perdre les réactions actuelles.

2. **Fiche produit**
   - Refaire la galerie avec miniatures, navigation, zoom plein écran et images de secours.
   - Afficher toutes les informations demandées, le compte à rebours de promotion et les statistiques réelles.
   - Rendre toutes les variantes disponibles sélectionnables, y compris l’unité, avec quantité plafonnée au stock.
   - Ajouter le partage natif, puis les options Copier, WhatsApp, Facebook et Messenger.

3. **Avis et interactions**
   - Afficher la note moyenne, les étoiles, les avis, leurs photos, dates et badges d’achat vérifié.
   - Proposer le formulaire uniquement après réception, avec 1–5 étoiles, commentaire et plusieurs photos.
   - Ajouter le signalement réel d’un avis et conserver les commentaires existants séparément.

4. **Boutique publique et actions**
   - Créer une page boutique accessible depuis la fiche produit, avec identité, ancienneté, statistiques et produits actifs.
   - Faire ouvrir « Message boutique » directement sur la conversation créée ou existante.
   - Conserver l’ajout panier et l’achat immédiat avec la variante/quantité choisies et les calculs existants.

5. **Vérification**
   - Tester les parcours demandés sur mobile Android simulé et ordinateur : accueil → produit, galerie/zoom, variantes, panier, achat, message, boutique, avis avec photo, partage, lien direct et retour.
   - Contrôler les pages vides, erreurs, débordements et la barre fixe avec la zone système mobile.

## Détails techniques
- Les nouvelles tables auront des permissions explicites et des règles de sécurité par utilisateur, vendeur et administrateur.
- Les routes produit et boutique auront leurs propres titres et descriptions de partage.
- Les liens resteront des routes natives de l’application afin que l’ouverture directe et le bouton Retour restent fiables.
