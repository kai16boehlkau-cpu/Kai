/* ============================================================
   CALORIE TRACKER - Statische Version fuer GitHub Pages
   ------------------------------------------------------------
   Diese Version braucht KEINEN Server. Alle Daten liegen im
   Browser des Besuchers (localStorage) und sind nach dem
   Schliessen des Tabs immer noch da.
   ============================================================ */

var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------
   0) Daten-Schicht: Speichern und Laden aus dem Browser
   ------------------------------------------------------------ */
var STORE_ENTRIES = "kzt_entries";   // Liste aller Eintraege
var STORE_GOAL = "kzt_goal";         // Tagesziel in kcal
var STORE_GOALSET = "kzt_goal_set";  // "1" = Ziel wurde schon festgelegt

function loadData(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false; // z.B. wenn der Speicher voll ist
  }
}

var entries = loadData(STORE_ENTRIES, []);
var dailyGoal = loadData(STORE_GOAL, 2000);
var goalIsSet = loadData(STORE_GOALSET, false);

function persistEntries() { saveData(STORE_ENTRIES, entries); }

/* ------------------------------------------------------------
   1) Hilfsfunktionen (Datum, Formatierung, Berechnung)
   ------------------------------------------------------------ */
var MEALS = ["Frühstück", "Mittagessen", "Abendessen", "Snack"];
var MEAL_ORDER = { "Frühstück": 1, "Mittagessen": 2, "Abendessen": 3, "Snack": 4 };
var MEAL_STYLE = { "Frühstück": "breakfast", "Mittagessen": "lunch", "Abendessen": "dinner", "Snack": "snack" };
var MEAL_ICON = { "Frühstück": "🍳", "Mittagessen": "🍛", "Abendessen": "🍽️", "Snack": "🍎" };
var WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function toISO(dateObj) {
  var y = dateObj.getFullYear();
  var m = String(dateObj.getMonth() + 1).padStart(2, "0");
  var d = String(dateObj.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function todayISO() { return toISO(new Date()); }

function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || "")) return false;
  var parsed = new Date(text + "T00:00:00");
  return !isNaN(parsed.getTime());
}

function formatDateDE(iso) {
  var d = new Date(iso + "T00:00:00");
  // In JavaScript ist Sonntag = 0, in unserer Liste ist Montag = 0.
  var index = (d.getDay() + 6) % 7;
  return WEEKDAYS[index] + ", " + d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}

function calculateCalories(cal100, grams) {
  return Math.round(cal100 * grams / 100);
}

