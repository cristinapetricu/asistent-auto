// ---------- inițializare ----------

const supa = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
const API_URL = window.CONFIG.API_URL;

const TIPURI_DOCUMENT = [
  { id: "rovinieta", nume: "Rovinietă" },
  { id: "itp", nume: "ITP" },
  { id: "rca", nume: "RCA" },
  { id: "casco", nume: "CASCO" },
  { id: "revizie", nume: "Revizie tehnică" },
  { id: "permis", nume: "Permis de conducere" },
  { id: "trusa", nume: "Trusă & stingător" },
  { id: "altul", nume: "Alt document" },
];

const TIPURI_CHELTUIALA = [
  { id: "combustibil", nume: "Combustibil" },
  { id: "parcare", nume: "Parcare" },
  { id: "altele", nume: "Altele" },
];

let vehicule = [];
let vehiculActivId = null;
let sectiuneActiva = "documente";
let editeazaId = null;
let formularNouDeschis = false;

const elEcranAuth = document.getElementById("ecran-auth");
const elApp = document.getElementById("app");
const elContinut = document.getElementById("continut-principal");
const elSelectorVehicul = document.getElementById("selector-vehicul");
const elMesajAuth = document.getElementById("auth-mesaj");

// ---------- utilitare ----------

function formatBani(suma) {
  return Number(suma).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " lei";
}

function formatDataRO(dataStr) {
  const d = new Date(dataStr + "T00:00:00");
  return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "long", year: "numeric" });
}

function zileRamase(dataStr) {
  const azi = new Date();
  azi.setHours(0, 0, 0, 0);
  const tinta = new Date(dataStr + "T00:00:00");
  return Math.round((tinta - azi) / 86400000);
}

function stareDocument(zile) {
  if (zile < 0) return { cheie: "expirat", eticheta: "Expirat", culoare: "var(--danger)" };
  if (zile <= 7) return { cheie: "urgent", eticheta: "Urgent", culoare: "var(--danger)" };
  if (zile <= 30) return { cheie: "atentie", eticheta: "În curând", culoare: "var(--warning)" };
  return { cheie: "ok", eticheta: "În regulă", culoare: "var(--success)" };
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Sigur = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruta = atob(base64Sigur);
  return Uint8Array.from([...bruta].map((c) => c.charCodeAt(0)));
}

async function tokenCurent() {
  const { data } = await supa.auth.getSession();
  return data.session?.access_token || null;
}

function calculeazaKmPeZi(cheltuieliCuKm) {
  const intrari = cheltuieliCuKm.filter((c) => c.km != null).sort((a, b) => new Date(a.data) - new Date(b.data));
  if (intrari.length < 2) return null;
  const prima = intrari[0];
  const ultima = intrari[intrari.length - 1];
  const zileTotale = (new Date(ultima.data) - new Date(prima.data)) / 86400000;
  const kmTotali = ultima.km - prima.km;
  if (zileTotale <= 0 || kmTotali <= 0) return null;
  return kmTotali / zileTotale;
}

// ---------- selector de locație pe hartă ----------

let hartaLeaflet = null;
let hartaMarker = null;

function deschideSelectorLocatie(valoareInitiala) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("overlay-harta");
    const status = document.getElementById("harta-status");
    const campManual = document.getElementById("harta-adresa-manuala");
    campManual.value = valoareInitiala?.text || "";
    overlay.classList.remove("ascuns");

    let locatieCurenta = valoareInitiala?.lat ? { lat: valoareInitiala.lat, lon: valoareInitiala.lon } : null;

    setTimeout(() => {
      if (hartaLeaflet) { hartaLeaflet.remove(); hartaLeaflet = null; }
      const centruInitial = locatieCurenta || { lat: 45.9432, lon: 24.9668 }; // centrul României, dacă nu știm nimic
      hartaLeaflet = L.map("harta-container").setView([centruInitial.lat, centruInitial.lon], locatieCurenta ? 15 : 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(hartaLeaflet);

      function puneMarker(lat, lon) {
        locatieCurenta = { lat, lon };
        if (hartaMarker) hartaMarker.remove();
        hartaMarker = L.marker([lat, lon], { draggable: true }).addTo(hartaLeaflet);
        hartaMarker.on("dragend", (e) => {
          const p = e.target.getLatLng();
          locatieCurenta = { lat: p.lat, lon: p.lng };
        });
      }

      if (locatieCurenta) puneMarker(locatieCurenta.lat, locatieCurenta.lon);

      hartaLeaflet.on("click", (e) => puneMarker(e.latlng.lat, e.latlng.lng));

      if (!valoareInitiala?.lat && navigator.geolocation) {
        status.textContent = "Se caută locația...";
        navigator.geolocation.getCurrentPosition(
          (poz) => {
            const { latitude, longitude } = poz.coords;
            hartaLeaflet.setView([latitude, longitude], 15);
            puneMarker(latitude, longitude);
            status.textContent = "Locație găsită automat — poți muta pinul dacă nu e exact.";
          },
          () => {
            status.textContent = "Nu am putut lua locația automat — pune pinul manual pe hartă sau scrie adresa jos.";
          },
          { timeout: 8000 }
        );
      } else if (valoareInitiala?.lat) {
        status.textContent = "Poți muta pinul dacă vrei să corectezi locația.";
      } else {
        status.textContent = "Pune pinul manual pe hartă sau scrie adresa jos.";
      }
    }, 50);

    async function reverseGeocode(lat, lon) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const d = await r.json();
        return d.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      } catch (e) {
        return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }
    }

    function curata() {
      overlay.classList.add("ascuns");
      if (hartaLeaflet) { hartaLeaflet.remove(); hartaLeaflet = null; hartaMarker = null; }
      document.getElementById("harta-confirma").onclick = null;
      document.getElementById("harta-anuleaza").onclick = null;
      document.getElementById("harta-inchide").onclick = null;
    }

    document.getElementById("harta-confirma").onclick = async () => {
      if (campManual.value.trim() && !locatieCurenta) {
        curata();
        resolve({ text: campManual.value.trim(), lat: null, lon: null });
        return;
      }
      if (!locatieCurenta) {
        curata();
        resolve(null);
        return;
      }
      const text = campManual.value.trim() || (await reverseGeocode(locatieCurenta.lat, locatieCurenta.lon));
      curata();
      resolve({ text, lat: locatieCurenta.lat, lon: locatieCurenta.lon });
    };
    document.getElementById("harta-anuleaza").onclick = () => { curata(); resolve(undefined); };
    document.getElementById("harta-inchide").onclick = () => { curata(); resolve(undefined); };
  });
}

