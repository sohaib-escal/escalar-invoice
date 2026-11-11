-- ==============================================================================
-- ESCALAR MEDIA — Facturation & Devis Multi-Utilisateur
-- Migration 001 : Schéma initial, RLS, fonctions atomiques et paramètres
-- ==============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Fonction mise à jour automatique timestamp updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. Tables principales
-- ==============================================================================

-- Profils utilisateurs (complète auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL DEFAULT '',
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin', 'member')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients
CREATE TABLE IF NOT EXISTS public.clients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    contact     TEXT DEFAULT '',
    address     TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    ice         TEXT DEFAULT '',
    created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documents (Devis et Factures)
CREATE TABLE IF NOT EXISTS public.documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL CHECK (type IN ('devis', 'facture')),
    number          TEXT UNIQUE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'brouillon',
    issue_date      DATE NOT NULL,
    valid_until     DATE,
    due_date        DATE,
    delivery_time   TEXT DEFAULT '',
    payment_method  TEXT DEFAULT '',
    payment_ref     TEXT DEFAULT '',
    payment_terms   TEXT DEFAULT '',
    source_ref      TEXT DEFAULT '',
    client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    subject         TEXT DEFAULT '',
    global_discount JSONB DEFAULT '{"type":"percent","value":""}'::jsonb,
    notes_title     TEXT DEFAULT 'Notes',
    notes           TEXT DEFAULT '',
    conditions      TEXT DEFAULT '',
    show_signature  BOOLEAN DEFAULT true,
    show_acceptance BOOLEAN DEFAULT false,
    show_stamp      BOOLEAN DEFAULT true,
    drive_info      JSONB DEFAULT NULL,
    created_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    updated_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_devis_status CHECK (
        type != 'devis' OR status IN ('brouillon', 'envoye', 'accepte', 'refuse')
    ),
    CONSTRAINT valid_facture_status CHECK (
        type != 'facture' OR status IN ('brouillon', 'emise', 'payee', 'annulee')
    )
);

-- Lignes de document (prestations)
CREATE TABLE IF NOT EXISTS public.document_lines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    description  TEXT DEFAULT '',
    qty          TEXT DEFAULT '',
    price        TEXT DEFAULT '',
    discount     TEXT DEFAULT '',
    tax_rate     INTEGER NOT NULL DEFAULT 20 CHECK (tax_rate IN (20, 14, 10, 7, 0)),
    UNIQUE (document_id, sort_order)
);