function parseNumber(text) {
  if (text === null || text === undefined) return null;
  var cleaned = String(text).trim().replace(",", ".");
  if (cleaned === "") return null;
  var value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

function escapeHTML(text) {
  var div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

// Gewaehltes Datum: URL-Parameter ?date=... haben Vorrang, sonst heute.
var params = new URLSearchParams(window.location.search);
var selectedDate = params.get("date");
if (!isValidDate(selectedDate)) selectedDate = todayISO();

/* ------------------------------------------------------------
   2) Meldungen (Toasts)
   ------------------------------------------------------------ */
function showToast(message, type) {
  var area = document.getElementById("toast-area");
  if (!area) return;
  var toast = document.createElement("div");
  toast.className = "toast toast-" + (type || "success");
  toast.innerHTML =
    '<span class="toast-icon">' + (type === "error" ? "!" : "✓") + "</span>" +
    "<span>" + escapeHTML(message) + "</span>";
  area.appendChild(toast);
  setTimeout(function () {
    toast.classList.add("hide");
    setTimeout(function () { toast.remove(); }, 400);
  }, 4000);
}

/* ------------------------------------------------------------
   3) Ladebildschirm: Logo fliegt in die Kopfzeile
   ------------------------------------------------------------ */
var splash = document.getElementById("splash");
var splashLogo = document.getElementById("splash-logo");
var brandMark = document.querySelector(".brand-mark");

function removeSplash() {
  if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
  if (brandMark) brandMark.classList.remove("logo-hidden");
  document.body.classList.remove("splash-active");
}

if (splash && splashLogo && brandMark) {
  var alreadySeen = false;
  try { alreadySeen = sessionStorage.getItem("splashSeen") === "1"; } catch (e) { alreadySeen = false; }

  if (reduceMotion || alreadySeen) {
    removeSplash();
  } else {
    document.body.classList.add("splash-active");
    brandMark.classList.add("logo-hidden");
    var flightStarted = false;

    function finishFlight() {
      if (brandMark) brandMark.classList.remove("logo-hidden");
      try { sessionStorage.setItem("splashSeen", "1"); } catch (e) { /* egal */ }
      removeSplash();
    }

    function startFlight() {
      if (flightStarted) return;
      flightStarted = true;
      var target = brandMark.getBoundingClientRect();
      var big = splashLogo.getBoundingClientRect();
      if (!target.width || !big.width) { finishFlight(); return; }

      var scale = target.width / big.width;
      var moveX = (target.left + target.width / 2) - (big.left + big.width / 2);
      var moveY = (target.top + target.height / 2) - (big.top + big.height / 2);

      splash.classList.add("flying");
      splash.classList.add("fade");
      splashLogo.style.transform = "translate(" + moveX + "px, " + moveY + "px) scale(" + scale + ")";
      setTimeout(finishFlight, 1000);
    }

    if (splashLogo.complete && splashLogo.naturalWidth > 0) {
      setTimeout(startFlight, 900);
    } else {
      splashLogo.addEventListener("load", function () { setTimeout(startFlight, 900); });
      setTimeout(startFlight, 2500);
    }
  }
}

/* ------------------------------------------------------------
   4) Ausgewaehlten Tag berechnen und Werte zusammenbauen
   ------------------------------------------------------------ */
function entriesForDate(iso) {
  return entries.filter(function (entry) { return entry.date === iso; });
}

function dayStats(iso) {
  var list = entriesForDate(iso);
  var perMeal = {};
  MEALS.forEach(function (meal) { perMeal[meal] = 0; });
  var total = 0;
  list.forEach(function (entry) {
    total += entry.calories;
    if (perMeal[entry.meal] !== undefined) perMeal[entry.meal] += entry.calories;
  });
  return { list: list, total: total, count: list.length, perMeal: perMeal };
}

/* ------------------------------------------------------------
   5) Seite zeichnen (alle Werte aktualisieren)
   ------------------------------------------------------------ */
function goalMessage(total, remaining) {
  if (total >= dailyGoal) return "Tagesziel erreicht - super gemacht!";
  if (remaining > 0) return "Noch " + remaining + " kcal bis zu deinem Ziel.";
  return "Ziel unterschritten.";
}

function animateNumber(element, target, duration) {
  if (!element) return;
  if (reduceMotion) { element.textContent = String(target); return; }
  var startTime = null;
  function step(timestamp) {
    if (startTime === null) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(step);
    else { element.textContent = String(target); element.classList.add("pop"); }
  }
  requestAnimationFrame(step);
}

function renderDay() {
  var stats = dayStats(selectedDate);
  var remaining = dailyGoal - stats.total;
  var percent = dailyGoal > 0 ? Math.round(stats.total / dailyGoal * 100) : 0;
  var ringPercent = Math.min(percent, 100);
  var message = goalMessage(stats.total, remaining);

  // Kopfbereich
  var dateLabel = document.getElementById("date-label");
  if (dateLabel) dateLabel.textContent = "📅 " + formatDateDE(selectedDate);

  var chip = document.getElementById("goal-chip");
  if (chip) {
    chip.textContent = (stats.total >= dailyGoal ? "🎯 " : "⚡ ") + message;
    chip.classList.toggle("status-ok", stats.total >= dailyGoal);
  }

  var picker = document.getElementById("date-picker");
  if (picker && picker.value !== selectedDate) picker.value = selectedDate;

  var todayBtn = document.getElementById("today-btn");
  if (todayBtn) todayBtn.hidden = selectedDate === todayISO();

  // Start-Formular: nur wenn das Ziel noch nie festgelegt wurde
  var startCard = document.getElementById("ziel-start");
  if (startCard) startCard.hidden = goalIsSet;

  // Fortschrittsring
  var ring = document.getElementById("ring-progress");
  if (ring) {
    var circumference = 326.7;
    var offset = circumference - (ringPercent / 100) * circumference;
    ring.setAttribute("data-percent", String(ringPercent));
    ring.classList.toggle("done", percent >= 100);
    setTimeout(function () { ring.style.strokeDashoffset = String(offset); }, reduceMotion ? 0 : 150);
  }
  var percentLabel = document.getElementById("percent-value");
  if (percentLabel) animateNumber(percentLabel, ringPercent, 900);
  var ringGoal = document.getElementById("ring-goal");
  if (ringGoal) ringGoal.textContent = String(dailyGoal);
  var ringFoot = document.getElementById("ring-foot");
  if (ringFoot) {
    ringFoot.textContent = message;
    ringFoot.classList.toggle("text-ok", stats.total >= dailyGoal);
  }

  // KPI-Karten
  var totalLabel = document.getElementById("stat-total");
  if (totalLabel) {
    totalLabel.setAttribute("data-value", String(stats.total));
    animateNumber(totalLabel, stats.total, 900);
  }
  var totalSub = document.getElementById("stat-total-sub");
  if (totalSub) totalSub.textContent = "kcal · " + selectedDate;

  var kpiGoal = document.getElementById("kpi-goal");
  if (kpiGoal) kpiGoal.textContent = String(dailyGoal);

  var kpiLink = document.getElementById("kpi-goal-link");
  if (kpiLink) {
    kpiLink.textContent = goalIsSet ? "Ändern in den Einstellungen →" : "Jetzt festlegen";
    kpiLink.setAttribute("href", goalIsSet ? "einstellungen.html" : "#ziel-start");
  }

  var remainIcon = document.getElementById("remain-icon");
  var remainLabel = document.getElementById("remain-label");
  var remainValue = document.getElementById("stat-remaining");
  if (remainIcon) remainIcon.textContent = remaining >= 0 ? "⚡" : "⚠️";
  if (remainLabel) remainLabel.textContent = remaining >= 0 ? "Noch verbleibend" : "Überschritten";
  if (remainValue) {
    remainValue.textContent = String(remaining);
    remainValue.classList.toggle("text-danger", remaining < 0);
  }
  var countLabel = document.getElementById("stat-count");
  if (countLabel) countLabel.textContent = String(stats.count);

  // Mahlzeiten-Balken
  var barsBox = document.getElementById("meal-bars");
  if (barsBox) {
    var maxMeal = Math.max.apply(null, MEALS.map(function (m) { return stats.perMeal[m]; }));
    barsBox.innerHTML = "";
    MEALS.forEach(function (meal) {
      var width = maxMeal > 0 ? Math.round(stats.perMeal[meal] / maxMeal * 100) : 0;
      var row = document.createElement("div");
      row.className = "meal-bar-row";
      row.innerHTML =
        '<span class="meal-name"><span class="dot dot-' + MEAL_STYLE[meal] + '"></span>' + meal + "</span>" +
        '<div class="meal-bar-track"><div class="meal-bar-fill fill-' + MEAL_STYLE[meal] + '" style="width:0%"></div></div>' +
        '<span class="meal-value">' + stats.perMeal[meal] + " <small>kcal</small></span>";
      barsBox.appendChild(row);
      var fill = row.querySelector(".meal-bar-fill");
      setTimeout(function () { fill.style.width = width + "%"; }, reduceMotion ? 0 : 300);
    });
  }

  // Ziel-Karte rechts
  var goalCurrent = document.getElementById("goal-current");
  if (goalCurrent) goalCurrent.textContent = String(dailyGoal);
  var goalHint = document.getElementById("goal-hint");
  if (goalHint) goalHint.innerHTML = "Aktuell <strong>" + dailyGoal + " kcal</strong> pro Tag.";
  var goalEdit = document.getElementById("goal-edit-link");
  if (goalEdit) {
    goalEdit.textContent = goalIsSet ? "Ändern auf der Seite Einstellungen" : "Tagesziel jetzt festlegen";
    goalEdit.setAttribute("href", goalIsSet ? "einstellungen.html" : "#ziel-start");
  }

  // Mahlzeit-Chips
  var chipsBox = document.getElementById("meal-chips");
  if (chipsBox) {
    chipsBox.innerHTML = "";
    MEALS.forEach(function (meal) {
      var chipEl = document.createElement("div");
      chipEl.className = "meal-chip chip-" + MEAL_STYLE[meal];
      chipEl.innerHTML =
        '<span class="chip-icon">' + MEAL_ICON[meal] + "</span>" +
        '<span class="chip-name">' + meal + "</span>" +
        "<strong>" + stats.perMeal[meal] + "</strong><small>kcal</small>";
      chipsBox.appendChild(chipEl);
    });
  }
  var chipsHint = document.getElementById("chips-hint");
  if (chipsHint) chipsHint.textContent = "Kalorien je Mahlzeit am " + selectedDate + ".";

  renderDiary(stats);
}

/* ------------------------------------------------------------
   6) Tagebuch zeichnen (Liste, Suche und Filter danach)
   ------------------------------------------------------------ */
var activeFilter = "alle";

function renderDiary(stats) {
  var list = document.getElementById("entry-list");
  var empty = document.getElementById("empty-state");
  var badge = document.getElementById("diary-badge");
  var hint = document.getElementById("diary-hint");
  if (!list) return;

  if (badge) badge.textContent = stats.count + (stats.count === 1 ? " Eintrag" : " Einträge");
  if (hint) hint.textContent = "Alle Einträge vom " + formatDateDE(selectedDate);

  if (stats.count === 0) {
    list.hidden = true;
    if (empty) empty.hidden = false;
    list.innerHTML = "";
    return;
  }
  if (empty) empty.hidden = true;
  list.hidden = false;

  // Reihenfolge wie auf dem Server: Mahlzeit, dann Uhrzeit
  var sorted = stats.list.slice().sort(function (a, b) {
    var orderA = MEAL_ORDER[a.meal] || 9;
    var orderB = MEAL_ORDER[b.meal] || 9;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.created_at).localeCompare(String(b.created_at));
  });

  list.innerHTML = "";
  sorted.forEach(function (entry) {
    var li = document.createElement("li");
    li.className = "entry-item";
    li.setAttribute("data-name", String(entry.name).toLowerCase());
    li.setAttribute("data-meal", entry.meal);

    var grams = "{:g}".replace("{}", "") === "" ? "" : "";
    var amount = Number(entry.amount_grams);

    li.innerHTML =
      '<span class="entry-icon">' + (MEAL_ICON[entry.meal] || "🍴") + "</span>" +
      '<div class="entry-main">' +
        '<strong class="entry-name">' + escapeHTML(entry.name) + "</strong>" +
        '<span class="entry-meta">' +
          '<span class="badge badge-' + MEAL_STYLE[entry.meal] + '">' + escapeHTML(entry.meal) + "</span> " +
          amount + " g · " + entry.date +
        "</span>" +
      "</div>" +
      '<span class="entry-calories">' + entry.calories + " <small>kcal</small></span>" +
      '<div class="entry-actions">' +
        '<button type="button" class="btn btn-sm btn-soft btn-edit">Bearbeiten</button>' +
        '<button type="button" class="btn btn-sm btn-danger btn-del">Löschen</button>' +
      "</div>";

    li.querySelector(".btn-edit").addEventListener("click", function () { openModal(entry.id); });
    li.querySelector(".btn-del").addEventListener("click", function () { deleteEntry(entry.id); });
    list.appendChild(li);
  });

  applyFilter();
}

/* ------------------------------------------------------------
   7) Suche und Filter (arbeiten gemeinsam)
   ------------------------------------------------------------ */
function applyFilter() {
  var searchInput = document.getElementById("search-input");
  var noResults = document.getElementById("no-results");
  var items = document.querySelectorAll(".entry-item");
  var term = searchInput ? searchInput.value.toLowerCase().trim() : "";
  var visible = 0;

  items.forEach(function (item) {
    var name = item.getAttribute("data-name") || "";
    var meal = item.getAttribute("data-meal") || "";
    var matchSearch = name.indexOf(term) !== -1;
    var matchMeal = activeFilter === "alle" || meal === activeFilter;
    if (matchSearch && matchMeal) {
      item.classList.remove("hidden");
      visible += 1;
    } else {
      item.classList.add("hidden");
    }
  });

  if (noResults) noResults.hidden = !(visible === 0 && items.length > 0);
}

var searchInput = document.getElementById("search-input");
if (searchInput) searchInput.addEventListener("input", applyFilter);

var filterButtons = document.querySelectorAll(".filter-btn");
filterButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    filterButtons.forEach(function (b) { b.classList.remove("active"); });
    button.classList.add("active");
    activeFilter = button.getAttribute("data-filter") || "alle";
    applyFilter();
  });
});

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
   8) Eintragen: Presets, Vorschau und Speichern
   ------------------------------------------------------------ */