// ---------- autentificare ----------

document.querySelectorAll(".tab-auth-buton").forEach((buton) => {
  buton.onclick = () => {
    document.querySelectorAll(".tab-auth-buton").forEach((b) => b.classList.remove("activ"));
    buton.classList.add("activ");
    const tab = buton.dataset.tab;
    document.getElementById("formular-login").classList.toggle("ascuns", tab !== "login");
    document.getElementById("formular-inregistrare").classList.toggle("ascuns", tab !== "inregistrare");
    elMesajAuth.classList.add("ascuns");
  };
});

function arataMesajAuth(text, succes) {
  elMesajAuth.textContent = text;
  elMesajAuth.classList.remove("ascuns");
  elMesajAuth.classList.toggle("succes", !!succes);
}

document.getElementById("formular-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const parola = document.getElementById("login-parola").value;
  const { error } = await supa.auth.signInWithPassword({ email, password: parola });
  if (error) arataMesajAuth(error.message === "Invalid login credentials" ? "Email sau parolă greșită." : error.message, false);
});

document.getElementById("formular-inregistrare").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("reg-email").value.trim();
  const parola = document.getElementById("reg-parola").value;
  const { error } = await supa.auth.signUp({ email, password: parola });
  if (error) {
    arataMesajAuth(error.message, false);
  } else {
    arataMesajAuth("Cont creat. Dacă ți se cere, confirmă emailul primit, apoi intră în cont.", true);
  }
});

document.getElementById("btn-delogare").onclick = async () => {
  await supa.auth.signOut();
};

supa.auth.onAuthStateChange((eveniment, sesiune) => {
  if (sesiune) {
    elEcranAuth.classList.add("ascuns");
    elApp.classList.remove("ascuns");
    porneste();
  } else {
    elApp.classList.add("ascuns");
    elEcranAuth.classList.remove("ascuns");
    vehicule = [];
    vehiculActivId = null;
  }
});

// ---------- vehicule ----------

async function incarcaVehicule() {
  const { data } = await supa.from("vehicule").select("*").order("creat_la");
  vehicule = data || [];
  if (!vehiculActivId && vehicule.length > 0) vehiculActivId = vehicule[0].id;
  randeazaSelectorVehicule();
}

function randeazaSelectorVehicule() {
  elSelectorVehicul.innerHTML = vehicule
    .map((v) => `<option value="${v.id}" ${v.id === vehiculActivId ? "selected" : ""}>${v.nume}</option>`)
    .join("");
}

elSelectorVehicul.onchange = () => {
  vehiculActivId = elSelectorVehicul.value;
  randeazaSectiune();
};

document.getElementById("btn-editeaza-vehicul").onclick = () => {
  const vehiculActiv = vehicule.find((v) => v.id === vehiculActivId);
  if (vehiculActiv) deschideFormularVehicul(vehiculActiv);
};

