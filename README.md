# ERP V1 Cloud Website

## Local run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`.

## Google Login setup

1. Go to Google Cloud Console -> APIs & Services -> Credentials.
2. Create OAuth Client ID (Web Application).
3. Add Authorized Redirect URI:
   - Local: `http://127.0.0.1:8000/auth/callback`
   - Cloud: `https://YOUR-DOMAIN/auth/callback`
4. Put values in env:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `SESSION_SECRET`

## Deploy on Render (one-click style)

1. Push this repo to GitHub.
2. In Render, create new Blueprint and select this repo.
3. Render reads `render.yaml` and creates:
   - web service (`mattress-erp-v1`)
   - postgres database (`mattress-erp-db`)
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Render env.
5. Update Google redirect URI to your Render domain `/auth/callback`.

After that: open URL -> Google login -> use ERP.

## API protection

All business APIs require login session. Public endpoints:
- `/`
- `/auth/login`
- `/auth/callback`
- `/auth/logout`
- `/health`
