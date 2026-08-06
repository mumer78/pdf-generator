# TilTop Roofers — Roof Inspection System

A full-stack web app for building the "Roof Inspection" report exactly like
the TilTop Roofers PDF template: fixed logo/header, a Site Inspected section,
a Summary of Inspection section, and any number of 1‑image or 2‑image pages
(each with an image editor — crop, circle-annotate damage, undo/redo, erase,
reset — and an Issue/Concern text block). Finished reports are exported as a
PDF, saved to your account/history, and given a 5‑digit share key that
another logged-in user can enter (under "View Others") to open, continue
editing, and re-save the same report.

## Stack
- **Backend:** Django + Django REST Framework + SimpleJWT (auth) + Pillow +
  ReportLab (PDF generation). SQLite by default (zero setup).
- **Frontend:** React (Create React App) + React Router + Axios +
  react-image-crop.

## Project layout
```
roof_inspection_system/
  backend/            Django project ("roofproject") + the "inspections" app
  frontend/           React app
```

## 1. Backend setup
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/

python manage.py runserver
```
The API runs at `http://localhost:8000/`. Media (uploaded photos) is served
from `http://localhost:8000/media/...` while `DEBUG=True`.

## 2. Frontend setup
In a second terminal:
```bash
cd frontend
npm install
npm start
```
The app runs at `http://localhost:3000/` and proxies API calls to
`http://localhost:8000` (see the `"proxy"` field in `package.json`).

## 3. Using it
1. Go to `http://localhost:3000/register` and create an account.
2. **My History** — click **+ New Inspection** to start a new report. A
   5‑digit **Share Key** is generated immediately and shown at the top of
   the editor.
3. Fill in **Site Inspected** (Address, Reason for Inspection, Inspector,
   Date of Inspection) and **Summary of Inspection** — these are fixed
   labels matching the PDF template.
4. Click **+ Add 1-Image Page** or **+ Add 2-Image Page** to add report
   pages. Upload a photo into a slot — the editor pops up:
   - **Step 1 – Crop**: drag the fixed-aspect crop box (or "Use Full Image").
   - **Step 2 – Mark Damage**: draw red circles around damage (adjustable
     line **thickness**), **Erase** a circle, **Undo/Redo**, **Reset** all
     marks, or go back and **Re-crop**. Click **Save Image** to store it.
   - Click **Edit Photo** again any time to reopen the same image with all
     crop/circle history intact and keep adjusting it.
5. Fill in the **Issue/Concern** text under each photo/pair of photos.
6. **Save Draft** to save progress, or **Save & View PDF** to save
   everything and open the generated PDF (matching the TilTop template) in
   a new tab.
7. **View Others**: any logged-in user can enter someone's 5‑digit key to
   open that exact report, keep editing it (including the photo edits), and
   save — changes are written back to the **original owner's** saved
   report (ownership never changes hands).

## Notes / things to know
- The header/logo banner (`frontend/public/assets/header.png` and
  `backend/static/assets/header.png`) is the fixed graphic used at the top
  of every report, in the app and in the exported PDF, so it's always
  pixel-identical to the TilTop template.
- Each uploaded photo is cropped to a fixed aspect ratio (16:10) before
  annotation so every inserted photo keeps the same frame size in the PDF,
  as requested.
- Circle marks, crop selection, and the flattened "damage-marked" image are
  all stored per photo (`crop_data`, `shapes`, `rendered_image`,
  `original_image`), so reopening the editor later restores the exact
  state and lets you keep editing non-destructively.
- Auth uses JWT access/refresh tokens stored in `localStorage`.
- For production you'd want to: move `SECRET_KEY` to an environment
  variable, set `DEBUG=False`, configure a real database, and serve media
  from proper storage (S3, etc.) — this build is set up for local/dev use.