var nameInput = document.getElementById("name");
var calInput = document.getElementById("calories_per_100g");
var amountInput = document.getElementById("amount_grams");
var preview = document.getElementById("calorie-preview");

function updatePreview() {
  if (!preview || !calInput || !amountInput) return;
  var cal = parseNumber(calInput.value);
  var grams = parseNumber(amountInput.value);
  if (cal === null || grams === null || cal <= 0 || grams <= 0) {
    preview.textContent = "– kcal";
    preview.classList.remove("preview-ready");
    return;
  }
  preview.textContent = calculateCalories(cal, grams) + " kcal";
  preview.classList.add("preview-ready");
}

if (calInput && amountInput) {
  calInput.addEventListener("input", updatePreview);
  amountInput.addEventListener("input", updatePreview);
  updatePreview();
}

document.querySelectorAll(".preset").forEach(function (button) {
  button.addEventListener("click", function () {
    if (!nameInput || !calInput || !amountInput) return;
    nameInput.value = button.getAttribute("data-name") || "";
    calInput.value = button.getAttribute("data-cal") || "";
    if (amountInput.value === "") amountInput.value = "100";
    updatePreview();
    amountInput.focus();
    amountInput.select();
  });
});

function validateEntry(data) {
  if (data.name === "") return "Bitte gib einen Namen für das Lebensmittel ein.";
  if (data.name.length > 80) return "Der Name darf höchstens 80 Zeichen lang sein.";
  if (data.calories_per_100g === null) return "Bitte gib die Kalorien pro 100 g als Zahl ein.";
  if (data.calories_per_100g <= 0 || data.calories_per_100g > 900) return "Kalorien pro 100 g müssen zwischen 1 und 900 liegen.";
  if (data.amount_grams === null) return "Bitte gib die verzehrte Menge in Gramm ein.";
  if (data.amount_grams <= 0 || data.amount_grams > 5000) return "Die Menge muss zwischen 1 und 5000 Gramm liegen.";
  if (MEALS.indexOf(data.meal) === -1) return "Bitte wähle eine gültige Mahlzeit aus.";
  if (!isValidDate(data.date)) return "Das Datum ist ungültig. Format: JJJJ-MM-TT.";
  return null;
}