-- Compteurs de numérotation atomiques
CREATE TABLE IF NOT EXISTS public.numbering_counters (
    counter_key TEXT PRIMARY KEY, -- ex: 'devis-2026-11-10' ou 'facture-2026-11'
    last_used   INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paramètres globaux de l'application
CREATE TABLE IF NOT EXISTS public.app_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal d'audit
CREATE TABLE IF NOT EXISTS public.audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    details     JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. Index de performance
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON public.clients USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients(created_by);

CREATE INDEX IF NOT EXISTS idx_documents_type ON public.documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_issue_date ON public.documents(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_number ON public.documents(number);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON public.documents(client_id);

CREATE INDEX IF NOT EXISTS idx_lines_doc_sort ON public.document_lines(document_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);

-- Triggers de mise à jour updated_at
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 5. Fonctions d'aide pour la sécurité (RLS)
-- ==============================================================================

-- Vérifie si l'utilisateur courant est actif
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Vérifie si l'utilisateur courant est Super Admin actif
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Création automatique de profil lors de la création d'un utilisateur auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_count INTEGER;
    initial_role TEXT;
BEGIN
    SELECT count(*) INTO user_count FROM public.profiles;
    -- Le premier utilisateur créé devient automatiquement Super Admin !
    IF user_count = 0 THEN
        initial_role := 'super_admin';
    ELSE
        initial_role := 'member';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        initial_role,
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 6. Numérotation atomique (prévention des doublons concurrents)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.allocate_number(
    p_type TEXT,
    p_issue_date DATE
) RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_key TEXT;
    v_seq INTEGER;
    v_number TEXT;
    v_settings JSONB;
    v_yy TEXT;
    v_mm TEXT;
    v_dd TEXT;
    v_digits INTEGER;
    v_candidate TEXT;
    v_guard INTEGER := 0;
BEGIN
    -- Récupère les préfixes configurés
    SELECT value INTO v_settings FROM public.app_settings WHERE key = 'numbering';
    IF p_type = 'facture' THEN
        v_prefix := COALESCE(v_settings->>'facturePrefix', 'F');
        v_digits := 3;
        v_key := 'facture-' || to_char(p_issue_date, 'YYYY-MM');
    ELSE
        v_prefix := COALESCE(v_settings->>'devisPrefix', 'D');
        v_digits := 2;
        v_key := 'devis-' || to_char(p_issue_date, 'YYYY-MM-DD');
    END IF;

    v_yy := to_char(p_issue_date, 'YY');
    v_mm := to_char(p_issue_date, 'MM');
    v_dd := to_char(p_issue_date, 'DD');

    LOOP
        v_guard := v_guard + 1;
        IF v_guard > 10000 THEN
            RAISE EXCEPTION 'Impossible d''allouer un numéro de document unique.';
        END IF;

        -- Incrémentation atomique avec verrouillage de ligne
        INSERT INTO public.numbering_counters (counter_key, last_used, updated_at)
        VALUES (v_key, 1, now())
        ON CONFLICT (counter_key) DO UPDATE
            SET last_used = public.numbering_counters.last_used + 1,
                updated_at = now()
        RETURNING last_used INTO v_seq;

        IF p_type = 'facture' THEN
            v_candidate := v_prefix || v_yy || v_mm || lpad(v_seq::TEXT, v_digits, '0');
        ELSE
            v_candidate := v_prefix || v_yy || v_mm || v_dd || lpad(v_seq::TEXT, v_digits, '0');
        END IF;

        -- Vérifie que le numéro n'a pas été déjà saisi manuellement
        IF NOT EXISTS (SELECT 1 FROM public.documents WHERE number = v_candidate) THEN
            v_number := v_candidate;
            EXIT;
        END IF;
    END LOOP;

    RETURN v_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aperçu du prochain numéro (lecture sans incrémentation)
CREATE OR REPLACE FUNCTION public.peek_next_number(
    p_type TEXT,
    p_issue_date DATE
) RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_key TEXT;
    v_seq INTEGER := 0;
    v_settings JSONB;
    v_yy TEXT;
    v_mm TEXT;
    v_dd TEXT;
    v_digits INTEGER;
    v_candidate TEXT;
    v_guard INTEGER := 0;
BEGIN
    SELECT value INTO v_settings FROM public.app_settings WHERE key = 'numbering';
    IF p_type = 'facture' THEN
        v_prefix := COALESCE(v_settings->>'facturePrefix', 'F');
        v_digits := 3;
        v_key := 'facture-' || to_char(p_issue_date, 'YYYY-MM');
    ELSE
        v_prefix := COALESCE(v_settings->>'devisPrefix', 'D');
        v_digits := 2;
        v_key := 'devis-' || to_char(p_issue_date, 'YYYY-MM-DD');
    END IF;

    SELECT last_used INTO v_seq FROM public.numbering_counters WHERE counter_key = v_key;
    IF v_seq IS NULL THEN v_seq := 0; END IF;

    v_yy := to_char(p_issue_date, 'YY');
    v_mm := to_char(p_issue_date, 'MM');
    v_dd := to_char(p_issue_date, 'DD');

    LOOP
        v_guard := v_guard + 1;
        v_seq := v_seq + 1;
        IF v_guard > 10000 THEN EXIT; END IF;

        IF p_type = 'facture' THEN
            v_candidate := v_prefix || v_yy || v_mm || lpad(v_seq::TEXT, v_digits, '0');
        ELSE
            v_candidate := v_prefix || v_yy || v_mm || v_dd || lpad(v_seq::TEXT, v_digits, '0');
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.documents WHERE number = v_candidate) THEN
            RETURN v_candidate;
        END IF;
    END LOOP;

    RETURN v_candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==============================================================================
-- 7. Fonctions Super Admin pour gestion des utilisateurs (sans exposer service_role)
-- ==============================================================================

-- Création d'un compte utilisateur par le Super Admin
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role TEXT
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_pw TEXT;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accès refusé : privilège Super Admin requis.';
    END IF;

    IF p_role NOT IN ('super_admin', 'member') THEN
        RAISE EXCEPTION 'Rôle invalide : %', p_role;
    END IF;

    IF length(p_password) < 6 THEN
        RAISE EXCEPTION 'Le mot de passe doit comporter au moins 6 caractères.';
    END IF;

    v_user_id := gen_random_uuid();
    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    -- Insertion dans auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        role,
        aud
    ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        lower(trim(p_email)),
        v_encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', p_full_name),
        now(),
        now(),
        'authenticated',
        'authenticated'
    );

    -- Insertion / mise à jour du profil avec le rôle désiré
    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES (v_user_id, lower(trim(p_email)), p_full_name, p_role, true)
    ON CONFLICT (id) DO UPDATE
    SET role = p_role, full_name = p_full_name, is_active = true;

    -- Trace audit
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'user_created', 'user', v_user_id::text, jsonb_build_object('email', p_email, 'role', p_role));

    RETURN jsonb_build_object('id', v_user_id, 'email', p_email, 'role', p_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Réinitialisation du mot de passe d'un utilisateur par le Super Admin
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accès refusé : privilège Super Admin requis.';
    END IF;

    IF length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Le mot de passe doit comporter au moins 6 caractères.';
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;

    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'password_reset', 'user', p_user_id::text, '{}'::jsonb);

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Activation / Désactivation d'un compte
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
    p_user_id UUID,
    p_is_active BOOLEAN
) RETURNS BOOLEAN AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accès refusé : privilège Super Admin requis.';
    END IF;

    IF p_user_id = auth.uid() AND NOT p_is_active THEN
        RAISE EXCEPTION 'Vous ne pouvez pas désactiver votre propre compte Super Admin.';
    END IF;

    UPDATE public.profiles
    SET is_active = p_is_active,
        updated_at = now()
    WHERE id = p_user_id;

    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), CASE WHEN p_is_active THEN 'user_activated' ELSE 'user_deactivated' END, 'user', p_user_id::text, '{}'::jsonb);

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mise à jour du rôle ou du nom d'un compte
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id UUID,
    p_full_name TEXT,
    p_role TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accès refusé : privilège Super Admin requis.';
    END IF;

    IF p_role NOT IN ('super_admin', 'member') THEN
        RAISE EXCEPTION 'Rôle invalide : %', p_role;
    END IF;

    UPDATE public.profiles
    SET full_name = p_full_name,
        role = p_role,
        updated_at = now()
    WHERE id = p_user_id;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', p_full_name)
    WHERE id = p_user_id;

    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'user_updated', 'user', p_user_id::text, jsonb_build_object('full_name', p_full_name, 'role', p_role));

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 8. Row Level Security (RLS)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numbering_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
CREATE POLICY "Users can view own profile or Super Admin can view all"
    ON public.profiles FOR SELECT
    USING (id = auth.uid() OR public.is_super_admin());