function deschideFormularVehicul(existent) {
  const nod = document.getElementById("sablon-formular-vehicul").content.cloneNode(true);
  const card = nod.querySelector(".card-formular");
  const campNume = card.querySelector('[data-rol="nume"]');
  const campNumar = card.querySelector('[data-rol="numar"]');
  const campCapacitate = card.querySelector('[data-rol="capacitate"]');

  if (existent) {
    campNume.value = existent.nume;
    campNumar.value = existent.numar_inmatriculare || "";
    campCapacitate.value = existent.capacitate_rezervor || "";
  }

  card.querySelector('[data-rol="salveaza"]').onclick = async () => {
    const nume = campNume.value.trim();
    if (!nume) return;
    const valori = {
      nume,
      numar_inmatriculare: campNumar.value.trim(),
      capacitate_rezervor: campCapacitate.value ? Number(campCapacitate.value) : null,
    };
    if (existent) {
      const { data, error } = await supa.from("vehicule").update(valori).eq("id", existent.id).select().single();
      if (!error) vehicule = vehicule.map((v) => (v.id === existent.id ? data : v));
    } else {
      const { data: sesiune } = await supa.auth.getSession();
      const { data, error } = await supa
        .from("vehicule")
        .insert({ ...valori, user_id: sesiune.session.user.id })
        .select()
        .single();
      if (!error) {
        await supa.from("vehicul_membri").insert({ vehicul_id: data.id, user_id: sesiune.session.user.id, rol: "proprietar" });
        vehicule.push(data);
        vehiculActivId = data.id;
      }
    }
    randeazaSelectorVehicule();
    randeazaSectiune();
    document.getElementById("overlay-vehicul")?.remove();
  };
  card.querySelector('[data-rol="anuleaza"]').onclick = () => document.getElementById("overlay-vehicul")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "overlay-vehicul";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50;";
  const container = document.createElement("div");
  container.style.cssText = "max-width:380px;width:100%;";
  container.appendChild(card);
  overlay.appendChild(container);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

document.getElementById("btn-adauga-vehicul").onclick = () => deschideFormularVehicul(null);

// ---------- partajare vehicul ----------

function codAleatoriu() {
  return Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

document.querySelectorAll("#tab-partajare .tab-mic-buton").forEach((buton) => {
  buton.onclick = () => {
    document.querySelectorAll("#tab-partajare .tab-mic-buton").forEach((b) => b.classList.remove("activ"));
    buton.classList.add("activ");
    const tab = buton.dataset.tab;
    document.getElementById("zona-invita").classList.toggle("ascuns", tab !== "invita");
    document.getElementById("zona-alatura").classList.toggle("ascuns", tab !== "alatura");
  };
});

document.getElementById("btn-partajare").onclick = () => {
  document.getElementById("overlay-partajare").classList.remove("ascuns");
  document.getElementById("cod-generat").classList.add("ascuns");
  document.getElementById("alatura-mesaj").classList.add("ascuns");
  document.getElementById("camp-cod-invitatie").value = "";
};
document.getElementById("partajare-inchide").onclick = () => document.getElementById("overlay-partajare").classList.add("ascuns");

document.getElementById("btn-genereaza-cod").onclick = async () => {
  if (!vehiculActivId) return;
  const { data: sesiune } = await supa.auth.getSession();
  const cod = codAleatoriu();
  const { error } = await supa.from("invitatii").insert({ vehicul_id: vehiculActivId, cod, creat_de: sesiune.session.user.id });
  const elCod = document.getElementById("cod-generat");
  if (error) {
    elCod.textContent = "Nu am putut genera codul. Încearcă din nou.";
  } else {
    elCod.textContent = cod;
  }
  elCod.classList.remove("ascuns");
};

document.getElementById("btn-foloseste-cod").onclick = async () => {
  const cod = document.getElementById("camp-cod-invitatie").value.trim().toUpperCase();
  const elMesaj = document.getElementById("alatura-mesaj");
  if (!cod) return;
  const { data: invitatie } = await supa.from("invitatii").select("*").eq("cod", cod).eq("folosit", false).maybeSingle();
  if (!invitatie) {
    elMesaj.textContent = "Cod invalid sau deja folosit.";
    elMesaj.classList.remove("ascuns");
    elMesaj.classList.remove("succes");
    return;
  }
  const { data: sesiune } = await supa.auth.getSession();
  const { error: eroareMembru } = await supa
    .from("vehicul_membri")
    .insert({ vehicul_id: invitatie.vehicul_id, user_id: sesiune.session.user.id, rol: "membru" });
  if (eroareMembru) {
    elMesaj.textContent = "Ești deja membru al acestui vehicul, sau a apărut o eroare.";
    elMesaj.classList.remove("ascuns");
    return;
  }
  await supa.from("invitatii").update({ folosit: true, folosit_de: sesiune.session.user.id }).eq("id", invitatie.id);
  elMesaj.textContent = "Te-ai alăturat vehiculului!";
  elMesaj.classList.remove("ascuns");
  elMesaj.classList.add("succes");
  await incarcaVehicule();
  vehiculActivId = invitatie.vehicul_id;
  randeazaSelectorVehicule();
  randeazaSectiune();
  setTimeout(() => document.getElementById("overlay-partajare").classList.add("ascuns"), 1200);
};

// ---------- navigare secțiuni ----------

document.querySelectorAll(".tab-navigare").forEach((buton) => {
  buton.onclick = () => {
    document.querySelectorAll(".tab-navigare").forEach((b) => b.classList.remove("activ"));
    buton.classList.add("activ");
    sectiuneActiva = buton.dataset.sectiune;
    editeazaId = null;
    formularNouDeschis = false;
    randeazaSectiune();
  };
});

function randeazaSectiune() {
  if (!vehiculActivId) {
    elContinut.innerHTML = `<div class="gol"><p>Adaugă mai întâi o mașină, ca să poți ține evidența pentru ea.</p></div>`;
    return;
  }
  if (sectiuneActiva === "documente") randeazaDocumente();
  else if (sectiuneActiva === "combustibil") randeazaCombustibil();
  else if (sectiuneActiva === "service") randeazaService();
  else if (sectiuneActiva === "harta") randeazaHarta();
  else if (sectiuneActiva === "rapoarte") randeazaRapoarte();
}

// ---------- secțiunea DOCUMENTE ----------

async function randeazaDocumente() {
  elContinut.innerHTML = `<p class="incarcare">Se încarcă...</p>`;
  const { data } = await supa.from("documente").select("*").eq("vehicul_id", vehiculActivId);
  const documente = (data || []).sort((a, b) => zileRamase(a.data_expirare) - zileRamase(b.data_expirare));

  const { data: cheltuieliKm } = await supa.from("cheltuieli").select("data, km").eq("vehicul_id", vehiculActivId).not("km", "is", null);
  const kmPeZi = calculeazaKmPeZi(cheltuieliKm || []);
  let kmCurentEstimat = null;
  if (kmPeZi && cheltuieliKm?.length) {
    const ultima = [...cheltuieliKm].sort((a, b) => new Date(b.data) - new Date(a.data))[0];
    const zileDeLaUltima = (new Date() - new Date(ultima.data)) / 86400000;
    kmCurentEstimat = ultima.km + kmPeZi * Math.max(0, zileDeLaUltima);
  }

  const r = { expirat: 0, urgent: 0, atentie: 0, ok: 0 };
  documente.forEach((d) => r[stareDocument(zileRamase(d.data_expirare)).cheie]++);

  let html = `
    <h2 class="titlu-sectiune">Documente</h2>
    <p class="subtitlu-sectiune">Remindere pentru documentele mașinii selectate.</p>
  `;

  if (documente.length > 0) {
    html += `<div class="rezumat">
      <div class="pastila"><b style="color:var(--danger)">${r.expirat}</b>Expirate</div>
      <div class="pastila"><b style="color:var(--danger)">${r.urgent}</b>Urgente</div>
      <div class="pastila"><b style="color:var(--warning)">${r.atentie}</b>În curând</div>
      <div class="pastila"><b style="color:var(--success)">${r.ok}</b>În regulă</div>
    </div>`;
  }

  elContinut.innerHTML = html;

  if (documente.length === 0 && !formularNouDeschis) {
    const gol = document.createElement("div");
    gol.className = "gol";
    gol.innerHTML = `<p>Nimic în evidență încă pentru acest vehicul.</p>`;
    const buton = document.createElement("button");
    buton.className = "buton buton-primar";
    buton.textContent = "+ Adaugă document";
    buton.onclick = () => { formularNouDeschis = true; randeazaDocumente(); };
    gol.appendChild(buton);
    elContinut.appendChild(gol);
    return;
  }

  const lista = document.createElement("div");
  lista.className = "lista";

  documente.forEach((doc) => {
    if (editeazaId === doc.id) {
      lista.appendChild(creeazaFormularDocument(doc));
      return;
    }
    const zile = zileRamase(doc.data_expirare);
    const s = stareDocument(zile);
    const card = document.createElement("div");
    card.className = "card card-document";
    card.style.borderLeft = `4px solid ${s.culoare}`;
    const cifre = String(Math.abs(zile)).split("").map((c) => `<div class="cifra">${c}</div>`).join("");
    let predictieKm = "";
    if (doc.km_tinta && kmPeZi && kmCurentEstimat != null) {
      const kmRamasi = doc.km_tinta - kmCurentEstimat;
      if (kmRamasi > 0) {
        const ziuaEstimata = Math.round(kmRamasi / kmPeZi);
        predictieKm = `<div class="card-detalii" style="margin-top:4px;">🚗 La ritmul tău (~${Math.round(kmPeZi)} km/zi), ajungi la ${doc.km_tinta.toLocaleString("ro-RO")} km în ~${ziuaEstimata} zile</div>`;
      } else {
        predictieKm = `<div class="card-detalii" style="margin-top:4px;color:var(--warning);">🚗 Ai depășit deja kilometrajul țintă (${doc.km_tinta.toLocaleString("ro-RO")} km)</div>`;
      }
    }
    card.innerHTML = `
      <div>
        <div class="card-eticheta" style="color:${s.culoare}">${s.eticheta}</div>
        <div class="card-nume">${doc.nume}</div>
        <div class="card-detalii">Expiră ${formatDataRO(doc.data_expirare)}${doc.nota ? " · " + doc.nota : ""}</div>
        ${predictieKm}
      </div>
      <div class="card-dreapta">
        <div>
          <div class="odometru">${cifre}</div>
          <div class="odometru-eticheta">${zile < 0 ? "zile depășit" : "zile rămase"}</div>
        </div>
        <div class="actiuni-card">
          <button class="buton-icon" data-actiune="editeaza">✎</button>
          <button class="buton-icon" data-actiune="sterge" style="color:var(--danger)">🗑</button>
        </div>
      </div>
    `;
    card.querySelector('[data-actiune="editeaza"]').onclick = () => { editeazaId = doc.id; randeazaDocumente(); };
    card.querySelector('[data-actiune="sterge"]').onclick = async () => {
      await supa.from("documente").delete().eq("id", doc.id);
      randeazaDocumente();
    };
    lista.appendChild(card);
  });

  if (formularNouDeschis) {
    lista.appendChild(creeazaFormularDocument(null));
  } else {
    const buton = document.createElement("button");
    buton.className = "buton-plus";
    buton.textContent = "+ Adaugă document";
    buton.onclick = () => { formularNouDeschis = true; randeazaDocumente(); };
    lista.appendChild(buton);
  }

  elContinut.appendChild(lista);
}

function creeazaFormularDocument(existent) {
  const nod = document.getElementById("sablon-formular-document").content.cloneNode(true);
  const card = nod.querySelector(".card-formular");
  const zonaChipuri = card.querySelector('[data-rol="chipuri"]');
  const campNume = card.querySelector('[data-rol="nume"]');
  const campData = card.querySelector('[data-rol="data"]');
  const campNota = card.querySelector('[data-rol="nota"]');
  const campPrealarma = card.querySelector('[data-rol="prealarma"]');
  const campKmTinta = card.querySelector('[data-rol="km-tinta"]');
  let tipSelectat = existent?.tip || "rovinieta";

  TIPURI_DOCUMENT.forEach((t) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (t.id === tipSelectat ? " activ" : "");
    chip.textContent = t.nume;
    chip.onclick = () => {
      tipSelectat = t.id;
      zonaChipuri.querySelectorAll(".chip").forEach((c) => c.classList.remove("activ"));
      chip.classList.add("activ");
      if (!existent && !campNume.value) campNume.value = t.nume;
    };
    zonaChipuri.appendChild(chip);
  });

  if (existent) {
    campNume.value = existent.nume;
    campData.value = existent.data_expirare;
    campNota.value = existent.nota || "";
    campPrealarma.value = existent.prealarma || 7;
    campKmTinta.value = existent.km_tinta || "";
  }

  card.querySelector('[data-rol="salveaza"]').onclick = async () => {
    if (!campNume.value.trim() || !campData.value) return;
    const valori = {
      nume: campNume.value.trim(),
      tip: tipSelectat,
      data_expirare: campData.value,
      nota: campNota.value.trim(),
      prealarma: Number(campPrealarma.value) || 7,
      km_tinta: campKmTinta.value ? Number(campKmTinta.value) : null,
    };
    if (existent) {
      await supa.from("documente").update(valori).eq("id", existent.id);
    } else {
      const { data: sesiune } = await supa.auth.getSession();
      await supa.from("documente").insert({ ...valori, user_id: sesiune.session.user.id, vehicul_id: vehiculActivId });
    }
    editeazaId = null;
    formularNouDeschis = false;
    randeazaDocumente();
  };
  card.querySelector('[data-rol="anuleaza"]').onclick = () => {
    editeazaId = null;
    formularNouDeschis = false;
    randeazaDocumente();
  };

  return card;
}

// ---------- secțiunea COMBUSTIBIL ----------

async function randeazaCombustibil() {
  elContinut.innerHTML = `<p class="incarcare">Se încarcă...</p>`;
  const { data } = await supa.from("cheltuieli").select("*").eq("vehicul_id", vehiculActivId).order("data", { ascending: false });
  const cheltuieli = data || [];

  const totalGeneral = cheltuieli.reduce((s, c) => s + Number(c.suma), 0);
  const combustibil = cheltuieli.filter((c) => c.tip === "combustibil");
  const totalCombustibil = combustibil.reduce((s, c) => s + Number(c.suma), 0);

  const combustibilCuKm = combustibil.filter((c) => c.km != null && c.litri != null).sort((a, b) => a.km - b.km);
  let consumMediu = null;
  if (combustibilCuKm.length >= 2) {
    const distantaTotala = combustibilCuKm[combustibilCuKm.length - 1].km - combustibilCuKm[0].km;
    const litriTotali = combustibilCuKm.slice(1).reduce((s, c) => s + Number(c.litri), 0);
    if (distantaTotala > 0) consumMediu = ((litriTotali / distantaTotala) * 100).toFixed(1);
  }

  const combustibilCuLitri = combustibil.filter((c) => c.litri != null && c.litri > 0);
  let pretMediuLitru = null;
  if (combustibilCuLitri.length > 0) {
    const sumaTotalaLitri = combustibilCuLitri.reduce((s, c) => s + Number(c.suma), 0);
    const litriTotali2 = combustibilCuLitri.reduce((s, c) => s + Number(c.litri), 0);
    pretMediuLitru = (sumaTotalaLitri / litriTotali2).toFixed(2);
  }

  elContinut.innerHTML = `
    <h2 class="titlu-sectiune">Combustibil & cheltuieli</h2>
    <p class="subtitlu-sectiune">Jurnalul alimentărilor și al celorlalte cheltuieli pentru acest vehicul.</p>
    <div class="rezumat">
      <div class="pastila"><b>${formatBani(totalGeneral)}</b>Total cheltuit</div>
      <div class="pastila"><b>${formatBani(totalCombustibil)}</b>Combustibil</div>
      <div class="pastila"><b>${consumMediu ? consumMediu + " L" : "—"}</b>Consum mediu/100km</div>
      <div class="pastila"><b>${pretMediuLitru ? pretMediuLitru + " lei" : "—"}</b>Preț mediu/litru</div>
    </div>
    <button id="btn-autonomie" class="buton buton-secundar buton-lat" style="margin-bottom:16px;">⛽ Estimează cât mai pot merge</button>
  `;

  document.getElementById("btn-autonomie").onclick = () => estimeazaAutonomie(consumMediu, combustibilCuKm);

  const lista = document.createElement("div");
  lista.className = "lista";

  if (cheltuieli.length === 0 && !formularNouDeschis) {
    const gol = document.createElement("div");
    gol.className = "gol";
    gol.innerHTML = `<p>Nicio cheltuială înregistrată încă.</p>`;
    const buton = document.createElement("button");
    buton.className = "buton buton-primar";
    buton.textContent = "+ Adaugă cheltuială";
    buton.onclick = () => { formularNouDeschis = true; randeazaCombustibil(); };
    gol.appendChild(buton);
    elContinut.appendChild(gol);
    return;
  }

  cheltuieli.forEach((c) => {
    if (editeazaId === c.id) {
      lista.appendChild(creeazaFormularCheltuiala(c));
      return;
    }
    const tipNume = TIPURI_CHELTUIALA.find((t) => t.id === c.tip)?.nume || c.tip;
    const card = document.createElement("div");
    card.className = "card card-lista-simpla";
    card.innerHTML = `
      <div class="stanga">
        <div class="eticheta-tip">${tipNume}</div>
        <div class="card-nume">${c.descriere || tipNume}</div>
        <div class="card-detalii">${formatDataRO(c.data)}${c.km ? " · " + c.km.toLocaleString("ro-RO") + " km" : ""}${c.litri ? " · " + c.litri + " L" : ""}${c.locatie_text ? " · 📍 " + c.locatie_text : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="suma">${formatBani(c.suma)}</div>
        <div class="actiuni-card">
          <button class="buton-icon" data-actiune="editeaza">✎</button>
          <button class="buton-icon" data-actiune="sterge" style="color:var(--danger)">🗑</button>
        </div>
      </div>
    `;
    card.querySelector('[data-actiune="editeaza"]').onclick = () => { editeazaId = c.id; randeazaCombustibil(); };
    card.querySelector('[data-actiune="sterge"]').onclick = async () => {
      await supa.from("cheltuieli").delete().eq("id", c.id);
      randeazaCombustibil();
    };
    lista.appendChild(card);
  });

  if (formularNouDeschis) {
    lista.appendChild(creeazaFormularCheltuiala(null));
  } else {
    const buton = document.createElement("button");
    buton.className = "buton-plus";
    buton.textContent = "+ Adaugă cheltuială";
    buton.onclick = () => { formularNouDeschis = true; randeazaCombustibil(); };
    lista.appendChild(buton);
  }

  elContinut.appendChild(lista);
}

function creeazaFormularCheltuiala(existent) {
  const nod = document.getElementById("sablon-formular-cheltuiala").content.cloneNode(true);
  const card = nod.querySelector(".card-formular");
  const zonaChipuri = card.querySelector('[data-rol="chipuri-tip"]');
  const campData = card.querySelector('[data-rol="data"]');
  const campKm = card.querySelector('[data-rol="km"]');
  const campLitri = card.querySelector('[data-rol="litri"]');
  const campSuma = card.querySelector('[data-rol="suma"]');
  const campDescriere = card.querySelector('[data-rol="descriere"]');
  const wrapLitri = card.querySelector('[data-rol="camp-litri-wrap"]');
  const butonLocatie = card.querySelector('[data-rol="buton-locatie"]');
  const elLocatieText = card.querySelector('[data-rol="locatie-text"]');
  let tipSelectat = existent?.tip || "combustibil";
  let locatie = existent?.locatie_text ? { text: existent.locatie_text, lat: existent.latitudine, lon: existent.longitudine } : null;

  function actualizeazaLocatieAfisata() {
    if (locatie) {
      elLocatieText.textContent = "📍 " + locatie.text;
      elLocatieText.classList.remove("ascuns");
      butonLocatie.textContent = "📍 Schimbă locația";
    } else {
      elLocatieText.classList.add("ascuns");
      butonLocatie.textContent = "📍 Adaugă locație";
    }
  }
  actualizeazaLocatieAfisata();

  butonLocatie.onclick = async () => {
    const rezultat = await deschideSelectorLocatie(locatie);
    if (rezultat === undefined) return; // anulat, nu schimbăm nimic
    locatie = rezultat; // poate fi null, dacă a confirmat fără nimic
    actualizeazaLocatieAfisata();
  };

  function actualizeazaVizibilitateLitri() {
    wrapLitri.style.display = tipSelectat === "combustibil" ? "flex" : "none";
  }

  TIPURI_CHELTUIALA.forEach((t) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (t.id === tipSelectat ? " activ" : "");
    chip.textContent = t.nume;
    chip.onclick = () => {
      tipSelectat = t.id;
      zonaChipuri.querySelectorAll(".chip").forEach((c) => c.classList.remove("activ"));
      chip.classList.add("activ");
      actualizeazaVizibilitateLitri();
    };
    zonaChipuri.appendChild(chip);
  });
  actualizeazaVizibilitateLitri();

  if (existent) {
    campData.value = existent.data;
    campKm.value = existent.km || "";
    campLitri.value = existent.litri || "";
    campSuma.value = existent.suma;
    campDescriere.value = existent.descriere || "";
  } else {
    campData.valueAsDate = new Date();
  }

  card.querySelector('[data-rol="salveaza"]').onclick = async () => {
    if (!campData.value || !campSuma.value) return;
    const valori = {
      tip: tipSelectat,
      data: campData.value,
      km: campKm.value ? Number(campKm.value) : null,
      litri: tipSelectat === "combustibil" && campLitri.value ? Number(campLitri.value) : null,
      suma: Number(campSuma.value),
      descriere: campDescriere.value.trim(),
      locatie_text: locatie?.text || null,
      latitudine: locatie?.lat ?? null,
      longitudine: locatie?.lon ?? null,
    };
    if (existent) {
      await supa.from("cheltuieli").update(valori).eq("id", existent.id);
    } else {
      const { data: sesiune } = await supa.auth.getSession();
      await supa.from("cheltuieli").insert({ ...valori, user_id: sesiune.session.user.id, vehicul_id: vehiculActivId });
    }
    editeazaId = null;
    formularNouDeschis = false;
    randeazaCombustibil();
  };
  card.querySelector('[data-rol="anuleaza"]').onclick = () => {
    editeazaId = null;
    formularNouDeschis = false;
    randeazaCombustibil();
  };

  return card;
}