function readEntryForm(form) {
  return {
    name: (form.querySelector('[name="name"]').value || "").trim(),
    calories_per_100g: parseNumber(form.querySelector('[name="calories_per_100g"]').value),
    amount_grams: parseNumber(form.querySelector('[name="amount_grams"]').value),
    meal: form.querySelector('[name="meal"]').value,
    date: form.querySelector('[name="date"]').value
  };
}

var addForm = document.getElementById("add-form");
if (addForm) {
  addForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = readEntryForm(addForm);
    var error = validateEntry(data);
    if (error) { showToast(error, "error"); return; }

    data.calories = calculateCalories(data.calories_per_100g, data.amount_grams);
    data.id = Date.now();
    data.created_at = new Date().toTimeString().slice(0, 8);
    entries.push(data);
    persistEntries();

    showToast(data.name + " wurde hinzugefuegt (" + data.calories + " kcal).", "success");
    selectedDate = data.date;
    renderDay();
    addForm.reset();
    var entryDate = document.getElementById("entry-date");
    if (entryDate) entryDate.value = selectedDate;
    updatePreview();
  });
}

/* ------------------------------------------------------------
   9) Eintrag loeschen
   ------------------------------------------------------------ */
function deleteEntry(id) {
  var ok = window.confirm("Moechtest du diesen Eintrag wirklich loeschen?");
  if (!ok) return;
  entries = entries.filter(function (entry) { return entry.id !== id; });
  persistEntries();
  showToast("Eintrag wurde geloescht.", "success");
  renderDay();
}

