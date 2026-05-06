# TalentEye

Full-stack web app for **football performance analysis**: players upload match or training footage, a computer-vision pipeline estimates movement and ball-control metrics, and **scouts** can browse a directory, shortlist players, compare metrics, and export reports.

This repository contains the **Angular** client. The **Django REST** API and AI engine live in a separate backend project (see [Repository layout](#repository-layout)).

---

## Features

- **Players:** profile, video upload, processing status, personal dashboard, and per-video / aggregate metrics.
- **Scouts:** player directory, player detail (videos, metrics, notes), shortlist, side-by-side compare, CSV exports.
- **Auth:** JWT (Simple JWT) with role-aware routes (player vs scout).
- **Analysis:** backend integrates an AI engine (OpenCV, MediaPipe pose, YOLO ball tracking) and persists structured metrics per completed video.

---

## Repository layout

Typical local layout when both projects sit under one parent folder:

```text
NextGen/
├── backend/talenteye/              # Django API + Celery + ai_engine
└── frontend-angular/
    └── talenteye-frontend/         # This Angular app (clone root may be here)
```

If you keep backend and frontend in **two GitHub repos**, use the same README content in each and adjust clone URLs accordingly.

---

## Tech stack

| Layer | Technology |
|--------|------------|
| Frontend | Angular 21, Bootstrap 5, Chart.js, ngx-toastr |
| Mobile shell | **Ionic Capacitor** (Android project in `/android`) |
| Backend | Django 6, Django REST Framework, Simple JWT |
| Async jobs | Celery (broker: Redis by default) |
| Database | SQLite (development; swap for Postgres/MySQL in production) |
| Vision / ML | OpenCV, MediaPipe, Ultralytics YOLO (see backend `ai_engine`) |

---

## Prerequisites

- **Node.js** 20+ and **npm** (see `package.json` for package manager hint).
- **Python** 3.12+ recommended for the backend.
- **Redis** — required if you run **Celery** workers for video processing (default broker `redis://localhost:6379/0`).
- Optional: **CUDA** / GPU drivers if you tune the vision stack for performance.

---

## Backend (`talenteye`)

### Setup

```bash
cd backend/talenteye
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate

pip install -r requirements.txt
```

The AI engine also expects packages such as **Ultralytics** (YOLO) alongside OpenCV/MediaPipe; if imports fail at runtime, install missing deps into the same virtualenv (e.g. `pip install ultralytics`).

### Database and admin

```bash
python manage.py migrate
python manage.py createsuperuser   # optional
```

### Run the API (development)

```bash
python manage.py runserver
```

- API base: `http://127.0.0.1:8000/api/`
- Media (uploads / results): `http://127.0.0.1:8000/media/` (with `DEBUG=True` and static media routes)
- CORS is configured for `http://localhost:4200` and `http://127.0.0.1:4200`

### Celery (video processing)

With Redis running locally:

```bash
# from backend/talenteye, venv active
celery -A talenteye worker -l info
```

Override the broker with `CELERY_BROKER_URL` if needed.

### Environment / security (production)

- Change `SECRET_KEY`, set `DEBUG=False`, restrict `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`.
- Use a production database and static/media storage (S3, etc.) as appropriate.
- Never commit real secrets; use environment variables or a secrets manager.

---

## Frontend (`talenteye-frontend`)

### Setup

```bash
cd frontend-angular/talenteye-frontend
npm install
```

### Configuration

Edit `src/environments/environment.ts` (and `environment.prod.ts` if you add it) so that:

- `apiUrl` — REST API base, e.g. `http://127.0.0.1:8000/api`
- `mediaOrigin` — origin used to resolve `/media/...` URLs, e.g. `http://127.0.0.1:8000`

### Run (development)

```bash
npm start
# or: npx ng serve
```

App URL: `http://localhost:4200`

### Production build

```bash
npm run build
```

Output under `dist/` — deploy behind HTTPS and point environments at your production API.

---

## Mobile app (Ionic Capacitor + Android)

The Angular UI is wrapped with **[Capacitor](https://capacitorjs.com/)** (the native runtime used by Ionic) so you can run the same web app inside an **Android emulator or device** without rewriting the UI.

### Prerequisites

- **Android Studio** with Android SDK + an emulator image (or a USB‑debugged phone).
- **Backend running on your PC** — Django `runserver` on `0.0.0.0:8000` so the emulator can reach it (see below).

### API URL on emulator

`src/environments/environment.mobile.ts` points to **`http://10.0.2.2:8000`** — on the Android emulator, `10.0.2.2` is an alias for your host machine’s `127.0.0.1`. Build with:

```bash
npm run build:mobile
```

Start Django bound to all interfaces (so the emulator can connect):

```bash
python manage.py runserver 0.0.0.0:8000
```

For a **physical phone** on Wi‑Fi, change `apiUrl` / `mediaOrigin` in `environment.mobile.ts` to your PC’s LAN IP (e.g. `http://192.168.1.50:8000`).

### Sync and open in Android Studio

```bash
npm run build:mobile
npx cap sync android
npx cap open android
```

Then run the **app** configuration on your emulator from Android Studio.

Shortcut:

```bash
npm run mobile:android
```

(`build:mobile` → `cap sync` → open Android Studio.)

### Notes

- **HTTP / cleartext:** `android:usesCleartextTraffic="true"` is enabled for **development** so `http://10.0.2.2:8000` works. Use **HTTPS** in production and remove or tighten this.
- **CORS:** Backend `settings.py` includes common Capacitor WebView origins. If you still see CORS errors, temporarily narrow/widen origins while debugging.
- **`ionic.config.json`** is present so tooling recognizes this as an Ionic/Capacitor-style workspace; the UI remains plain Angular + Bootstrap (no `@ionic/angular` pages).

---

## How the pieces connect

1. User logs in via `POST /api/accounts/…` (JWT).
2. Player uploads video → Django stores file and queues processing (Celery).
3. Worker runs `ai_engine`, writes metrics and optional annotated video / JSON.
4. Angular calls `/api/videos/`, `/api/metrics/`, `/api/player/`, `/api/scouts/`, etc., using `Authorization: Bearer <access_token>`.

---

## Main API groups (reference)

| Prefix | Purpose |
|--------|---------|
| `/api/accounts/` | Auth, profile |
| `/api/player/` | Player profile & performance |
| `/api/drills/` | Drill catalog |
| `/api/videos/` | Upload, list, status |
| `/api/metrics/` | Per-video metric rows |
| `/api/scouts/` | Scout directory, shortlist, exports |

Exact routes are defined in each app’s `urls.py` under `backend/talenteye`.

---

## Troubleshooting

- **CORS errors** — Ensure the Angular origin matches `CORS_ALLOWED_ORIGINS` in Django settings.
- **Mobile app cannot reach API** — Use `npm run build:mobile`, confirm Django listens on `0.0.0.0:8000`, and that `environment.mobile.ts` uses `10.0.2.2` for the emulator or your LAN IP for a device.
- **Videos stuck “processing”** — Start Redis and a Celery worker; check worker logs.
- **Broken video thumbnails / clips in the UI** — Set `mediaOrigin` to match the Django host serving `MEDIA_URL`.
- **Import errors in `ai_engine`** — Install missing Python deps in the backend venv; GPU/CUDA is optional.

---

## License

Specify your license here (e.g. MIT, proprietary).

---

## Contributing

Add contribution guidelines (branching, tests, `ng lint` / `python manage.py test`) if this repo is collaborative.