CREATE POLICY "Users can update own full_name only"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid() AND is_active = true)
    WITH CHECK (id = auth.uid());

CREATE POLICY "Super admin can update any profile"
    ON public.profiles FOR UPDATE
    USING (public.is_super_admin());

-- ---- CLIENTS ----
CREATE POLICY "Active users can view clients"
    ON public.clients FOR SELECT
    USING (public.is_active_user());

CREATE POLICY "Active users can insert clients"
    ON public.clients FOR INSERT
    WITH CHECK (public.is_active_user());

CREATE POLICY "Active users can update clients"
    ON public.clients FOR UPDATE
    USING (public.is_active_user());

CREATE POLICY "Super Admin can delete clients"
    ON public.clients FOR DELETE
    USING (public.is_super_admin());

-- ---- DOCUMENTS ----
CREATE POLICY "Members see own documents, Super Admin sees all"
    ON public.documents FOR SELECT
    USING (created_by = auth.uid() OR public.is_super_admin());

CREATE POLICY "Active users can create documents"
    ON public.documents FOR INSERT
    WITH CHECK (public.is_active_user() AND created_by = auth.uid());

CREATE POLICY "Members update own documents, Super Admin updates all"
    ON public.documents FOR UPDATE
    USING (created_by = auth.uid() OR public.is_super_admin())
    WITH CHECK (created_by = auth.uid() OR public.is_super_admin());

CREATE POLICY "Only Super Admin can delete documents"
    ON public.documents FOR DELETE
    USING (public.is_super_admin());