/* ------------------------------------------------------------
   10) Dialog: Eintrag bearbeiten
   ------------------------------------------------------------ */
var modal = document.getElementById("edit-modal");
var editForm = document.getElementById("edit-form");
var editingId = null;

function openModal(id) {
  if (!modal || !editForm) return;
  var entry = entries.find(function (item) { return item.id === id; });
  if (!entry) return;
  editingId = id;
  editForm.querySelector('[name="name"]').value = entry.name;
  editForm.querySelector('[name="calories_per_100g"]').value = entry.calories_per_100g;
  editForm.querySelector('[name="amount_grams"]').value = entry.amount_grams;
  editForm.querySelector('[name="meal"]').value = entry.meal;
  editForm.querySelector('[name="date"]').value = entry.date;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("edit-name").focus();
}

function closeModal() {
  if (!modal) return;
  modal.hidden = true;
  editingId = null;
  document.body.classList.remove("modal-open");
}

if (editForm) {
  editForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = readEntryForm(editForm);
    var error = validateEntry(data);
    if (error) { showToast(error, "error"); return; }

    var entry = entries.find(function (item) { return item.id === editingId; });
    if (!entry) { closeModal(); return; }

    entry.name = data.name;
    entry.calories_per_100g = data.calories_per_100g;
    entry.amount_grams = data.amount_grams;
    entry.meal = data.meal;
    entry.date = data.date;
    entry.calories = calculateCalories(data.calories_per_100g, data.amount_grams);
    persistEntries();

    closeModal();
    showToast("Eintrag wurde aktualisiert (" + entry.calories + " kcal).", "success");
    if (isValidDate(data.date)) selectedDate = data.date;
    renderDay();
  });
}

