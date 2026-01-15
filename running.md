# Running the Floor Plan Diversity Analyzer

This document covers running the application locally and deploying to production.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ (20 recommended) | Frontend runtime |
| npm | Latest | Package manager |
| Gemini API Key | - | From [Google AI Studio](https://aistudio.google.com/app/apikey) |

---

## Running Locally

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create environment file with your Gemini API key
echo GEMINI_API_KEY=your_api_key_here > .env

# Start the backend server
uvicorn main:app --host 0.0.0.0 --port 8000
```

The backend will be available at: **http://localhost:8000**

- API Documentation: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

### 2. Frontend Setup

Open a new terminal window:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at: **http://localhost:3000**

### 3. Verify Everything Works

1. Open http://localhost:3000 in your browser
2. The frontend should connect to the backend automatically (localhost:8000)
3. Try generating some floor plans or uploading images

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Your Google AI Studio API key for Gemini 2.0 Flash |

Example `backend/.env`:
```bash
GEMINI_API_KEY=AIzaSy...your_key_here
```

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Production only | Backend API URL (not needed for local dev) |

For local development, the frontend defaults to `http://localhost:8000`.

For production, create `frontend/.env.local`:
```bash
NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
```

---

## Deployment to Render

The project includes a `render.yaml` Blueprint for easy deployment to [Render](https://render.com).

### Deployment Steps

1. **Fork/Push** the repository to GitHub

2. **Create Blueprint** on Render:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Select the repo containing `render.yaml`

3. **Configure Environment Variables** in Render Dashboard:

   **Backend Service** (`drafted-diversity-api`):
   - `GEMINI_API_KEY`: Your Google AI Studio API key

   **Frontend Service** (`drafted-diversity-frontend`):
   - `NEXT_PUBLIC_API_URL`: Your backend URL (e.g., `https://drafted-diversity-api.onrender.com`)

4. **Deploy**: Render will automatically build and deploy both services

### Services Created

| Service | Type | Runtime | Description |
|---------|------|---------|-------------|
| `drafted-diversity-api` | Web Service | Python 3.11 | FastAPI backend |
| `drafted-diversity-frontend` | Web Service | Node.js 20 | Next.js frontend |

### Render Configuration Details

The `render.yaml` configures:

- **Backend**:
  - Build: `pip install -r requirements.txt`
  - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
  - Health check: `/health`
  - Auto-deploy on push: Yes

- **Frontend**:
  - Build: `npm install && npm run build`
  - Start: `npm start`
  - Health check: `/`
  - Auto-deploy on push: Yes

---

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://drafted.site |
| Backend API | https://drafted-diversity-api.onrender.com |
| API Docs | https://drafted-diversity-api.onrender.com/docs |

---

## Troubleshooting

### Backend won't start
- Ensure Python 3.11+ is installed: `python --version`
- Verify virtual environment is activated
- Check that `.env` file exists with valid `GEMINI_API_KEY`

### Frontend can't connect to backend
- Verify backend is running on port 8000
- Check CORS settings in `backend/main.py` include your frontend origin
- For production, ensure `NEXT_PUBLIC_API_URL` is set correctly

### Gemini API errors
- Verify your API key is valid and has quota remaining
- Check [Google AI Studio](https://aistudio.google.com) for rate limits
- The system includes synthetic fallback if Gemini fails

### Render deployment issues
- Ensure `GEMINI_API_KEY` is set in the backend service environment
- Ensure `NEXT_PUBLIC_API_URL` is set in the frontend service environment
- Check Render logs for build/runtime errors

---

## Quick Reference Commands

```bash
# Start backend (from backend/)
uvicorn main:app --host 0.0.0.0 --port 8000

# Start backend with auto-reload (development)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Start frontend dev server (from frontend/)
npm run dev

# Build frontend for production (from frontend/)
npm run build

# Start frontend production server (from frontend/)
npm start

# Run frontend linting (from frontend/)
npm run lint
```


