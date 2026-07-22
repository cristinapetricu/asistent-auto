require("dotenv").config();
const express = require("express");
const cors = require("cors");
const webpush = require("web-push");
const cron = require("node-cron");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 3001;

webpush.setVapidDetails(
  "mailto:exemplu@exemplu.ro",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Client cu drepturi depline — folosit DOAR pe server, niciodată trimis către pagină.
// Poate citi/scrie peste toți utilizatorii, e nevoie de el pentru verificarea zilnică automată.
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// ---------- verificare cine sună, pe baza token-ului trimis de pagină după login ----------

async function identificaUtilizator(req, res, next) {
  const antet = req.headers.authorization || "";
  const token = antet.startsWith("Bearer ") ? antet.slice(7) : null;
  if (!token) return res.status(401).json({ eroare: "Lipsește autentificarea." });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ eroare: "Autentificare invalidă." });

  req.utilizatorId = data.user.id;
  next();
}

// ---------- utilitare ----------

function zileRamase(dataStr) {
  const azi = new Date();
  azi.setHours(0, 0, 0, 0);
  const tinta = new Date(dataStr + "T00:00:00");
  return Math.round((tinta - azi) / 86400000);
}

// ---------- rute API ----------

app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Frontend-ul trimite aici abonamentul de push generat de browser, după login + "Permite".
app.post("/api/abonare", identificaUtilizator, async (req, res) => {
  const { error } = await supabaseAdmin.from("abonamente").upsert(
    {
      user_id: req.utilizatorId,
      endpoint: req.body.endpoint,
      abonament_complet: req.body,
    },
    { onConflict: "endpoint" }
  );
  if (error) return res.status(500).json({ eroare: error.message });
  res.status(201).json({ ok: true });
});

app.post("/api/dezabonare", identificaUtilizator, async (req, res) => {
  await supabaseAdmin.from("abonamente").delete().eq("endpoint", req.body.endpoint).eq("user_id", req.utilizatorId);
  res.json({ ok: true });
});

// Trimite o notificare de test imediat, doar către utilizatorul autentificat curent.
app.post("/api/test-notificare", identificaUtilizator, async (req, res) => {
  const { data: abonamente } = await supabaseAdmin
    .from("abonamente")
    .select("abonament_complet")
    .eq("user_id", req.utilizatorId);

  const rezultate = await trimiteCatreAbonamente(abonamente || [], {
    titlu: "Panou de bord",
    corp: "Notificările funcționează. Așa vei fi anunțat despre documente.",
  });
  res.json({ trimis: rezultate.trimise });
});

// ---------- trimitere efectivă de notificări ----------

async function trimiteCatreAbonamente(randuriAbonamente, { titlu, corp }) {
  const payload = JSON.stringify({ titlu, corp });
  let trimise = 0;
  const endpointuriMoarte = [];

  for (const rand of randuriAbonamente) {
    try {
      await webpush.sendNotification(rand.abonament_complet, payload);
      trimise++;
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        endpointuriMoarte.push(rand.abonament_complet.endpoint);
      }
    }
  }
  return { trimise, endpointuriMoarte };
}

async function verificaSiNotificaToti() {
  const { data: documente } = await supabaseAdmin.from("documente").select("*");
  if (!documente || documente.length === 0) return;

  const idUtilizatori = [...new Set(documente.map((d) => d.user_id))];

  for (const userId of idUtilizatori) {
    const { data: abonamente } = await supabaseAdmin
      .from("abonamente")
      .select("abonament_complet")
      .eq("user_id", userId);
    if (!abonamente || abonamente.length === 0) continue;

    const documenteUtilizator = documente.filter((d) => d.user_id === userId);
    for (const doc of documenteUtilizator) {
      const zile = zileRamase(doc.data_expirare);
      const prag = doc.prealarma || 7;
      if (zile <= prag) {
        const corp = zile < 0 ? `A expirat acum ${Math.abs(zile)} zile.` : `Mai sunt ${zile} zile până expiră.`;
        await trimiteCatreAbonamente(abonamente, { titlu: doc.nume, corp });
      }
    }
  }
}

// Verificare automată în fiecare zi la 09:00, ora serverului.
cron.schedule("0 9 * * *", () => {
  verificaSiNotificaToti().catch((e) => console.error("Eroare la verificarea zilnică:", e));
});

app.listen(PORT, () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