// ---------- mic modal generic (întrebare cu un câmp / mesaj simplu) ----------

function deschideModalMic({ titlu, corp, campNumeric, textButon }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;z-index:60;";
    const panou = document.createElement("div");
    panou.className = "card card-formular";
    panou.style.cssText = "max-width:340px;width:100%;";
    panou.innerHTML = `
      <div style="font-weight:700;font-family:'Sora',sans-serif;">${titlu}</div>
      ${corp ? `<div style="font-size:13.5px;color:var(--text-muted);">${corp}</div>` : ""}
      ${campNumeric ? `<input type="number" id="modal-mic-input" placeholder="${campNumeric}" />` : ""}
      <div class="butoane-formular">
        <button id="modal-mic-ok" class="buton buton-primar">${textButon || "OK"}</button>
        <button id="modal-mic-anuleaza" class="buton buton-secundar">Renunță</button>
      </div>
    `;
    overlay.appendChild(panou);
    document.body.appendChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } };
    panou.querySelector("#modal-mic-ok").onclick = () => {
      const valoare = campNumeric ? Number(document.getElementById("modal-mic-input").value) || null : true;
      overlay.remove();
      resolve(valoare);
    };
    panou.querySelector("#modal-mic-anuleaza").onclick = () => { overlay.remove(); resolve(null); };
  });
}

