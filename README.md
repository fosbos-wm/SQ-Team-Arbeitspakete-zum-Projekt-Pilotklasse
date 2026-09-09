# SQ-Team-Projekt 26/27: Pilotklasse

GitHub-Pages-Web-App für die Arbeitspakete des SQ-Teams, gemeinsam bearbeitbar über Firebase.

**Enthalten:** `index.html`, `styles.css`, `app.js`, `firestore.rules`, `logo.jpg`, `README.md`

## Layout
- Desktop: 6 Karten nebeneinander
- kleinerer PC/Tablet: 4 bzw. 2 Spalten
- Smartphone: genau 1 Spalte
- Padlet-ähnliche Kartenansicht mit Ansichts- und Bearbeitungsmodus

## Funktionen
- Arbeitspakete ansehen (Lesemodus) und über „Bearbeiten“ ändern
- Neue Arbeitspakete über die „+ Neues Arbeitspaket“-Kachel anlegen
- Arbeitspakete löschen
- Änderungen werden über eine gemeinsame Firebase-Datenbank live mit allen Nutzern synchronisiert

## Ampel
🟢 Auf Kurs · 🟡 Klärungsbedarf · 🔴 Handlungsbedarf

## Einrichtung (einmalig)
1. In der [Firebase-Konsole](https://console.firebase.google.com) ein Projekt anlegen (oder ein bestehendes nutzen).
2. **Authentication** aktivieren → Sign-in-Methode „Anonym“ einschalten.
3. **Firestore Database** anlegen (Produktionsmodus reicht, die Regeln steuern den Zugriff).
4. Unter Projekteinstellungen → „Web-App hinzufügen“ die Konfigurationsdaten kopieren und in `app.js` im Objekt `firebaseConfig` eintragen.
5. In `app.js` die Konstante `TEAM_PIN` auf die gewünschte Team-PIN setzen.
6. `firestore.rules` in der Firebase-Konsole unter Firestore → Regeln einfügen und veröffentlichen.
7. Beim ersten Öffnen der App (leere Datenbank) werden automatisch die zwölf Standard-Arbeitspakete angelegt.

## Zugriffsschutz
Die App fragt beim Start eine Team-PIN ab (clientseitig geprüft) und meldet sich danach anonym bei Firebase an. Die Firestore-Regeln lassen Lesen/Schreiben nur für angemeldete Nutzer zu. Das schützt vor gelegentlichen Besuchern, ist aber keine harte Sicherheitsgrenze gegenüber technisch versierten Personen. Für echte Einzel-Logins pro Lehrkraft wäre ein vollständiges Firebase-Login (wie in der CampusKlasse-App) nötig.

## GitHub Pages
Dateien direkt ins Repository-Hauptverzeichnis hochladen → Settings → Pages → Deploy from a branch → `main` + `/ (root)` → Save.
