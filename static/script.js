/* ============================================================
   CALORIE TRACKER - Interaktionen
   JavaScript macht die Bedienung angenehmer.
   Alle Daten werden trotzdem von Python/Flask und SQLite verwaltet.
   ============================================================ */

// Pruefen, ob der Nutzer Animationen reduzieren moechte (Systemeinstellung).
var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------
   0) Ladebildschirm: grosses Logo fliegt klein an seinen Platz
   ------------------------------------------------------------ */
var splash = document.getElementById("splash");
var splashLogo = document.getElementById("splash-logo");
var brandMark = document.querySelector(".brand-mark");

function removeSplash() {
  if (splash && splash.parentNode) {
    splash.parentNode.removeChild(splash);
  }
  if (brandMark) {
    brandMark.classList.remove("logo-hidden");
  }
  document.body.classList.remove("splash-active");
}

if (splash && splashLogo && brandMark) {
  var alreadySeen = false;
  try {
    // Nur beim ersten Aufruf im Browser-Tab animieren.
    alreadySeen = sessionStorage.getItem("splashSeen") === "1";
  } catch (error) {
    alreadySeen = false;
  }

  if (reduceMotion || alreadySeen) {
    // Keine Animation: Ladebildschirm sofort entfernen.
    removeSplash();
  } else {
    document.body.classList.add("splash-active");
    brandMark.classList.add("logo-hidden");

    var flightStarted = false;

    function finishFlight() {
      if (brandMark) brandMark.classList.remove("logo-hidden");
      try {
        sessionStorage.setItem("splashSeen", "1");
      } catch (error) {
        // Speicher nicht verfuegbar - egal, Animation lief ja schon.
      }
      removeSplash();
    }

    function startFlight() {
      if (flightStarted) return;
      flightStarted = true;

      // Ziel (kleines Logo in der Kopfzeile) und aktuelle Groesse messen.
      var target = brandMark.getBoundingClientRect();
      var big = splashLogo.getBoundingClientRect();

      if (!target.width || !big.width) {
        finishFlight(); // Falls Bild nicht geladen ist: einfach beenden
        return;
      }

      // Umwandlung, die das grosse Logo auf die kleine Zielstelle bringt.
      var scale = target.width / big.width;
      var moveX = (target.left + target.width / 2) - (big.left + big.width / 2);
      var moveY = (target.top + target.height / 2) - (big.top + big.height / 2);

      splash.classList.add("flying");     // Schriftzug ausblenden
      splash.classList.add("fade");       // Hintergrund ausblenden
      splashLogo.style.transform =
        "translate(" + moveX + "px, " + moveY + "px) scale(" + scale + ")";

      window.setTimeout(finishFlight, 1000);
    }

    function beginHold() {
      // Logo 3 Sekunden gross zeigen, dann fliegt es los.
      window.setTimeout(startFlight, 3000);
    }

    if (splashLogo.complete && splashLogo.naturalWidth > 0) {
      beginHold();
    } else {
      splashLogo.addEventListener("load", beginHold);
      // Sicherheitsnetz, falls das Bild nicht laedt.
      window.setTimeout(startFlight, 6000);
    }
  }
}

/* ------------------------------------------------------------
   1) Benachrichtigungen (Toast-Meldungen) ausblenden
   ------------------------------------------------------------ */
document.querySelectorAll(".toast").forEach(function (toast) {
  // Nach 4 Sekunden sanft ausblenden.
  setTimeout(function () {
    toast.classList.add("hide");
    setTimeout(function () {
      toast.remove();
    }, 400);
  }, 4000);
});

/* ------------------------------------------------------------
   2) Fortschrittsring animieren
   ------------------------------------------------------------ */
var ring = document.getElementById("ring-progress");
if (ring) {
  var circumference = 326.7; // 2 x PI x r (r = 52)
  var percent = parseFloat(ring.getAttribute("data-percent")) || 0;
  var offset = circumference - (percent / 100) * circumference;

  // Erst kurz warten, damit die Animation sichtbar startet.
  setTimeout(function () {
    ring.style.strokeDashoffset = String(offset);
    if (percent >= 100) {
      ring.classList.add("done");
    }
  }, reduceMotion ? 0 : 150);
}

/* ------------------------------------------------------------
   3) Zahlen animiert darstellen (nur wenn Bewegung erlaubt ist)
   ------------------------------------------------------------ */
