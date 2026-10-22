# ============================================================
#  CALORIE TRACKER - Ein einfacher Kalorienzähler
#  Schulprojekt für den Informatikunterricht
#
#  Technologien: Python, Flask, SQLite
#
#  Ablauf einer Anfrage:
#  1. Der Browser schickt eine Anfrage an Flask (z.B. GET / oder POST /add_entry)
#  2. Flask führt die passende Funktion unten aus
#  3. Die Funktion liest oder speichert Daten in der SQLite-Datenbank
#  4. Flask schickt eine Antwort zurück (HTML-Seite oder Weiterleitung)
# ============================================================

import os
import sqlite3
from datetime import date, datetime, timedelta

from flask import Flask, flash, redirect, render_template, request, url_for

# ------------------------------------------------------------
# Flask-App erstellen
# ------------------------------------------------------------
app = Flask(__name__)

# Ein geheimer Schlüssel, damit Flask Sicherheits-Meldungen (flash) zeigen darf.
# Lokal nutzen wir einen festen Wert. Im Internet (Hosting) wird der Schlüssel
# als Umgebungsvariable SECRET_KEY gesetzt - so steht kein Geheimnis im Code.
app.secret_key = os.environ.get("SECRET_KEY", "kalorienzaehler-schulprojekt-lokal")

# Pfad zur Datenbankdatei. Sie entsteht NEBEN app.py automatisch.
DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

# Alle erlaubten Mahlzeiten. Damit prüfen wir Benutzereingaben.
MEALS = ["Frühstück", "Mittagessen", "Abendessen", "Snack"]

# Reihenfolge der Mahlzeiten im Tagebuch (für die Sortierung).
MEAL_ORDER = {"Frühstück": 1, "Mittagessen": 2, "Abendessen": 3, "Snack": 4}

# Farbklasse pro Mahlzeit (für die Anzeige im CSS).
MEAL_STYLE = {
    "Frühstück": "breakfast",
    "Mittagessen": "lunch",
    "Abendessen": "dinner",
    "Snack": "snack",
}

# Namen der Wochentage und Monate auf Deutsch (für die Datumsanzeige).
WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
MONTHS = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
]


# ------------------------------------------------------------
# Datenbank-Funktionen
# ------------------------------------------------------------

