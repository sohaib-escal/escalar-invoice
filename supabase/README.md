# Configuration Supabase — Facturation ESCALAR MEDIA

Ce dossier contient le script SQL d'initialisation pour configurer votre base de données Supabase.

## 🚀 Étape 1 : Créer votre projet Supabase

1. Rendez-vous sur [https://supabase.com](https://supabase.com) et connectez-vous.
2. Cliquez sur **New project**.
3. Choisissez un nom (ex: `escalar-facturation`), un mot de passe sécurisé pour la base de données, et une région proche (ex: `West Europe (Frankfurt)`).

## 🛠️ Étape 2 : Exécuter la migration SQL

1. Dans votre tableau de bord Supabase, allez dans le menu de gauche sur **SQL Editor**.
2. Cliquez sur **+ New query**.
3. Ouvrez le fichier `supabase/migrations/001_init.sql`, copiez l'intégralité de son contenu et collez-le dans l'éditeur SQL de Supabase.
4. Cliquez sur **Run** (ou `Cmd+Enter` / `Ctrl+Enter`).
5. Le message `Success. No rows returned` s'affiche : toutes les tables, index, règles RLS, fonctions atomiques et paramètres initiaux sont installés.

## 🔑 Étape 3 : Récupérer vos clés d'API

Dans Supabase, allez dans **Project Settings** (icône d'engrenage en bas à gauche) ➔ **API** :
- **Project URL** : ex: `https://xyzcompany.supabase.co`
- **Anon Public API Key** : clé publique commençant par `ey...` (totalement sûre pour le frontend).

Renseignez ces deux valeurs dans le fichier `js/supabase-client.js` ou directement dans l'interface de connexion.

## 👤 Étape 4 : Création du premier compte Super Admin

Grâce au trigger automatique dans la migration :
- Le **premier compte** qui s'enregistre ou se connecte devient **automatiquement Super Admin**.
- Tous les comptes créés ensuite par le Super Admin depuis le tableau de bord auront le rôle choisi (`Membre` ou `Super Admin`).

