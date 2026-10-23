/* ============================================================
   CALORIE TRACKER - Kamera und KI-Lebensmittel-Analyse
   ------------------------------------------------------------
   1) Kamera-Bild live anzeigen und ein Foto aufnehmen
   2) Foto an die Google-Gemini-API schicken (Analyse)
   3) Ergebnis zeichnen: Lebensmittel ODER Beschwerde ("kein Essen")
   4) Gefundene Lebensmittel als Eintraege speichern
      - statische Version: localStorage (ueber app.js)
      - Flask-Version: per fetch an /add_entry
   ============================================================ */

/* ------------------------------------------------------------
   0) Konstanten und Speicher
   ------------------------------------------------------------ */
var STORE_KEY = "kzt_gemini_key"; // Eigener API-Key liegt ROH im Browser

// Standard-Key der Seite: ALLE koennen die Kamera sofort nutzen,
// ohne selbst einen Key einzutragen. Ein eigener Key (Einstellungen
// oder Einrichtungs-Link) hat immer Vorrang.
// ACHTUNG: Der Key ist im Quelltext der Seite sichtbar - auf
// aistudio.google.com sollte er auf "HTTP-Referrer" eingeschraenkt
// und mit einem Tageslimit versehen werden. sonst kann ihn jeder mitlesen.
var DEFAULT_KEY = "AQ.Ab8RN6L8sZUfWeel1bjrINcShl7lcDVTQ7zewlHlYNrl-na3zw";

// Modelle der Reihe nach versuchen: der erste freie Gewinner gewinnt.
// (Beliebte Modelle melden zeitweise "503 - hohe Nachfrage".)
var GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];

// Flask-Seiten tragen data-backend="flask" am <html>-Element.
// Die statische GitHub-Pages-Version hat das Attribut nicht -> localStorage.
var IS_FLASK = document.documentElement.getAttribute("data-backend") === "flask";

var camStream = null;   // der laufende Kamera-Strom
var camShot = null;     // das aktuelle Foto als data-URL
var camResult = null;   // das letzte Analyse-Ergebnis
var camBusy = false;    // true, waehrend die KI laeuft

/* ------------------------------------------------------------
   1) Hilfsfunktionen
   ------------------------------------------------------------ */
function camEscape(text) {
  var div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function camToast(message, type) {
  var area = document.getElementById("toast-area");
  if (!area) return;
  var toast = document.createElement("div");
  toast.className = "toast toast-" + (type || "success");
  toast.innerHTML =
    '<span class="toast-icon">' + (type === "error" ? "!" : "✓") + "</span>" +
    "<span>" + camEscape(message) + "</span>";
  area.appendChild(toast);
  setTimeout(function () {
    toast.classList.add("hide");
    setTimeout(function () { toast.remove(); }, 400);
  }, 4000);
}

function camTodayISO() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

// Standard-Mahlzeit je nach Tageszeit vorschlagen.
function camDefaultMeal() {
  var hour = new Date().getHours();
  if (hour < 10) return "Frühstück";
  if (hour < 16) return "Mittagessen";
  if (hour < 22) return "Abendessen";
  return "Snack";
}

/* ------------------------------------------------------------
   2) API-Key: aus dem Link uebernehmen, lesen und speichern
   ------------------------------------------------------------ */
function camGetKey() {
  try {
    var own = (localStorage.getItem(STORE_KEY) || "").trim();
    if (own) return own;
  } catch (error) { /* Speicher blockiert - Standard-Key weiterverwenden */ }
  // Ohne eigenen Key den Standard-Key der Seite verwenden.
  return DEFAULT_KEY.length >= 30 ? DEFAULT_KEY : "";
}

function camSetKey(value) {
  try {
    localStorage.setItem(STORE_KEY, value);
    return true;
  } catch (error) {
    return false;
  }
}

// Einrichtungs-Link der Form kamera.html#kzt-key=AIza...
// Der Key wird EINMAL in den Browser geschrieben und aus der
// Adresszeile wieder entfernt. Im Repository steht der Key nie.
(function readKeyFromHash() {
  if (window.location.hash.indexOf("#kzt-key=") !== 0) return;
  var key = decodeURIComponent(window.location.hash.slice(9)).trim();
  var saved = false;
  if (key.length >= 30) saved = camSetKey(key);
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch (error) { /* egal */ }
  if (key.length >= 30 && !saved) {
    camToast("Der API-Key konnte NICHT gespeichert werden - Dein Browser blockiert Website-Daten (privater Modus?).", "error");
  }
})();

var keyForm = document.getElementById("key-form");
if (keyForm) {
  keyForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var input = document.getElementById("gemini_key");
    var value = input ? input.value.trim() : "";
    if (value.length < 30) {
      camToast("Das sieht nicht nach einem gueltigen API-Key aus.", "error");
      return;
    }
    if (!camSetKey(value)) {
      camToast("Der Key konnte nicht gespeichert werden.", "error");
      return;
    }
    if (input) input.value = "";
    camToast("API-Key gespeichert! Kamera wird gestartet.", "success");
    showCamera();
  });
}