def get_db():
    """Öffnet die Datenbank und gibt die Verbindung zurück.

    row_factory = sqlite3.Row bedeutet: Wir können die Ergebnisse später
    über den Spaltennamen ansprechen, z.B. row["name"],
    statt über eine Nummer wie row[0].
    """
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_database():
    """Erstellt die Datenbank und die Tabellen, falls sie noch nicht existieren.

    WICHTIG: CREATE TABLE IF NOT EXISTS löscht NIEMALS bestehende Daten.
    Wenn die Datei database.db schon da ist, bleiben alle Einträge erhalten.
    """
    connection = get_db()

    # Tabelle 1: Ernährungseinträge
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,  -- eindeutige ID (Primärschlüssel)
            name TEXT NOT NULL,                    -- Name des Lebensmittels
            calories_per_100g REAL NOT NULL,       -- Kalorien pro 100 g (REAL = Zahl mit Komma)
            amount_grams REAL NOT NULL,            -- verzehrte Menge in Gramm
            calories INTEGER NOT NULL,             -- berechnete Kalorien der Portion
            meal TEXT NOT NULL,                    -- Mahlzeit (Frühstück, Mittagessen, ...)
            date TEXT NOT NULL,                    -- Datum im Format "JJJJ-MM-TT"
            created_at TEXT NOT NULL               -- Uhrzeit der Erstellung
        )
        """
    )

    # Tabelle 2: Einstellungen (hier speichern wir das Tagesziel)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY,                -- immer nur die Zeile mit id = 1
            daily_goal INTEGER NOT NULL,           -- persönliches Tagesziel in kcal
            goal_set INTEGER NOT NULL DEFAULT 0    -- 0 = Ziel noch nicht festgelegt, 1 = festgelegt
        )
        """
    )

    # Wenn die Datenbank von einer älteren Version des Programms angelegt
    # wurde, fehlt die Spalte "goal_set". Wir fügen sie einfach hinzu.
    # Schlägt der Befehl fehl (Spalte gibt es schon), ist das kein Fehler.
    try:
        connection.execute("ALTER TABLE settings ADD COLUMN goal_set INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # Die Spalte existiert bereits - alles gut.

    # Standardwert eintragen, falls noch keine Einstellungen gespeichert sind.
    # 2000 kcal ist nur ein technischer Standardwert - keine Empfehlung.
    # goal_set = 0 bedeutet: Der Benutzer hat sein Ziel noch NICHT selbst gewählt.
    zeile = connection.execute("SELECT COUNT(*) AS anzahl FROM settings").fetchone()
    if zeile["anzahl"] == 0:
        connection.execute(
            "INSERT INTO settings (id, daily_goal, goal_set) VALUES (1, 2000, 0)"
        )

    connection.commit()
    connection.close()


def get_daily_goal():
    """Liest das gespeicherte Tagesziel aus der Datenbank."""
    connection = get_db()
    zeile = connection.execute("SELECT daily_goal FROM settings WHERE id = 1").fetchone()
    connection.close()
    if zeile is None:
        return 2000  # Falls etwas schiefgeht: Standardwert
    return zeile["daily_goal"]


def goal_is_set():
    """Gibt True zurück, wenn der Benutzer sein Tagesziel schon festgelegt hat.

    Solange das Ziel noch nicht festgelegt wurde (goal_set = 0), zeigt
    die Startseite das Formular "Tagesziel eingeben" an.
    """
    connection = get_db()
    zeile = connection.execute("SELECT goal_set FROM settings WHERE id = 1").fetchone()
    connection.close()
    if zeile is None:
        return False
    return zeile["goal_set"] == 1


# ------------------------------------------------------------
# Hilfsfunktionen (Berechnung und Prüfung von Eingaben)
# ------------------------------------------------------------

def calculate_calories(calories_per_100g, amount_grams):
    """Berechnet die Kalorien der verzehrten Portion.

    Formel:
        Kalorien = Kalorien pro 100 g x Gramm / 100

    Beispiel: 250 kcal x 150 g / 100 = 375 kcal
    """
    return round(calories_per_100g * amount_grams / 100)


def parse_number(text):
    """Wandelt einen Text in eine Zahl um.

    Gibt None zurück, wenn die Eingabe leer oder ungültig ist.
    Damit stürzt das Programm bei schlechten Eingaben nicht ab.
    """
    if text is None:
        return None
    text = str(text).strip().replace(",", ".")  # auch "3,5" wird akzeptiert
    if text == "":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_integer(text):
    """Wandelt einen Text in eine ganze Zahl um (oder None bei Fehler)."""
    zahl = parse_number(text)
    if zahl is None:
        return None
    if zahl != int(zahl):  # keine ganzzahlige Zahl eingegeben
        return None
    return int(zahl)


def is_valid_date(text):
    """Prüft, ob ein Datum im Format JJJJ-MM-TT gültig ist."""
    if not text:
        return False
    try:
        datetime.strptime(text, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def validate_entry_form(form):
    """Prüft alle Felder des Lebensmittel-Formulars.

    Gibt ein Dictionary mit den sauberen Werten zurück.
    Enthält das Dictionary den Schlüssel "error", ist die Eingabe ungültig.
    """
    name = str(form.get("name", "")).strip()
    meal = str(form.get("meal", "")).strip()
    entry_date = str(form.get("date", "")).strip()

    calories_per_100g = parse_number(form.get("calories_per_100g"))
    amount_grams = parse_number(form.get("amount_grams"))

    # Jede Prüfung macht eine verständliche Fehlermeldung.
    if name == "":
        return {"error": "Bitte gib einen Namen für das Lebensmittel ein."}
    if len(name) > 80:
        return {"error": "Der Name darf höchstens 80 Zeichen lang sein."}
    if calories_per_100g is None:
        return {"error": "Bitte gib die Kalorien pro 100 g als Zahl ein."}
    if calories_per_100g <= 0 or calories_per_100g > 900:
        return {"error": "Kalorien pro 100 g müssen zwischen 1 und 900 liegen."}
    if amount_grams is None:
        return {"error": "Bitte gib die verzehrte Menge in Gramm ein."}
    if amount_grams <= 0 or amount_grams > 5000:
        return {"error": "Die Menge muss zwischen 1 und 5000 Gramm liegen."}
    if meal not in MEALS:
        return {"error": "Bitte wähle eine gültige Mahlzeit aus."}
    if not is_valid_date(entry_date):
        return {"error": "Das Datum ist ungültig. Format: JJJJ-MM-TT."}

    return {
        "name": name,
        "calories_per_100g": calories_per_100g,
        "amount_grams": amount_grams,
        "meal": meal,
        "date": entry_date,
        # Hier wird die Portion gleich berechnet und auf ganze Zahlen gerundet.
        "calories": calculate_calories(calories_per_100g, amount_grams),
    }


# ------------------------------------------------------------
# Routen (die "Adressen" der Webseite)
# ------------------------------------------------------------

@app.route("/")
def index():
    """Zeigt die Hauptseite an und berechnet alle Werte für das gewählte Datum."""

    # Datum aus der Adresszeile lesen (z.B. /?date=2026-10-22),
    # sonst das heutige Datum verwenden.
    selected_date = request.args.get("date", "").strip()
    if not is_valid_date(selected_date):
        selected_date = date.today().isoformat()

    connection = get_db()

    # --- Einträge für den gewählten Tag laden (SELECT) ---
    # Wir sortieren nach Mahlzeit (Frühstück zuerst) und dann nach Uhrzeit.
    rows = connection.execute(
        """
        SELECT * FROM entries
        WHERE date = ?
        ORDER BY CASE meal
                    WHEN 'Frühstück' THEN 1
                    WHEN 'Mittagessen' THEN 2
                    WHEN 'Abendessen' THEN 3
                    ELSE 4
                 END,
                 created_at
        """,
        (selected_date,),
    ).fetchall()

    entries = []
    for row in rows:
        entry = dict(row)
        entry["meal_order"] = MEAL_ORDER.get(entry["meal"], 9)
        # Anzeige der Menge ohne störende Nullen (150.0 -> 150)
        entry["amount_display"] = "{:g}".format(entry["amount_grams"])
        entry["meal_icon"] = {
            "Frühstück": "🍳",
            "Mittagessen": "🍛",
            "Abendessen": "🍽️",
            "Snack": "🍎",
        }.get(entry["meal"], "🍴")
        entry["meal_style"] = MEAL_STYLE.get(entry["meal"], "snack")
        entries.append(entry)

    # --- Tageswerte mit SQL-Aggregatfunktionen berechnen ---
    # SUM addiert alle Kalorien, COUNT zählt die Einträge.
    stats_row = connection.execute(
        "SELECT COALESCE(SUM(calories), 0) AS total, COUNT(*) AS count FROM entries WHERE date = ?",
        (selected_date,),
    ).fetchone()

    total_calories = stats_row["total"]
    entry_count = stats_row["count"]

    # Kalorien je Mahlzeit - jeweils eine eigene Abfrage mit SUM.
    calories_per_meal = {}
    for meal in MEALS:
        meal_row = connection.execute(
            "SELECT COALESCE(SUM(calories), 0) AS total FROM entries WHERE date = ? AND meal = ?",
            (selected_date, meal),
        ).fetchone()
        calories_per_meal[meal] = meal_row["total"]

    connection.close()

    # --- Werte für das Dashboard berechnen ---
    daily_goal = get_daily_goal()
    remaining = daily_goal - total_calories

    # Fortschritt in Prozent (höchstens 100 % für den Ring).
    if daily_goal > 0:
        percent = round(total_calories / daily_goal * 100)
    else:
        percent = 0
    percent_for_ring = min(percent, 100)

    # Breite der Balken für die Mahlzeiten-Vergleichsübersicht.
    max_meal = max(calories_per_meal.values()) if calories_per_meal else 0
    meal_bars = {}
    for meal in MEALS:
        if max_meal > 0:
            meal_bars[meal] = round(calories_per_meal[meal] / max_meal * 100)
        else:
            meal_bars[meal] = 0

    # --- Datum schön anzeigen und Nachbar-Tage berechnen ---
    selected_day = datetime.strptime(selected_date, "%Y-%m-%d").date()
    date_label = "{}, {}. {} {}".format(
        WEEKDAYS[selected_day.weekday()],
        selected_day.day,
        MONTHS[selected_day.month - 1],
        selected_day.year,
    )
    prev_date = (selected_day - timedelta(days=1)).isoformat()
    next_date = (selected_day + timedelta(days=1)).isoformat()
    is_today = selected_date == date.today().isoformat()

    return render_template(
        "index.html",
        entries=entries,
        selected_date=selected_date,
        date_label=date_label,
        prev_date=prev_date,
        next_date=next_date,
        is_today=is_today,
        today=date.today().isoformat(),
        goal_set=goal_is_set(),
        daily_goal=daily_goal,
        total_calories=total_calories,
        remaining=remaining,
        entry_count=entry_count,
        percent=percent,
        percent_for_ring=percent_for_ring,
        calories_per_meal=calories_per_meal,
        meal_bars=meal_bars,
        meals=MEALS,
        goal_reached=total_calories >= daily_goal,
        goal_message=(
            "Tagesziel erreicht - super gemacht!"
            if total_calories >= daily_goal
            else ("Noch {} kcal bis zu deinem Ziel.".format(remaining) if remaining > 0 else "Ziel unterschritten.")
        ),
        active_page="dashboard",
    )


@app.route("/einstellungen")
def einstellungen():
    """Zeigt die Einstellungs-Seite mit dem Formular zum Tagesziel.

    Das Tagesziel lässt sich nach der ersten Einrichtung nur noch
    HIER ändern - nicht mehr auf dem Dashboard.
    """
    selected_date = request.args.get("date", "").strip()
    if not is_valid_date(selected_date):
        selected_date = date.today().isoformat()

    return render_template(
        "einstellungen.html",
        daily_goal=get_daily_goal(),
        goal_set=goal_is_set(),
        selected_date=selected_date,
        active_page="einstellungen",
    )


@app.route("/datenbank")
def datenbank():
    """Zeigt die Erklärungsseite zum Aufbau der SQLite-Datenbank."""
    return render_template(
        "datenbank.html",
        active_page="datenbank",
    )


@app.route("/add_entry", methods=["POST"])
def add_entry():
    """Speichert einen neuen Lebensmittel-Eintrag in der Datenbank."""

    data = validate_entry_form(request.form)

    # Bei einem Fehler: Meldung zeigen und zurück zur Seite.
    if "error" in data:
        flash(data["error"], "error")
        return redirect(url_for("index", date=request.form.get("date", "")))

    connection = get_db()
    # Parametrisierte Abfrage: Die Werte stehen als ? in der Abfrage und
    # werden getrennt übergeben. Dadurch ist keine SQL-Injection möglich.
    connection.execute(
        """
        INSERT INTO entries (name, calories_per_100g, amount_grams, calories, meal, date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["name"],
            data["calories_per_100g"],
            data["amount_grams"],
            data["calories"],
            data["meal"],
            data["date"],
            datetime.now().strftime("%H:%M:%S"),
        ),
    )
    connection.commit()
    connection.close()

    flash("{} wurde hinzugefuegt ({} kcal).".format(data["name"], data["calories"]), "success")
    return redirect(url_for("index", date=data["date"]))


@app.route("/update_entry/<int:entry_id>", methods=["POST"])
def update_entry(entry_id):
    """Überarbeitet einen vorhandenen Eintrag (UPDATE)."""

    data = validate_entry_form(request.form)

    if "error" in data:
        flash(data["error"], "error")
        return redirect(url_for("index", date=request.form.get("date", "")))

    connection = get_db()
    # Prüfen, ob der Eintrag überhaupt existiert.
    existing = connection.execute(
        "SELECT id FROM entries WHERE id = ?", (entry_id,)
    ).fetchone()
    if existing is None:
        connection.close()
        flash("Dieser Eintrag wurde nicht gefunden.", "error")
        return redirect(url_for("index", date=data["date"]))

    # Kalorien werden automatisch NEU berechnet, falls Menge oder Wert geändert wurden.
    connection.execute(
        """
        UPDATE entries
        SET name = ?, calories_per_100g = ?, amount_grams = ?, calories = ?, meal = ?, date = ?
        WHERE id = ?
        """,
        (
            data["name"],
            data["calories_per_100g"],
            data["amount_grams"],
            data["calories"],
            data["meal"],
            data["date"],
            entry_id,
        ),
    )
    connection.commit()
    connection.close()

    flash("Eintrag wurde aktualisiert ({} kcal).".format(data["calories"]), "success")
    return redirect(url_for("index", date=data["date"]))


@app.route("/delete_entry/<int:entry_id>", methods=["POST"])
def delete_entry(entry_id):
    """Löscht einen Eintrag aus der Datenbank (DELETE)."""

    connection = get_db()
    connection.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    connection.commit()
    connection.close()

    flash("Eintrag wurde geloescht.", "success")
    return redirect(url_for("index", date=request.form.get("date", "")))


@app.route("/update_goal", methods=["POST"])
def update_goal():
    """Speichert ein neues persönliches Tagesziel (UPDATE)."""

    new_goal = parse_integer(request.form.get("daily_goal"))

    # Serverseitige Prüfung - auch wenn das HTML schon Regeln hat.
    if new_goal is None:
        flash("Das Tagesziel muss eine ganze Zahl sein.", "error")
    elif new_goal < 800 or new_goal > 6000:
        flash("Das Tagesziel muss zwischen 800 und 6000 kcal liegen.", "error")
    else:
        connection = get_db()
        # Ziel speichern UND markieren, dass es nun festgelegt wurde
        # (goal_set = 1). Danach erscheint das Start-Formular nicht mehr.
        connection.execute(
            "UPDATE settings SET daily_goal = ?, goal_set = 1 WHERE id = 1",
            (new_goal,),
        )
        connection.commit()
        connection.close()
        flash("Tagesziel auf {} kcal gespeichert.".format(new_goal), "success")

    # Weiterleitung zurück zur Seite, aus der das Formular kam:
    # - "start"   = Einmal-Formular auf der Startseite
    # - "settings" = dauerhaftes Formular auf der Einstellungs-Seite
    coming_from = request.form.get("from", "start")
    selected_date = request.form.get("date", "").strip()
    if not is_valid_date(selected_date):
        selected_date = date.today().isoformat()

    if coming_from == "settings":
        return redirect(url_for("einstellungen", date=selected_date))
    return redirect(url_for("index", date=selected_date))


# ------------------------------------------------------------
# Programmstart
# ------------------------------------------------------------

# Beim Start die Datenbank anlegen (falls noch nicht vorhanden).
init_database()

if __name__ == "__main__":
    # Debug-Modus nur fuer die lokale Entwicklung / Schule.
    # Fuer eine oeffentliche Adresse muss debug=False gesetzt werden.
    # Das Hosting (z.B. Render) setzt FLASK_DEBUG=0 und PORT automatisch.
    debug_mode = os.environ.get("FLASK_DEBUG", "1") == "1"
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=debug_mode, port=port)
