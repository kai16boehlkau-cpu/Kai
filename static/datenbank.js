/* ============================================================
   DATENBANK-SEITE – Interaktionen
   - Erklär-Pop-ups für klickbare Fachbegriffe
   - Aufklappbare Spaltenzeilen im Tabellen-Diagramm
   - Kopier-Button an jeder Codebox
   - Inhaltsleiste mit Markierung des sichtbaren Abschnitts
   - Nach-oben-Schaltfläche
   ============================================================ */

(function () {
  "use strict";

  /* --------------------------------------------------------
     1) Erklär-Pop-ups für Fachbegriffe
     Im Text markierte Begriffe (class "db-term") bekommen
     beim Überfahren oder Antippen eine kurze Erklärung.
     -------------------------------------------------------- */
  var tooltip = document.createElement("div");
  tooltip.className = "db-tooltip";
  tooltip.setAttribute("role", "tooltip");
  document.body.appendChild(tooltip);
  var aktiverTerm = null;

  function zeigeTooltip(term) {
    var text = term.getAttribute("data-tip");
    if (!text) return;
    tooltip.textContent = text;
    tooltip.classList.add("show");
    var rect = term.getBoundingClientRect();
    var platzOben = rect.top;
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    var hoehe = tooltip.offsetHeight;
    var breite = tooltip.offsetWidth;
    // Horizontal mittig ausrichten, im Bildschirm lassen
    var links = rect.left + rect.width / 2 - breite / 2;
    links = Math.max(8, Math.min(links, window.innerWidth - breite - 8));
    // Lieber oberhalb zeigen, sonst darunter – niemals über den Rand hinaus
    var oben = rect.top - hoehe - 8;
    if (oben < 8) {
      oben = rect.bottom + 8;
      if (oben < 8) oben = 8;
    }
    tooltip.style.left = links + "px";
    tooltip.style.top = oben + "px";
    term.setAttribute("aria-expanded", "true");
    aktiverTerm = term;
  }

  function versteckeTooltip() {
    tooltip.classList.remove("show");
    if (aktiverTerm) aktiverTerm.setAttribute("aria-expanded", "false");
    aktiverTerm = null;
  }

  document.querySelectorAll(".db-term").forEach(function (term) {
    term.setAttribute("aria-expanded", "false");
    term.addEventListener("mouseenter", function () { zeigeTooltip(term); });
    term.addEventListener("mouseleave", versteckeTooltip);
    term.addEventListener("focus", function () { zeigeTooltip(term); });
    term.addEventListener("blur", versteckeTooltip);
    term.addEventListener("click", function (event) {
      event.stopPropagation();
      // Am Touchscreen nur über den Klick umschalten
      if (aktiverTerm === term) {
        versteckeTooltip();
      } else {
        zeigeTooltip(term);
      }
    });
  });

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".db-term")) versteckeTooltip();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") versteckeTooltip();
  });
  window.addEventListener("scroll", versteckeTooltip, { passive: true });

  /* --------------------------------------------------------
     2) Spaltenzeilen im Tabellen-Diagramm aufklappen
     Klick (oder Enter/Leertaste) blendet eine zusätzliche
     Erklärung mit Beispielwert unter der Zeile ein.
     -------------------------------------------------------- */
  document.querySelectorAll(".db-col-item").forEach(function (zeile) {
    zeile.addEventListener("click", function () {
      var offen = zeile.getAttribute("aria-expanded") === "true";
      zeile.setAttribute("aria-expanded", offen ? "false" : "true");
      var detail = zeile.querySelector(".db-col-more");
      if (detail) detail.hidden = offen;
    });
    zeile.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        zeile.click();
      }
    });
  });

  /* --------------------------------------------------------
     3) Kopier-Button an jeder Codebox
     Kopiert den reinen Code (ohne Markierungen) in die
     Zwischenablage und bestätigt das kurz im Button-Text.
     -------------------------------------------------------- */
  function kopiereText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return kopierePerFallback(text);
      });
    }
    return kopierePerFallback(text);
  }

  // Ältere Browser oder gesperrte Freigabe: über ein verstecktes Textfeld
  function kopierePerFallback(text) {
    return new Promise(function (loesen, ablehnen) {
      var feld = document.createElement("textarea");
      feld.value = text;
      feld.style.position = "fixed";
      feld.style.opacity = "0";
      document.body.appendChild(feld);
      feld.select();
      try {
        document.execCommand("copy");
        loesen();
      } catch (fehler) {
        ablehnen(fehler);
      }
      document.body.removeChild(feld);
    });
  }

  document.querySelectorAll(".codebox").forEach(function (box) {
    var kopf = box.querySelector(".codebox-head");
    var code = box.querySelector("pre code");
    if (!kopf || !code) return;

    var knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "codebox-copy";
    knopf.textContent = "Kopieren";
    knopf.setAttribute("aria-label", "Code in die Zwischenablage kopieren");
    kopf.appendChild(knopf);

    knopf.addEventListener("click", function () {
      kopiereText(code.innerText).then(function () {
        knopf.textContent = "Kopiert!";
        knopf.classList.add("copied");
        setTimeout(function () {
          knopf.textContent = "Kopieren";
          knopf.classList.remove("copied");
        }, 1600);
      }).catch(function () {
        knopf.textContent = "Klappt nicht";
        setTimeout(function () { knopf.textContent = "Kopieren"; }, 1600);
      });
    });
  });

  /* --------------------------------------------------------
     4) Inhaltsleiste: sichtbaren Abschnitt markieren
     Bei jedem Scroll wird berechnet, welches Kapitel die
     Oberkante des Bildschirms überschritten hat; dessen Link
     wird hervorgehoben.
     -------------------------------------------------------- */
  var tocLinks = document.querySelectorAll(".db-toc-link");
  var kapitelBereiche = [];
  tocLinks.forEach(function (link) {
    var ziel = document.querySelector(link.getAttribute("href"));
    if (ziel) kapitelBereiche.push({ link: link, ziel: ziel });
  });

  function aktualisiereToc() {
    if (!kapitelBereiche.length) return;
    var grenze = window.scrollY + window.innerHeight * 0.3;
    var aktuell = null;
    kapitelBereiche.forEach(function (eintrag) {
      if (eintrag.ziel.offsetTop <= grenze) aktuell = eintrag;
    });
    kapitelBereiche.forEach(function (eintrag) {
      eintrag.link.classList.toggle("active", eintrag === aktuell);
    });
  }

  if (kapitelBereiche.length) {
    window.addEventListener("scroll", aktualisiereToc, { passive: true });
    aktualisiereToc();
  }

  /* --------------------------------------------------------
     5) Nach-oben-Schaltfläche
     Erscheint erst, wenn ein Stück gescrollt wurde.
     -------------------------------------------------------- */
  var nachOben = document.createElement("button");
  nachOben.type = "button";
  nachOben.className = "db-back-top";
  nachOben.textContent = "↑";
  nachOben.setAttribute("aria-label", "Zum Seitenanfang scrollen");
  document.body.appendChild(nachOben);

  nachOben.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", function () {
    nachOben.classList.toggle("show", window.scrollY > 500);
  }, { passive: true });

})();
