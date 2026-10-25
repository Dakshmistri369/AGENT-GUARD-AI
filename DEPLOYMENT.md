# Deploying AgentGuard AI (Render + Vercel)

This guide walks you through deploying **AgentGuard AI** into production:
- **Backend API**: Hosted on [Render](https://render.com) (FastAPI + Python)
- **Frontend UI**: Hosted on [Vercel](https://vercel.com) (Vite + React + TypeScript)

---

## Part 1: Deploy Backend to Render

### Option A: 1-Click Render Blueprint (Recommended)
The repository includes a ready-to-use [`render.yaml`](./render.yaml).

1. Log in to [dashboard.render.com](https://dashboard.render.com/).
2. Click **New +** → **Blueprint**.
3. Select your repository: `Dakshmistri369/AGENT-GUARD-AI`.
4. Render will read `render.yaml` and configure:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2`
   - **Health Check**: `/health`
5. Click **Apply**.
6. Once deployed, copy your Render service URL (e.g., `https://agentguard-backend-xxxx.onrender.com`).

---

### Option B: Manual Web Service Setup on Render
1. Log in to [Render](https://dashboard.render.com/).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository: `https://github.com/Dakshmistri369/AGENT-GUARD-AI.git`.
4. Configure the service settings:
   - **Name**: `agentguard-backend`
   - **Region**: Any (e.g. `Oregon (US West)` or `Frankfurt`)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2`
   - **Instance Type**: `Free`
5. Under **Advanced** → **Environment Variables**, add:
   | Key | Value | Notes |
   |---|---|---|
   | `PYTHON_VERSION` | `3.11.9` | Ensures modern Python runtime |
   | `ENVIRONMENT` | `production` | Production mode |
   | `AGENTGUARD_ALLOW_MOCK_IN_PRODUCTION` | `1` | Allows running with zero API keys |
   | `FRONTEND_ORIGIN` | `https://*.vercel.app,http://localhost:5173` | Or your exact Vercel app URL |
   | `JWT_SECRET` | *(Generate a random 32+ character string)* | Session security |
   | `AI_PROVIDER` | `mock` *(or `nemotron`)* | Set `nemotron` if using NVIDIA key |
   | `NVIDIA_API_KEY` | *(Optional nvapi-...)* | Optional: for Nemotron 70B analysis |
6. Under **Advanced** → **Health Check Path**, enter: `/health`.
7. Click **Create Web Service**.
8. Copy your live backend URL once active:
   `https://<your-backend-name>.onrender.com`

---

## Part 2: Deploy Frontend to Vercel

1. Log in to [vercel.com](https://vercel.com/).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository: `Dakshmistri369/AGENT-GUARD-AI`.
4. In the **Configure Project** screen:
   - **Project Name**: `agentguard-ai` (or your choice)
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `frontend` (or leave as default `./` since root `vercel.json` is configured).
5. Expand **Environment Variables** and add:
   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<your-backend-name>.onrender.com` |
   *(Replace with your actual Render URL from Part 1, without a trailing slash)*
6. Click **Deploy**.
7. Vercel will install dependencies, build the Vite app, and deploy it to a URL like:
   `https://agentguard-ai.vercel.app`

---

## Part 3: Verify the Connection

1. Open your backend health check in your browser:
   `https://<your-backend-name>.onrender.com/health`
   You should see:
   ```json
   {
     "status": "healthy",
     "version": "0.1.0",
     "environment": "production",
     "database": { "status": "ok", "type": "postgresql", "latency_ms": 1.2 },
     "ai_provider": { "mode": "nemotron", "mock_active": false }
   }
   ```
2. Open your Vercel URL in your browser:
   `https://<your-frontend-name>.vercel.app`
3. In **Repositories**, connect any GitHub repo (e.g. `https://github.com/octocat/Hello-World`) and click **Analyze Repository** to run security scanning and inspect **Exact Solutions**!