function animateNumber(element, target, duration) {
  if (!element) return;
  if (reduceMotion) {
    element.textContent = String(target);
    return;
  }

  var startTime = null;

  function step(timestamp) {
    if (startTime === null) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    // Einfache "ease-out"-Formel: am Anfang schnell, am Ende langsam
    var eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(target * eased));
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = String(target);
      element.classList.add("pop");
    }
  }

  requestAnimationFrame(step);
}

var percentLabel = document.getElementById("percent-value");
if (percentLabel) {
  var ringPercent = ring ? (parseFloat(ring.getAttribute("data-percent")) || 0) : 0;
  animateNumber(percentLabel, ringPercent, 900);
}

var totalLabel = document.getElementById("stat-total");
if (totalLabel) {
  var targetTotal = parseInt(totalLabel.getAttribute("data-value"), 10) || 0;
  animateNumber(totalLabel, targetTotal, 900);
}

/* ------------------------------------------------------------
   4) Mahlzeiten-Balken animiert auf die richtige Breite bringen
   ------------------------------------------------------------ */
document.querySelectorAll(".meal-bar-fill").forEach(function (bar) {
  var width = bar.getAttribute("data-width") || 0;
  setTimeout(function () {
    bar.style.width = width + "%";
  }, reduceMotion ? 0 : 300);
});

/* ------------------------------------------------------------
   5) Beispiel-Lebensmittel: Klick fuellt das Formular (speichert NICHTS)
   ------------------------------------------------------------ */
var nameInput = document.getElementById("name");
var calInput = document.getElementById("calories_per_100g");
var amountInput = document.getElementById("amount_grams");

document.querySelectorAll(".preset").forEach(function (button) {
  button.addEventListener("click", function () {
    if (!nameInput || !calInput || !amountInput) return;

    // Name und Kalorienwert aus den data-Attributen uebernehmen.
    nameInput.value = button.getAttribute("data-name") || "";
    calInput.value = button.getAttribute("data-cal") || "";

    // Menge bleibt frei waehlbar - Standardwert 100 g.
    if (amountInput.value === "") {
      amountInput.value = "100";
    }

    updatePreview();
    amountInput.focus();
    amountInput.select(); // Menge sofort zum Aendern markieren
  });
});

/* ------------------------------------------------------------
   6) Kalorien-Vorschau im Formular live berechnen
   Formel: Kalorien pro 100 g x Gramm / 100
   ------------------------------------------------------------ */
var preview = document.getElementById("calorie-preview");

function updatePreview() {
  if (!preview || !calInput || !amountInput) return;

  var cal = parseFloat((calInput.value || "").replace(",", "."));
  var grams = parseFloat((amountInput.value || "").replace(",", "."));

  if (isNaN(cal) || isNaN(grams) || cal <= 0 || grams <= 0) {
    preview.textContent = "– kcal";
    preview.classList.remove("preview-ready");
    return;
  }

  preview.textContent = Math.round((cal * grams) / 100) + " kcal";
  preview.classList.add("preview-ready");
}

if (calInput && amountInput) {
  calInput.addEventListener("input", updatePreview);
  amountInput.addEventListener("input", updatePreview);
  updatePreview();
}

/* ------------------------------------------------------------
   7) Datumsauswahl: bei Aenderung sofort den Tag wechseln
   ------------------------------------------------------------ */
var datePicker = document.getElementById("date-picker");
var dateForm = document.getElementById("date-form");
if (datePicker && dateForm) {
  datePicker.addEventListener("change", function () {
    dateForm.submit();
  });
}

/* ------------------------------------------------------------
   8) Suche und Filter im Tagebuch (arbeiten gemeinsam)
   ------------------------------------------------------------ */
var searchInput = document.getElementById("search-input");
var filterButtons = document.querySelectorAll(".filter-btn");
var entryItems = document.querySelectorAll(".entry-item");
var noResults = document.getElementById("no-results");
var activeFilter = "alle";