async function estimeazaAutonomie(consumMediu, combustibilCuKm) {
  const vehiculActiv = vehicule.find((v) => v.id === vehiculActivId);
  if (!vehiculActiv?.capacitate_rezervor) {
    await deschideModalMic({
      titlu: "Lipsește capacitatea rezervorului",
      corp: "Editează vehiculul (creionul de lângă numele mașinii, sus) și completează capacitatea rezervorului, în litri.",
      textButon: "Am înțeles",
    });
    return;
  }
  if (!consumMediu || combustibilCuKm.length === 0) {
    await deschideModalMic({
      titlu: "Nu am încă destule date",
      corp: "Adaugă cel puțin două alimentări cu kilometraj completat, ca să pot calcula consumul mediu.",
      textButon: "Am înțeles",
    });
    return;
  }
  const kmActual = await deschideModalMic({
    titlu: "Kilometrajul curent",
    corp: "Ce arată bordul acum?",
    campNumeric: "ex: 84250",
    textButon: "Estimează",
  });
  if (!kmActual) return;

  const ultimaAlimentare = combustibilCuKm[combustibilCuKm.length - 1];
  const kmParcursiDeLaPlin = kmActual - ultimaAlimentare.km;
  const litriConsumati = (kmParcursiDeLaPlin / 100) * Number(consumMediu);
  const litriRamasi = Number(vehiculActiv.capacitate_rezervor) - litriConsumati;
  const kmRamasi = Math.max(0, (litriRamasi / Number(consumMediu)) * 100);

  if (kmParcursiDeLaPlin < 0) {
    await deschideModalMic({
      titlu: "Kilometrajul introdus e mai mic decât la ultima alimentare",
      corp: `Ultima alimentare a fost la ${ultimaAlimentare.km.toLocaleString("ro-RO")} km. Verifică valoarea introdusă.`,
      textButon: "Am înțeles",
    });
    return;
  }

  await deschideModalMic({
    titlu: litriRamasi > 0 ? `Mai poți parcurge ~${Math.round(kmRamasi).toLocaleString("ro-RO")} km` : "Rezervorul e probabil gol",
    corp:
      litriRamasi > 0
        ? `Estimare bazată pe ~${litriRamasi.toFixed(1)} litri rămași și consumul tău mediu de ${consumMediu} L/100km. E o estimare, nu o măsurătoare exactă.`
        : "La consumul tău mediu, ar trebui să fi alimentat deja. Verifică rezervorul.",
    textButon: "Am înțeles",
  });
}