/* ------------------------------------------------------------
   3) Kamera: starten, Foto aufnehmen, neu aufnehmen
   ------------------------------------------------------------ */
var video = document.getElementById("cam-video");
var shotImg = document.getElementById("cam-shot");
var stage = document.getElementById("cam-stage");
var placeholder = document.getElementById("cam-placeholder");
var errorBox = document.getElementById("cam-error");
var actions = document.getElementById("cam-actions");
var keyCard = document.getElementById("cam-key-card");
var btnCapture = document.getElementById("cam-capture");
var btnAnalyze = document.getElementById("cam-analyze");
var btnRetake = document.getElementById("cam-retake");

function camShowError(text) {
  if (!errorBox) return;
  errorBox.hidden = false;
  errorBox.textContent = text;
}

function showCamera() {
  if (keyCard) keyCard.hidden = true;
  if (stage) stage.hidden = false;
  if (actions) actions.hidden = false;
  if (errorBox) errorBox.hidden = true;
  setCaptureState();
  startCamera();
}

function setCaptureState() {
  var haveShot = camShot !== null;
  if (btnCapture) btnCapture.hidden = haveShot;
  if (btnAnalyze) btnAnalyze.hidden = !haveShot;
  if (btnRetake) btnRetake.hidden = !haveShot;
  if (video) video.hidden = haveShot;
  if (shotImg) shotImg.hidden = !haveShot;
}

function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camShowError("Dieser Browser unterstuetzt keine Kamera-Zugriffe. " +
      "Die Kamera funktioniert nur ueber HTTPS (GitHub Pages) oder localhost.");
    return;
  }
  if (placeholder) placeholder.hidden = false;

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }, // Rueckkamera auf dem Handy
    audio: false
  }).then(function (stream) {
    camStream = stream;
    if (video) {
      video.srcObject = stream;
      video.play();
    }
    if (placeholder) placeholder.hidden = true;
  }).catch(function (error) {
    if (placeholder) placeholder.hidden = true;
    camShowError("Kein Kamerazugriff: " + error.name +
      ". Erlaube die Kamera im Browser und lade die Seite neu.");
  });
}

if (btnCapture) {
  btnCapture.addEventListener("click", function () {
    if (!video || !video.videoWidth) {
      camShowError("Die Kamera ist noch nicht bereit - kurz warten und nochmal tippen.");
      return;
    }
    // Foto aufnehmen: Video auf Canvas zeichnen und als JPG speichern.
    // Begrenzen auf 1024 px - fuer die KI-Analyse reicht das, es laeuft schneller.
    var scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    camShot = canvas.toDataURL("image/jpeg", 0.85);

    if (shotImg) shotImg.src = camShot;
    if (errorBox) errorBox.hidden = true;
    setCaptureState();
  });
}

// Alle "Neues Foto"-Buttons (Aktionen-Leiste, Ergebnis-Karte, Beschwerde)
// setzen Foto UND Ergebnis zurueck.
var retakeButtons = document.querySelectorAll(".cam-retake-btn");
retakeButtons.forEach(function (button) {
  button.addEventListener("click", function (event) {
    if (button.tagName === "A") event.preventDefault();
    camShot = null;
    camResult = null;
    var resultCard = document.getElementById("cam-result-card");
    if (resultCard) resultCard.hidden = true;
    setCaptureState();
  });
});