function applyFilter() {
  var searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
  var visibleCount = 0;

  entryItems.forEach(function (item) {
    var name = item.getAttribute("data-name") || "";
    var meal = item.getAttribute("data-meal") || "";

    // Bedingung 1: Suchbegriff muss im Namen vorkommen (oder Suche leer sein)
    var matchesSearch = name.indexOf(searchTerm) !== -1;
    // Bedingung 2: Mahlzeit-Filter muss passen (oder "alle" gewaehlt sein)
    var matchesMeal = activeFilter === "alle" || meal === activeFilter;

    // Beide Bedingungen muessen erfuellt sein.
    if (matchesSearch && matchesMeal) {
      item.classList.remove("hidden");
      visibleCount += 1;
    } else {
      item.classList.add("hidden");
    }
  });

  // Hinweis anzeigen, wenn nichts zur Suche passt.
  if (noResults) {
    noResults.hidden = visibleCount !== 0;
  }
}

if (searchInput) {
  searchInput.addEventListener("input", applyFilter);
}

filterButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    // Aktiven Button hervorheben.
    filterButtons.forEach(function (b) { b.classList.remove("active"); });
    button.classList.add("active");
    activeFilter = button.getAttribute("data-filter") || "alle";
    applyFilter();
  });
});

// "Alle Eintraege anzeigen": Suche und Filter zuruecksetzen.
var showAllBtn = document.getElementById("show-all-btn");
if (showAllBtn) {
  showAllBtn.addEventListener("click", function () {
    if (searchInput) searchInput.value = "";
    activeFilter = "alle";
    filterButtons.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-filter") === "alle");
    });
    applyFilter();
  });
}

/* ------------------------------------------------------------
   9) Dialog zum Bearbeiten oeffnen und schliessen
   ------------------------------------------------------------ */
var modal = document.getElementById("edit-modal");
var editForm = document.getElementById("edit-form");

function openModal(button) {
  if (!modal || !editForm) return;

  var entryId = button.getAttribute("data-id");

  // Formular fuellen ...
  var field;
  field = document.getElementById("edit-name");
  if (field) field.value = button.getAttribute("data-name") || "";
  field = document.getElementById("edit-cal");
  if (field) field.value = button.getAttribute("data-cal") || "";
  field = document.getElementById("edit-amount");
  if (field) field.value = button.getAttribute("data-amount") || "";
  field = document.getElementById("edit-meal");
  if (field) field.value = button.getAttribute("data-meal") || "Frühstück";
  field = document.getElementById("edit-date");
  if (field) field.value = button.getAttribute("data-date") || "";

  // ... und auf die richtige Adresse setzen (Flask-Route).
  editForm.setAttribute("action", "/update_entry/" + entryId);
  modal.hidden = false;
  document.body.classList.add("modal-open");

  var nameField = document.getElementById("edit-name");
  if (nameField) nameField.focus();
}

function closeModal() {
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

document.querySelectorAll(".btn-edit").forEach(function (button) {
  button.addEventListener("click", function () {
    openModal(button);
  });
});

var modalClose = document.getElementById("modal-close");
var modalCancel = document.getElementById("modal-cancel");
if (modalClose) modalClose.addEventListener("click", closeModal);
if (modalCancel) modalCancel.addEventListener("click", closeModal);

// Schliessen, wenn man ausserhalb des Dialogs klickt.
if (modal) {
  modal.addEventListener("click", function (event) {
    if (event.target === modal) {
      closeModal();
    }
  });
}

// Schliessen mit der Escape-Taste.
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && modal && !modal.hidden) {
    closeModal();
  }
});

/* ------------------------------------------------------------
   10) Vor dem Loeschen nachfragen (Bestaetigung)
   ------------------------------------------------------------ */
document.querySelectorAll(".delete-form").forEach(function (form) {
  form.addEventListener("submit", function (event) {
    var confirmed = window.confirm("Moechtest du diesen Eintrag wirklich loeschen?");
    if (!confirmed) {
      event.preventDefault(); // Loeschen abbrechen
    }
  });
});

/* ------------------------------------------------------------
   11) Navigation: aktiven Punkt hervorheben
   ------------------------------------------------------------ */
var navLinks = document.querySelectorAll(".main-nav a");
navLinks.forEach(function (link) {
  link.addEventListener("click", function () {
    navLinks.forEach(function (l) { l.classList.remove("active"); });
    link.classList.add("active");
  });
});

// Am Ende: Kennzeichen, dass das komplette Skript fehlerfrei gelaufen ist.
document.documentElement.setAttribute("data-js", "ok");