async function randeazaService() {
  elContinut.innerHTML = `<p class="incarcare">Se încarcă...</p>`;
  const { data } = await supa.from("service_istorie").select("*").eq("vehicul_id", vehiculActivId).order("data", { ascending: false });
  const intrari = data || [];

  const totalCost = intrari.reduce((s, i) => s + Number(i.cost || 0), 0);
  const ultima = intrari[0];

  elContinut.innerHTML = `
    <h2 class="titlu-sectiune">Istoric service</h2>
    <p class="subtitlu-sectiune">Ce s-a făcut la mașină, când și cu ce cost.</p>
    <div class="rezumat">
      <div class="pastila"><b>${ultima ? formatDataRO(ultima.data) : "—"}</b>Ultima intervenție</div>
      <div class="pastila"><b>${formatBani(totalCost)}</b>Cost total</div>
    </div>
  `;

  const lista = document.createElement("div");
  lista.className = "lista";

  if (intrari.length === 0 && !formularNouDeschis) {
    const gol = document.createElement("div");
    gol.className = "gol";
    gol.innerHTML = `<p>Niciun istoric de service încă.</p>`;
    const buton = document.createElement("button");
    buton.className = "buton buton-primar";
    buton.textContent = "+ Adaugă intervenție";
    buton.onclick = () => { formularNouDeschis = true; randeazaService(); };
    gol.appendChild(buton);
    elContinut.appendChild(gol);
    return;
  }

  intrari.forEach((i) => {
    if (editeazaId === i.id) {
      lista.appendChild(creeazaFormularService(i));
      return;
    }
    const card = document.createElement("div");
    card.className = "card card-lista-simpla";
    card.innerHTML = `
      <div class="stanga">
        <div class="card-nume">${i.descriere}</div>
        <div class="card-detalii">${formatDataRO(i.data)}${i.km ? " · " + i.km.toLocaleString("ro-RO") + " km" : ""}${i.unde ? " · " + i.unde : ""}${i.locatie_text ? " · 📍 " + i.locatie_text : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="suma">${i.cost ? formatBani(i.cost) : "—"}</div>
        <div class="actiuni-card">
          <button class="buton-icon" data-actiune="editeaza">✎</button>
          <button class="buton-icon" data-actiune="sterge" style="color:var(--danger)">🗑</button>
        </div>
      </div>
    `;
    card.querySelector('[data-actiune="editeaza"]').onclick = () => { editeazaId = i.id; randeazaService(); };
    card.querySelector('[data-actiune="sterge"]').onclick = async () => {
      await supa.from("service_istorie").delete().eq("id", i.id);
      randeazaService();
    };
    lista.appendChild(card);
  });

  if (formularNouDeschis) {
    lista.appendChild(creeazaFormularService(null));
  } else {
    const buton = document.createElement("button");
    buton.className = "buton-plus";
    buton.textContent = "+ Adaugă intervenție";
    buton.onclick = () => { formularNouDeschis = true; randeazaService(); };
    lista.appendChild(buton);
  }

  elContinut.appendChild(lista);
}