-- ---- DOCUMENT LINES ----
CREATE POLICY "Document lines follow parent document access (SELECT)"
    ON public.document_lines FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_lines.document_id
            AND (d.created_by = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Document lines follow parent document access (INSERT)"
    ON public.document_lines FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_lines.document_id
            AND (d.created_by = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Document lines follow parent document access (UPDATE)"
    ON public.document_lines FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_lines.document_id
            AND (d.created_by = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Document lines follow parent document access (DELETE)"
    ON public.document_lines FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_lines.document_id
            AND (d.created_by = auth.uid() OR public.is_super_admin())
        )
    );

-- ---- NUMBERING COUNTERS ----
CREATE POLICY "Active users can read and write numbering counters"
    ON public.numbering_counters FOR ALL
    USING (public.is_active_user());

-- ---- APP SETTINGS ----
CREATE POLICY "Active users can view settings"
    ON public.app_settings FOR SELECT
    USING (public.is_active_user());

CREATE POLICY "Only Super Admin can modify settings"
    ON public.app_settings FOR ALL
    USING (public.is_super_admin());

-- ---- AUDIT LOG ----
CREATE POLICY "Only Super Admin can view audit log"
    ON public.audit_log FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "System and active users can insert audit log"
    ON public.audit_log FOR INSERT
    WITH CHECK (public.is_active_user());

-- ==============================================================================
-- 9. Données initiales (Seed data pour app_settings)
-- ==============================================================================

INSERT INTO public.app_settings (key, value)
VALUES
('company', '{
    "legalName": "ESCALAR MEDIA",
    "brand": "NFC Maroc",
    "brandLine": "NFC Maroc est la marque commerciale d’ESCALAR MEDIA",
    "headOffice": "Imm 27 Abdellah Ben Yassine, 2ème étage, Bureau 29 — Casablanca",
    "correspondence": "11 Bd Zerktouni, étage 7, n° 21 — Casablanca",
    "phone": "06 64 87 71 81",
    "email": "contact@nfcmaroc.com",
    "website": "www.nfcmaroc.com",
    "capital": "100 000,00 MAD",
    "rcCity": "Casablanca",
    "rc": "637863",
    "if": "66034381",
    "ice": "003551091000096",
    "patente": "32503309",
    "cnss": "3824415",
    "city": "Casablanca"
}'::jsonb),

('defaults', '{
    "taxRate": 20,
    "currency": "MAD",
    "devisValidityDays": 30,
    "factureDueDays": 30,
    "devisConditions": "Prix fermes et non révisables pendant toute la durée de validité de l’offre",
    "devisPaymentTerms": "",
    "facturePaymentTerms": "",
    "factureNotes": ""
}'::jsonb),

('numbering', '{
    "devisPrefix": "D",
    "facturePrefix": "F"
}'::jsonb),

('drive', '{
    "clientId": "55803966065-amtbkjg06rgdnel0ioip4itnlmqv7g1b.apps.googleusercontent.com",
    "rootFolderId": "",
    "devisFolderId": "",
    "factureFolderId": ""
}'::jsonb),

('gemini', '{
    "apiKey": "",
    "model": "gemini-2.5-flash"
}'::jsonb),

('designations', '[
    {
        "id": "des_nfc_card",
        "title": "Cartes de visite NFC personnalisées",
        "description": "Fourniture de cartes de visite connectées avec puce NFC intégrée\nImpression quadri recto/verso haute définition\nConfiguration du profil numérique NFC Maroc et QR code de secours inclus",
        "price": "120",
        "qty": "10",
        "taxRate": 20
    },
    {
        "id": "des_google_review",
        "title": "Plaque connectée Google Avis NFC",
        "description": "Support de comptoir en plexiglas premium avec puce NFC & QR code\nLien direct vers votre fiche Google My Business pour collecte d’avis clients\nFormat compact, résistant aux UV et aux rayures",
        "price": "350",
        "qty": "1",
        "taxRate": 20
    },
    {
        "id": "des_graphism",
        "title": "Création graphique & Maquette BAT",
        "description": "Conception graphique personnalisée selon votre charte\nDéclinaison des éléments visuels et préparation des fichiers d’impression haute définition",
        "price": "250",
        "qty": "1",
        "taxRate": 20
    },
    {
        "id": "des_subscription",
        "title": "Abonnement annuel plateforme NFC Maroc",
        "description": "Hébergement du profil dynamique, modification illimitée des coordonnées et accès aux statistiques de scans en temps réel",
        "price": "300",
        "qty": "1",
        "taxRate": 20
    },
    {
        "id": "des_delivery",
        "title": "Frais de livraison express",
        "description": "Expédition sécurisée et livraison express à l’adresse convenue partout au Maroc",
        "price": "50",
        "qty": "1",
        "taxRate": 20
    }
]'::jsonb),

('quickTexts', '{
    "paymentTermsDevis": [
        "50 % à la commande, solde à la livraison",
        "Paiement comptant à la livraison",
        "100 % à la commande",
        "Virement bancaire sous 15 jours"
    ],
    "paymentTermsFacture": [
        "Paiement à réception de facture",
        "Paiement à 30 jours fin de mois",
        "Paiement comptant",
        "Virement bancaire"
    ],
    "conditionsDevis": [
        "Prix fermes et non révisables pendant toute la durée de validité de l’offre",
        "Délai de livraison : 5 à 7 jours ouvrables après validation du BAT",
        "Garantie de bon fonctionnement des puces NFC : 1 an",
        "Validation obligatoire du Bon à Tirer (BAT) avant production"
    ],
    "conditionsFacture": [
        "Pénalités de retard applicables conformément à la législation en vigueur",
        "Escompte pour paiement anticipé : néant"
    ],
    "subjects": [
        "Fourniture de cartes de visite NFC personnalisées",
        "Fourniture de plaques connectées Google Avis NFC",
        "Création de supports connectés NFC & solutions digitales",
        "Abonnement annuel plateforme NFC Maroc"
    ]
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

