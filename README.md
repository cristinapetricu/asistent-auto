# Asistent Auto

Aplicație web instalabilă (PWA), cu cont propriu pentru fiecare persoană — documente (rovinietă, ITP, RCA, revizie, permis...), jurnal de combustibil & cheltuieli, și istoric service, pentru unul sau mai multe vehicule. Notificări reale pe telefon, chiar și cu aplicația închisă.

Ai deja repo-ul pe GitHub, plus Render și Netlify configurate de la versiunea anterioară — refolosim exact aceleași, doar înlocuim conținutul și adăugăm Supabase (autentificare + bază de date).

## 1. Creează proiectul Supabase (nou, gratuit)

1. Cont pe [supabase.com](https://supabase.com) → **New project**
2. Alege un nume (ex: `asistent-auto`), o parolă pentru baza de date (o poți genera automat, nu ai nevoie de ea direct) și o regiune apropiată (Europe)
3. Așteaptă 1-2 minute să se creeze

**Rulează schema bazei de date:**
1. În proiectul Supabase → meniul din stânga → **SQL Editor** → **New query**
2. Deschide fișierul `supabase-schema.sql` din acest folder, copiază tot conținutul, lipește-l în editor
3. **Run**

**Ia cheile de care ai nevoie:**
1. În Supabase → **Project Settings** (rotița) → **API**
2. Copiază:
   - **Project URL** (arată ca `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key (cheie lungă, e publică, poate fi văzută de oricine folosește aplicația — asta e normal și în regulă)
   - **service_role** key (cheie **secretă** — asta NU trebuie să ajungă niciodată în frontend, doar pe server)

## 2. Configurează fișierele cu cheile tale

**`frontend/config.js`** — deschide-l și înlocuiește:
```js
window.CONFIG = {
  SUPABASE_URL: "https://xxxxxxxxxxxx.supabase.co",   // Project URL de la tine
  SUPABASE_ANON_KEY: "...",                             // cheia anon public de la tine
  API_URL: "https://panou-bord-app.onrender.com",       // rămâne cea de dinainte
};
```

**`backend/.env`** — adaugă cele două linii de jos (VAPID-urile rămân neschimbate):
```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=cheia_ta_service_role
```

## 3. Urcă totul pe GitHub

```
git add .
git commit -m "Adaug login, vehicule, combustibil și service"
git push
```

Netlify redeploy-ează singur (auto publishing e pornit). Pentru Render, mai trebuie un pas — variabilele de mediu noi trebuie adăugate manual (Render nu le ia din `.env`, `.env`-ul e doar pentru rularea locală):

1. Render → serviciul tău → **Environment**
2. **Add Environment Variable** de două ori:
   - `SUPABASE_URL` → Project URL-ul tău
   - `SUPABASE_SERVICE_ROLE_KEY` → cheia service_role
3. Salvează — Render redeploy-ează automat cu variabilele noi

## 4. Testează

Deschide adresa Netlify — ar trebui să vezi ecranul de **Autentificare / Cont nou**. Creează-ți un cont (email + parolă), apoi:
1. Adaugă prima mașină (butonul **+** din antet)
2. Explorează cele trei secțiuni din bara de jos: **Documente**, **Combustibil**, **Service**
3. Permite notificările când apare bannerul

Fiecare persoană căreia îi trimiți linkul își creează propriul cont și vede **doar** datele ei — separarea e garantată de baza de date (row level security), nu doar de interfață.

## Ce s-a schimbat față de versiunea anterioară

- Autentificare reală (email + parolă), fiecare cu datele lui, complet separate
- Suport pentru mai multe vehicule per cont
- Jurnal de combustibil cu calcul automat al consumului mediu (L/100km)
- Istoric de service/reparații cu costuri
- Backend-ul (Render) s-a simplificat — acum se ocupă doar de trimiterea notificărilor; documentele/combustibilul/service-ul se salvează direct în Supabase

## Extindere ulterioară

- Resetare parolă (Supabase o suportă, mai trebuie configurat un email template)
- Reminder de service bazat pe kilometraj, nu doar pe dată
- Export de rapoarte (PDF/Excel) cu cheltuielile pe ultimul an
- Varianta pentru Google Play (posibilă via Trusted Web Activity — taxă unică de 25$ la Google, plus o perioadă de testare închisă obligatorie de 14 zile)