// Kamera beim Verlassen der Seite ausschalten.
window.addEventListener("pagehide", function () {
  if (camStream) {
    camStream.getTracks().forEach(function (track) { track.stop(); });
    camStream = null;
  }
});

/* ------------------------------------------------------------
   4) KI-Analyse: Foto an Google Gemini schicken
   ------------------------------------------------------------ */
var PROMPT =
  "Du bist ein Lebensmittel-Analysator fuer eine Kalorien-App.\n" +
  "Antworte NUR mit JSON nach dem gegebenen Schema, kein Markdown.\n" +
  "Regeln:\n" +
  "- Ist KEIN Essen oder Getraenk erkennbar: essen=false und in grund" +
  " kurz und freundlich erklaeren, warum nicht (etwas wie: Das ist kein Essen," +
  " sondern ein Fernseher).\n" +
  "- Ist Essen erkennbar: essen=true und jedes sichtbare Lebensmittel" +
  " als eigenen Eintrag in lebensmittel.\n" +
  "- Portionsgroessen (menge_g) und Kalorien der Portion (kalorien)" +
  " realistisch schaetzen.\n" +
  "- Namen auf Deutsch, kurz (max. 60 Zeichen).";

function camBuildBody(base64Data) {
  return {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: "image/jpeg", data: base64Data } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          essen: { type: "BOOLEAN" },
          grund: { type: "STRING" },
          lebensmittel: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                menge_g: { type: "INTEGER" },
                kalorien: { type: "INTEGER" }
              },
              required: ["name", "menge_g", "kalorien"]
            }
          },
          kalorien_gesamt: { type: "INTEGER" }
        },
        required: ["essen", "grund", "lebensmittel", "kalorien_gesamt"]
      }
    }
  };
}

// Antworttext in echtes JSON umwandeln (auch mit ```-Zaun, falls doch einer kommt).
function camParseJSON(text) {
  var cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    var start = cleaned.indexOf("{");
    var end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (secondError) {
      return null;
    }
  }
}

// Modell nacheinander versuchen; liefert das erste gueltige Ergebnis.
function camCallGemini(key, base64Data, index, lastError, done) {
  if (index >= GEMINI_MODELS.length) {
    done(null, lastError || new Error("Unbekannter Fehler"));
    return;
  }
  var model = GEMINI_MODELS[index];
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    model + ":generateContent?key=" + encodeURIComponent(key);

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(camBuildBody(base64Data))
  }).then(function (response) {
    return response.json().then(function (data) {
      if (!response.ok) {
        var message = data && data.error && data.error.message
          ? data.error.message : ("HTTP " + response.status);
        // 404 = falsches Modell -> naechstes probieren, das steht auch im Text.
        return camCallGemini(key, base64Data, index + 1, new Error(message), done);
      }
      var text = data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
      if (!text) {
        return camCallGemini(key, base64Data, index + 1,
          new Error("Die KI hat keine Text-Antwort geliefert."), done);
      }
      var parsed = camParseJSON(text);
      if (!parsed) {
        return camCallGemini(key, base64Data, index + 1,
          new Error("Die KI-Antwort war kein gueltiges JSON."), done);
      }
      done(parsed, null);
    });
  }).catch(function (error) {
    // Netzwerkfehler oder 503 "hohe Nachfrage": naechstes Modell versuchen.
    camCallGemini(key, base64Data, index + 1, error, done);
  });
}

// Aus der KI-Antwort brauchbare Eintraege bauen (mit denselben Grenzen
// wie das Eintragsformular: Name <= 80, 1..900 kcal/100g, 1..5000 g).
function camNormalize(raw) {
  if (!raw || typeof raw.essen !== "boolean") return null;

  if (raw.essen !== true) {
    return { essen: false, grund: String(raw.grund || "Hier ist kein Essen zu sehen.").slice(0, 200), items: [] };
  }
  if (!Array.isArray(raw.lebensmittel)) return null;

  var items = [];
  raw.lebensmittel.forEach(function (item) {
    var name = String(item && item.name || "").trim().slice(0, 80);
    var grams = Math.round(Number(item && item.menge_g));
    var kcal = Math.round(Number(item && item.kalorien));
    if (!name || isNaN(grams) || isNaN(kcal)) return;
    if (grams < 1 || grams > 5000 || kcal < 1) return;

    var cal100 = Math.round((kcal * 100 / grams) * 10) / 10;
    if (cal100 > 900) cal100 = 900;
    if (cal100 < 0.1) cal100 = 0.1;

    items.push({
      name: name,
      calories_per_100g: cal100,
      amount_grams: grams,
      calories: Math.round(cal100 * grams / 100)
    });
  });

  if (items.length === 0) return null;
  return { essen: true, grund: "", items: items };
}