function creeazaFormularService(existent) {
  const nod = document.getElementById("sablon-formular-service").content.cloneNode(true);
  const card = nod.querySelector(".card-formular");
  const campData = card.querySelector('[data-rol="data"]');
  const campKm = card.querySelector('[data-rol="km"]');
  const campDescriere = card.querySelector('[data-rol="descriere"]');
  const campCost = card.querySelector('[data-rol="cost"]');
  const campUnde = card.querySelector('[data-rol="unde"]');
  const butonLocatie = card.querySelector('[data-rol="buton-locatie"]');
  const elLocatieText = card.querySelector('[data-rol="locatie-text"]');
  let locatie = existent?.locatie_text ? { text: existent.locatie_text, lat: existent.latitudine, lon: existent.longitudine } : null;

  function actualizeazaLocatieAfisata() {
    if (locatie) {
      elLocatieText.textContent = "📍 " + locatie.text;
      elLocatieText.classList.remove("ascuns");
      butonLocatie.textContent = "📍 Schimbă locația";
    } else {
      elLocatieText.classList.add("ascuns");
      butonLocatie.textContent = "📍 Adaugă locație";
    }
  }
  actualizeazaLocatieAfisata();

  butonLocatie.onclick = async () => {
    const rezultat = await deschideSelectorLocatie(locatie);
    if (rezultat === undefined) return;
    locatie = rezultat;
    actualizeazaLocatieAfisata();
  };

  if (existent) {
    campData.value = existent.data;
    campKm.value = existent.km || "";
    campDescriere.value = existent.descriere;
    campCost.value = existent.cost || "";
    campUnde.value = existent.unde || "";
  } else {
    campData.valueAsDate = new Date();
  }

  card.querySelector('[data-rol="salveaza"]').onclick = async () => {
    if (!campData.value || !campDescriere.value.trim()) return;
    const valori = {
      data: campData.value,
      km: campKm.value ? Number(campKm.value) : null,
      descriere: campDescriere.value.trim(),
      cost: campCost.value ? Number(campCost.value) : null,
      unde: campUnde.value.trim(),
      locatie_text: locatie?.text || null,
      latitudine: locatie?.lat ?? null,
      longitudine: locatie?.lon ?? null,
    };
    if (existent) {
      await supa.from("service_istorie").update(valori).eq("id", existent.id);
    } else {
      const { data: sesiune } = await supa.auth.getSession();
      await supa.from("service_istorie").insert({ ...valori, user_id: sesiune.session.user.id, vehicul_id: vehiculActivId });
    }
    editeazaId = null;
    formularNouDeschis = false;
    randeazaService();
  };
  card.querySelector('[data-rol="anuleaza"]').onclick = () => {
    editeazaId = null;
    formularNouDeschis = false;
    randeazaService();
  };

  return card;
}

// ---------- secțiunea HARTĂ ----------

let hartaSectiuneMapa = null;

async function randeazaHarta() {
  elContinut.innerHTML = `
    <h2 class="titlu-sectiune">Hartă</h2>
    <p class="subtitlu-sectiune">Toate locurile unde ai alimentat sau ai fost la service, pentru acest vehicul.</p>
    <div id="harta-sectiune-container" style="height:60vh;min-height:320px;border-radius:12px;overflow:hidden;border:1px solid var(--border);"></div>
    <div style="display:flex;gap:16px;margin-top:12px;font-size:12.5px;color:var(--text-muted);">
      <span>🟢 Combustibil</span>
      <span>🟡 Parcare/Altele</span>
      <span>🔴 Service</span>
    </div>
  `;

  const [{ data: cheltuieli }, { data: serviceIstorie }] = await Promise.all([
    supa.from("cheltuieli").select("*").eq("vehicul_id", vehiculActivId).not("latitudine", "is", null),
    supa.from("service_istorie").select("*").eq("vehicul_id", vehiculActivId).not("latitudine", "is", null),
  ]);

  const puncte = [
    ...(cheltuieli || []).map((c) => ({ lat: c.latitudine, lon: c.longitudine, text: (c.descriere || c.tip) + " · " + formatDataRO(c.data), culoare: c.tip === "combustibil" ? "#4CAF7D" : "#E0A33E" })),
    ...(serviceIstorie || []).map((i) => ({ lat: i.latitudine, lon: i.longitudine, text: i.descriere + " · " + formatDataRO(i.data), culoare: "#E15A4D" })),
  ];

  if (hartaSectiuneMapa) { hartaSectiuneMapa.remove(); hartaSectiuneMapa = null; }

  if (puncte.length === 0) {
    document.getElementById("harta-sectiune-container").outerHTML = `<div class="gol"><p>Niciun loc salvat încă. Adaugă o locație când introduci o cheltuială sau o intervenție de service.</p></div>`;
    return;
  }

  setTimeout(() => {
    hartaSectiuneMapa = L.map("harta-sectiune-container");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(hartaSectiuneMapa);
    const grupMarkeri = [];
    puncte.forEach((p) => {
      const marker = L.circleMarker([p.lat, p.lon], { radius: 8, color: p.culoare, fillColor: p.culoare, fillOpacity: 0.85, weight: 2 })
        .addTo(hartaSectiuneMapa)
        .bindPopup(p.text);
      grupMarkeri.push(marker);
    });
    hartaSectiuneMapa.fitBounds(L.featureGroup(grupMarkeri).getBounds().pad(0.2));
  }, 50);
}

// ---------- secțiunea RAPOARTE ----------

const LUNI_RO = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
let granularitateRaport = "lunar";

function inceputSaptamana(d) {
  const copie = new Date(d);
  const ziua = copie.getDay() || 7; // duminică=0 → 7
  copie.setDate(copie.getDate() - ziua + 1); // luni
  copie.setHours(0, 0, 0, 0);
  return copie;
}

function cheieSiEticheta(dataStr, granularitate) {
  const d = new Date(dataStr + "T00:00:00");
  if (granularitate === "saptamanal") {
    const luni = inceputSaptamana(d);
    const cheie = luni.toISOString().slice(0, 10);
    return { cheie, eticheta: `${luni.getDate()} ${LUNI_RO[luni.getMonth()]}` };
  }
  if (granularitate === "anual") {
    return { cheie: String(d.getFullYear()), eticheta: String(d.getFullYear()) };
  }
  const cheie = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { cheie, eticheta: `${LUNI_RO[d.getMonth()]} ${d.getFullYear()}` };
}

