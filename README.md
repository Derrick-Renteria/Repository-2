# Ninja Competition Tools

| Folder | What it is |
|---|---|
| [`app/`](app/) | **Ninja Competition Manager**, the web app. Live schedule, drag-and-drop flights, "running late" shift, change log with undo, public link with QR code, print and TV views. **Setup: [SETUP.md](SETUP.md)** |
| [`apps-script/`](apps-script/) | The earlier Google Sheets version (Apps Script). See [`apps-script/README-sheets.md`](apps-script/README-sheets.md). |

## Developing the app
```bash
cd app
npm install
npm run dev      # http://localhost:5173 (saves on this device until Supabase is configured in .env)
npm test         # importer tests; set SHEET_CSV=/path/to/sheet.csv to also test against a real sheet
npm run build
```