function setBusy(busy) {
  camBusy = busy;
  if (btnAnalyze) {
    btnAnalyze.disabled = busy;
    btnAnalyze.textContent = busy ? "⏳ KI analysiert ..." : "Analysieren";
  }
  if (btnCapture) btnCapture.disabled = busy;
  if (btnRetake) btnRetake.disabled = busy;
}

if (btnAnalyze) {
  btnAnalyze.addEventListener("click", function () {
    if (camBusy || !camShot) return;

    var key = camGetKey();
    if (!key) {
      if (keyCard) keyCard.hidden = false;
      camToast("Bitte zuerst den API-Key speichern.", "error");
      return;
    }

    setBusy(true);
    var resultCard = document.getElementById("cam-result-card");
    if (resultCard) resultCard.hidden = true;

    var base64Data = camShot.split(",")[1];
    camCallGemini(key, base64Data, 0, null, function (raw, error) {
      setBusy(false);

      if (error || !raw) {
        camShowError("Analyse fehlgeschlagen: " +
          (error ? error.message : "Unbekannter Fehler") +
          " - bitte nochmal versuchen.");
        return;
      }

      var normalized = camNormalize(raw);
      if (!normalized) {
        camShowError("Die Antwort der KI verstand ich leider nicht - bitte nochmal versuchen.");
        return;
      }

      camResult = normalized;
      renderResult();
    });
  });
}

/* ------------------------------------------------------------
   5) Ergebnis zeichnen: Beschwerde ODER Lebensmittel-Liste
   ------------------------------------------------------------ */
function renderResult() {
  var resultCard = document.getElementById("cam-result-card");
  if (!resultCard || !camResult) return;

  var noFood = document.getElementById("cam-nofood");
  var noFoodReason = document.getElementById("cam-nofood-reason");
  var food = document.getElementById("cam-food");
  var hint = document.getElementById("cam-result-hint");

  if (camResult.essen === false) {
    // Die KI "meckert": kein Essen auf dem Bild.
    if (noFoodReason) noFoodReason.textContent = camResult.grund;
    if (hint) hint.textContent = "Nimm ein Foto von echtem Essen - dann traeg ich es fuer dich ein.";
    if (noFood) noFood.hidden = false;
    if (food) food.hidden = true;
    resultCard.hidden = false;
    return;
  }

  // Lebensmittel-Liste zeichnen (Zeilen wie im Kalender).
  var listBox = document.getElementById("cam-food-list");
  var total = 0;
  listBox.innerHTML = "";
  camResult.items.forEach(function (item) {
    total += item.calories;
    var row = document.createElement("div");
    row.className = "cal-entry";
    row.innerHTML =
      '<span class="cal-entry-icon icon-emerald">🥗</span>' +
      '<div class="cal-entry-body">' +
        '<div class="cal-entry-name">' + camEscape(item.name) + "</div>" +
        '<div class="cal-entry-meta">' +
          item.amount_grams + " g · " + item.calories_per_100g + " kcal/100 g" +
        "</div>" +
      "</div>" +
      '<span class="cal-entry-kcal">' + item.calories + " kcal</span>";
    listBox.appendChild(row);
  });

  var totalBox = document.getElementById("cam-total");
  if (totalBox) totalBox.textContent = total + " kcal";

  var badge = document.getElementById("cam-result-badge");
  if (badge) {
    badge.hidden = false;
    badge.textContent = camResult.items.length + " Lebensmittel";
  }
  if (hint) hint.textContent = "Vorschlag zum Speichern - Mahlzeit und Datum kannst du noch anpassen.";
  if (noFood) noFood.hidden = true;
  if (food) food.hidden = false;

  var mealSelect = document.getElementById("cam-meal");
  if (mealSelect) mealSelect.value = camDefaultMeal();
  var dateInput = document.getElementById("cam-date");
  if (dateInput) dateInput.value = camTodayISO();

  resultCard.hidden = false;
}

