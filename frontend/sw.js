// Acest fișier rulează separat de pagină, gestionat de browser — de aceea poate
// primi și afișa o notificare chiar dacă aplicația nu e deschisă în niciun tab.

self.addEventListener("push", (eveniment) => {
  let date = { titlu: "Asistent Auto", corp: "Ai un document de verificat." };
  try {
    date = eveniment.data.json();
  } catch (e) {
    // dacă payload-ul nu e JSON valid, rămân valorile implicite
  }

  eveniment.waitUntil(
    self.registration.showNotification(date.titlu, {
      body: date.corp,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (eveniment) => {
  eveniment.notification.close();
  eveniment.waitUntil(
    clients.matchAll({ type: "window" }).then((listaClienti) => {
      for (const client of listaClienti) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow("./index.html");
    })
  );
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (eveniment) => {
  eveniment.waitUntil(clients.claim());
});