function grupeazaPeInterval(cheltuieli, granularitate) {
  const grupuri = {};
  cheltuieli.forEach((c) => {
    const { cheie, eticheta } = cheieSiEticheta(c.data, granularitate);
    if (!grupuri[cheie]) grupuri[cheie] = { cheie, eticheta, totalSuma: 0, totalCombustibil: 0, totalLitri: 0 };
    grupuri[cheie].totalSuma += Number(c.suma);
    if (c.tip === "combustibil") {
      grupuri[cheie].totalCombustibil += Number(c.suma);
      if (c.litri) grupuri[cheie].totalLitri += Number(c.litri);
    }
  });
  const limita = granularitate === "saptamanal" ? 8 : granularitate === "anual" ? 6 : 12;
  return Object.values(grupuri)
    .sort((a, b) => (a.cheie > b.cheie ? 1 : -1))
    .slice(-limita);
}

function deseneazaGraficBare(container, date) {
  if (date.length === 0) {
    container.innerHTML = `<div class="gol"><p>Nu sunt încă destule date pentru acest interval.</p></div>`;
    return;
  }
  const maxim = Math.max(...date.map((d) => d.totalSuma), 1);
  const latimeBara = 100 / date.length;
  const bare = date
    .map((d, i) => {
      const inaltimeProc = (d.totalSuma / maxim) * 100;
      const x = i * latimeBara;
      return `
        <div style="position:absolute; left:${x}%; width:${latimeBara}%; bottom:0; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding:0 4px; box-sizing:border-box;">
          <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-muted); margin-bottom:4px; white-space:nowrap;">${Math.round(d.totalSuma)}</div>
          <div style="width:100%; max-width:36px; height:${Math.max(2, inaltimeProc)}%; background:linear-gradient(180deg, var(--accent), var(--accent-strong)); border-radius:4px 4px 0 0;"></div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:6px; white-space:nowrap; text-align:center;">${d.eticheta}</div>
        </div>
      `;
    })
    .join("");
  container.innerHTML = `<div style="position:relative; height:220px; padding-bottom:28px;">${bare}</div>`;
}

async function randeazaRapoarte() {
  elContinut.innerHTML = `<p class="incarcare">Se încarcă...</p>`;
  const { data } = await supa.from("cheltuieli").select("*").eq("vehicul_id", vehiculActivId);
  const cheltuieli = data || [];

  elContinut.innerHTML = `
    <h2 class="titlu-sectiune">Rapoarte</h2>
    <p class="subtitlu-sectiune">Cheltuielile tale în timp — săptămânal, lunar sau anual.</p>
    <div class="chipuri" id="chipuri-granularitate" style="margin-bottom:18px;">
      <button class="chip${granularitateRaport === "saptamanal" ? " activ" : ""}" data-g="saptamanal">Săptămânal</button>
      <button class="chip${granularitateRaport === "lunar" ? " activ" : ""}" data-g="lunar">Lunar</button>
      <button class="chip${granularitateRaport === "anual" ? " activ" : ""}" data-g="anual">Anual</button>
    </div>
    <div id="zona-grafic" class="card"></div>
    <div id="zona-rezumat-raport"></div>
  `;

  function actualizeaza() {
    const grupate = grupeazaPeInterval(cheltuieli, granularitateRaport);
    deseneazaGraficBare(document.getElementById("zona-grafic"), grupate);

    const totalPerioada = grupate.reduce((s, g) => s + g.totalSuma, 0);
    const totalCombustibilPerioada = grupate.reduce((s, g) => s + g.totalCombustibil, 0);
    const totalLitriPerioada = grupate.reduce((s, g) => s + g.totalLitri, 0);
    const mediePePerioada = grupate.length ? totalPerioada / grupate.length : 0;

    document.getElementById("zona-rezumat-raport").innerHTML = `
      <div class="rezumat" style="margin-top:16px;">
        <div class="pastila"><b>${formatBani(totalPerioada)}</b>Total afișat</div>
        <div class="pastila"><b>${formatBani(totalCombustibilPerioada)}</b>Din care combustibil</div>
        <div class="pastila"><b>${totalLitriPerioada ? totalLitriPerioada.toFixed(0) + " L" : "—"}</b>Litri cumpărați</div>
        <div class="pastila"><b>${formatBani(mediePePerioada)}</b>Medie/perioadă</div>
      </div>
    `;
  }

  document.querySelectorAll("#chipuri-granularitate .chip").forEach((chip) => {
    chip.onclick = () => {
      granularitateRaport = chip.dataset.g;
      document.querySelectorAll("#chipuri-granularitate .chip").forEach((c) => c.classList.remove("activ"));
      chip.classList.add("activ");
      actualizeaza();
    };
  });

  actualizeaza();
}

// ---------- notificări push ----------

async function initializeazaNotificari() {
  const elBanner = document.getElementById("banner-notificari");
  const elBannerTitlu = document.getElementById("banner-titlu");
  const elBannerText = document.getElementById("banner-text");
  const elBtnPermite = document.getElementById("btn-permite");

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    elBanner.classList.add("ascuns");
    return;
  }

  const inregistrare = await navigator.serviceWorker.register("sw.js");

  if (Notification.permission === "granted") {
    elBanner.classList.add("ascuns");
    await asiguraAbonare(inregistrare);
    return;
  }

  if (Notification.permission === "denied") {
    elBanner.classList.remove("ascuns");
    elBannerTitlu.textContent = "Notificările sunt blocate";
    elBannerText.textContent = "Le-ai refuzat din browser — le poți reactiva din setările site-ului.";
    elBtnPermite.classList.add("ascuns");
    return;
  }

  elBanner.classList.remove("ascuns");
  elBtnPermite.classList.remove("ascuns");
  elBtnPermite.onclick = async () => {
    const raspuns = await Notification.requestPermission();
    if (raspuns === "granted") {
      elBanner.classList.add("ascuns");
      await asiguraAbonare(inregistrare);
    } else if (raspuns === "denied") {
      elBannerTitlu.textContent = "Notificările sunt blocate";
      elBannerText.textContent = "Le-ai refuzat din browser — le poți reactiva din setările site-ului.";
      elBtnPermite.classList.add("ascuns");
    }
  };
}

async function asiguraAbonare(inregistrare) {
  try {
    let abonament = await inregistrare.pushManager.getSubscription();
    if (!abonament) {
      const r = await fetch(`${API_URL}/api/vapid-public-key`);
      const { publicKey } = await r.json();
      abonament = await inregistrare.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const token = await tokenCurent();
    await fetch(`${API_URL}/api/abonare`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(abonament),
    });
  } catch (e) {
    console.error("Abonarea la notificări a eșuat:", e);
  }
}

// ---------- pornire după autentificare ----------

async function porneste() {
  await incarcaVehicule();
  randeazaSectiune();
  initializeazaNotificari();
}