/* ------------------------------------------------------------
   6) Eintraege speichern (localStorage ODER Flask-Server)
   ------------------------------------------------------------ */
function finishSave(count, date) {
  camToast(count + (count === 1 ? " Eintrag" : " Einträge") + " gespeichert.", "success");
  setTimeout(function () {
    // Zum Dashboard zurueck - dort sind die neuen Eintraege sichtbar.
    if (IS_FLASK) {
      window.location.assign("/");
    } else {
      window.location.assign("index.html?date=" + encodeURIComponent(date));
    }
  }, 1200);
}

// Einzelnen Eintrag per fetch an den Flask-Server schicken.
// Das Formular validiert vorher dieselben Regeln wie /add_entry,
// deshalb ist eine Weiterleitung (redirect) ein Erfolg.
function postEntryToServer(entry, done) {
  var form = new FormData();
  form.append("name", entry.name);
  form.append("calories_per_100g", String(entry.calories_per_100g));
  form.append("amount_grams", String(entry.amount_grams));
  form.append("meal", entry.meal);
  form.append("date", entry.date);

  fetch("/add_entry", {
    method: "POST",
    body: form,
    redirect: "manual"
  }).then(function (response) {
    // 0 = opaqueredirect (die Weiterleitung), 3xx = Weiterleitung.
    if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
      done(null);
    } else {
      done(new Error("HTTP " + response.status));
    }
  }).catch(done);
}

var btnSave = document.getElementById("cam-save");
if (btnSave) {
  btnSave.addEventListener("click", function () {
    if (!camResult || camResult.essen !== true || camResult.items.length === 0) return;

    var mealSelect = document.getElementById("cam-meal");
    var dateInput = document.getElementById("cam-date");
    var meal = mealSelect ? mealSelect.value : "Snack";
    var date = dateInput ? dateInput.value : camTodayISO();

    if (["Frühstück", "Mittagessen", "Abendessen", "Snack"].indexOf(meal) === -1) {
      camToast("Bitte waehle eine gueltige Mahlzeit aus.", "error");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      camToast("Bitte waehle ein gueltiges Datum aus.", "error");
      return;
    }

    btnSave.disabled = true;

    if (IS_FLASK) {
      // Nacheinander an den Server senden (rekursiv, ohne async/await).
      var index = 0;
      var sendNext = function (error) {
        if (error) {
          btnSave.disabled = false;
          camToast("Speichern fehlgeschlagen: " + error.message, "error");
          return;
        }
        if (index >= camResult.items.length) {
          finishSave(camResult.items.length, date);
          return;
        }
        var item = camResult.items[index];
        index += 1;
        postEntryToServer({
          name: item.name,
          calories_per_100g: item.calories_per_100g,
          amount_grams: item.amount_grams,
          meal: meal,
          date: date
        }, sendNext);
      };
      sendNext(null);
    } else {
      // Statische Version: alles in den Browser-Speicher (app.js).
      var newIds = Date.now();
      camResult.items.forEach(function (item, i) {
        entries.push({
          id: newIds + i,
          name: item.name,
          calories_per_100g: item.calories_per_100g,
          amount_grams: item.amount_grams,
          calories: item.calories,
          meal: meal,
          date: date,
          created_at: new Date().toTimeString().slice(0, 8)
        });
      });
      if (!persistEntries()) {
        btnSave.disabled = false;
        camToast("Eintraege nur fuer diese Sitzung sichtbar: Dein Browser blockiert Website-Daten - nach dem Neuladen sind sie weg.", "error");
        return;
      }
      finishSave(camResult.items.length, date);
    }
  });
}

/* ------------------------------------------------------------
   7) Start: Key pruefen und Kamera (vor)starten
   ------------------------------------------------------------ */
(function initCameraPage() {
  var key = camGetKey();
  if (!key) {
    // Ohne Key: erst den Key eintragen, dann startet die Kamera.
    if (keyCard) keyCard.hidden = false;
    if (stage) stage.hidden = true;
    if (actions) actions.hidden = true;
    return;
  }
  showCamera();
})();