var modalClose = document.getElementById("modal-close");
var modalCancel = document.getElementById("modal-cancel");
if (modalClose) modalClose.addEventListener("click", closeModal);
if (modalCancel) modalCancel.addEventListener("click", closeModal);
if (modal) {
  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeModal();
  });
}
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && modal && !modal.hidden) closeModal();
});

/* ------------------------------------------------------------
   11) Tagesziel speichern (Startseite UND Einstellungen)
   ------------------------------------------------------------ */
function saveGoal(value) {
  var goal = Math.round(parseNumber(value));
  if (isNaN(goal)) return "Das Tagesziel muss eine ganze Zahl sein.";
  if (String(value).indexOf(".") !== -1 || String(value).indexOf(",") !== -1) {
    goal = parseInt(value, 10);
    if (isNaN(goal)) return "Das Tagesziel muss eine ganze Zahl sein.";
  }
  if (goal < 800 || goal > 6000) return "Das Tagesziel muss zwischen 800 und 6000 kcal liegen.";

  dailyGoal = goal;
  goalIsSet = true;
  saveData(STORE_GOAL, dailyGoal);
  saveData(STORE_GOALSET, true);
  return null;
}

var startGoalForm = document.getElementById("start-goal-form");
if (startGoalForm) {
  startGoalForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var input = document.getElementById("start_goal");
    var error = saveGoal(input.value);
    if (error) { showToast(error, "error"); return; }
    showToast("Tagesziel auf " + dailyGoal + " kcal gespeichert.", "success");
    renderDay();
  });
}

var settingsForm = document.getElementById("settings-form");
if (settingsForm) {
  var settingsInput = document.getElementById("settings_goal");
  if (settingsInput) settingsInput.value = String(dailyGoal);
  var currentGoal = document.getElementById("settings-current");
  if (currentGoal) currentGoal.textContent = String(dailyGoal);

  settingsForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var error = saveGoal(settingsInput.value);
    if (error) { showToast(error, "error"); return; }
    showToast("Tagesziel auf " + dailyGoal + " kcal gespeichert.", "success");
    if (currentGoal) currentGoal.textContent = String(dailyGoal);
  });
}

/* ------------------------------------------------------------
   12) Datum wechseln (Pfeile, Auswahl, "Zu heute")
   ------------------------------------------------------------ */
function setDate(iso) {
  if (!isValidDate(iso)) return;
  selectedDate = iso;
  var url = new URL(window.location.href);
  url.searchParams.set("date", iso);
  window.history.replaceState({}, "", url);
  renderDay();
}

var dayPrev = document.getElementById("day-prev");
var dayNext = document.getElementById("day-next");
var todayBtn = document.getElementById("today-btn");
var picker = document.getElementById("date-picker");

if (dayPrev) dayPrev.addEventListener("click", function () {
  var d = new Date(selectedDate + "T00:00:00");
  d.setDate(d.getDate() - 1);
  setDate(toISO(d));
});
if (dayNext) dayNext.addEventListener("click", function () {
  var d = new Date(selectedDate + "T00:00:00");
  d.setDate(d.getDate() + 1);
  setDate(toISO(d));
});
if (todayBtn) todayBtn.addEventListener("click", function () { setDate(todayISO()); });
if (picker) {
  picker.value = selectedDate;
  picker.addEventListener("change", function () { setDate(picker.value); });
}

var entryDateInput = document.getElementById("entry-date");
if (entryDateInput) entryDateInput.value = selectedDate;

/* ------------------------------------------------------------
   13) Start: Seite einrichten
   ------------------------------------------------------------ */
if (document.getElementById("entry-list") || document.getElementById("kpi-goal")) {
  renderDay();
}

// Kennzeichen, dass das komplette Skript fehlerfrei gelaufen ist.
document.documentElement.setAttribute("data-js", "ok");
