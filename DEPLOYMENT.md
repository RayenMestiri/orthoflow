# OrthoFlow Production Deployment Guide

This guide provides step-by-step instructions for deploying the **OrthoFlow** SaaS platform to production using **GitHub**, **Vercel** (Frontend), **Render** (Backend API), **MongoDB Atlas** (Database), and **Cloudinary** (Clinical Media Storage).

---

## Architecture Overview

```text
       Users / Browsers
              │
       ┌──────┴──────┐
       ▼             ▼
┌──────────────┐   ┌────────────────────────┐
│    Vercel    │   │         Render         │
│  (Angular)   │──▶│      (Fastify API)     │
└──────────────┘   └───────────┬────────────┘
                     │         │
                     ▼         ▼
             ┌─────────────┐ ┌──────────────┐
             │MongoDB Atlas│ │  Cloudinary  │
             │(Replica Set)│ │(Media Storage│
             └─────────────┘ └──────────────┘
```

* **Vercel**: Edge-distributed Angular 22 Single Page Application with SPA routing rewrites.
* **Render**: Managed Node.js Web Service running Fastify v5 with rate-limiting, liveness/readiness probes, and graceful shutdown.
* **MongoDB Atlas**: Fully managed replica set supporting ACID multi-document transactions.
* **Cloudinary**: Authenticated media storage for patient clinical photography and signed PDF documents.

---

## Phase 1: GitHub Repository Setup

1. **Create Repository**:
   Create a private repository on GitHub named `orthoflow` (or your preferred organization name).
2. **Push Local Code**:
   ```bash
   git remote add origin https://github.com/<your-org>/orthoflow.git
   git branch -M master
   git push -u origin master
   ```
3. **Branch Protection**:
   In GitHub repository settings under **Branches** $\rightarrow$ **Add branch protection rule**:
   * Branch name pattern: `master`
   * Check: **Require status checks to pass before merging**
   * Select: `Quality Gates / backend` and `Quality Gates / frontend` (from `.github/workflows/ci.yml`).

---

## Phase 2: MongoDB Atlas Configuration

OrthoFlow requires a MongoDB replica set (all Atlas clusters provide this) to support transactions for billing and clinical records.

1. **Create Database Cluster**:
   * In [MongoDB Atlas](https://cloud.mongodb.com/), create a cluster (Shared M0 or Dedicated M10+).
   * Choose the region matching your Render service (e.g. Frankfurt / `europe-west1` or `europe-central2`).
2. **Create Database User**:
   * Under **Security** $\rightarrow$ **Database Access** $\rightarrow$ **Add New Database User**.
   * Authentication Method: `Password`.
   * Username: `orthoflow_app`.
   * Built-in Role: `Read and write to any database` (or custom role scoped to `orthoflow` database).
3. **Configure Network Access**:
   * Under **Security** $\rightarrow$ **Network Access** $\rightarrow$ **Add IP Address**.
   * Since Render uses dynamic IP addresses, add `0.0.0.0/0` (Allow access from anywhere).
   * Security is enforced via database user credentials and TLS encryption.
4. **Obtain Connection String**:
   * Click **Connect** $\rightarrow$ **Drivers** (Node.js).
   * Format:
     ```text
     mongodb+srv://orthoflow_app:<PASSWORD>@<cluster-domain>/orthoflow?retryWrites=true&w=majority
     ```
5. **Sync Indexes**:
   After the database is reachable, apply production schema indexes:
   ```bash
   cd backend
   npm run db:indexes:apply
   ```

---

## Phase 3: Cloudinary Configuration

1. **Sign Up / Log In**:
   Access the [Cloudinary Console](https://console.cloudinary.com/).
2. **Retrieve API Credentials**:
   From Dashboard $\rightarrow$ **Product Environment Settings** $\rightarrow$ **API Keys**:
   * `Cloud Name`: e.g. `orthoflow-cloud`
   * `API Key`: e.g. `123456789012345`
   * `API Secret`: e.g. `aBcDeFgHiJkLmNoPqRsTuVwXyZ`
3. **Configure Upload Folder**:
   Default root folder is `orthoflow`. Cloudinary will automatically segment assets into:
   * `orthoflow/clinics/<clinicId>/patients/<patientId>/...`

---

## Phase 4: Render Backend Deployment

You can deploy using either the Blueprint (`render.yaml`) or manually via the Render UI.

### Option A: Via Blueprint (Recommended)
1. In Render Dashboard, click **New** $\rightarrow$ **Blueprint**.
2. Connect your GitHub repository. Render reads [render.yaml](file:///c:/Users/LEGION/OneDrive/Documents/ChatGPT/denstiste/render.yaml) automatically.
3. Fill in the secret environment variables prompted by the blueprint.

### Option B: Manual Web Service Setup
1. Click **New** $\rightarrow$ **Web Service**.
2. Select your repository.
3. Configure settings:
   * **Name**: `orthoflow-api`
   * **Root Directory**: `backend`
   * **Environment**: `Node`
   * **Region**: `Frankfurt (EU Central)`
   * **Branch**: `master`
   * **Build Command**: `npm ci && npm run build`
   * **Start Command**: `npm start`
   * **Health Check Path**: `/health`
4. Add Environment Variables (see Environment Reference table below).
5. Click **Deploy Web Service**.
6. Once deployed, copy your Render service URL:
   ```text
   https://orthoflow-api.onrender.com
   ```

---

## Phase 5: Vercel Frontend Deployment

1. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New...** $\rightarrow$ **Project**.
2. Import your GitHub repository.
3. Configure project settings:
   * **Framework Preset**: `Other` (or `Angular`)
   * **Root Directory**: Click **Edit** and choose `frontend`.
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist/frontend/browser`
4. Routing and Headers are automatically handled by [frontend/vercel.json](file:///c:/Users/LEGION/OneDrive/Documents/ChatGPT/denstiste/frontend/vercel.json).
5. Environment Variables:
   * None are strictly required at build-time if using the relative `/api/v1` path (or set `API_BASE_URL` if you prefer direct API URLs).
6. Click **Deploy**.
7. Once deployed, note your Vercel URL:
   ```text
   https://orthoflow.vercel.app
   ```

---

## Phase 6: Cross-Linking Origins & CORS

1. In the Render Dashboard for `orthoflow-api`:
   * Set `FRONTEND_URL` = `https://orthoflow.vercel.app` (must start with `https://`).
   * If you have custom domains, set `CORS_ADDITIONAL_ORIGINS` = `https://app.orthoflow.clinic`.
2. Trigger a manual re-deploy on Render so the new CORS and cookie policies take effect.

---

## Environment Variables Reference

| Variable | Platform | Required | Secret | Purpose & Production Notes |
| :--- | :--- | :---: | :---: | :--- |
| `NODE_ENV` | Render | Yes | No | Set to `production`. |
| `PORT` | Render | Yes | No | Set to `10000` (Render default). |
| `HOST` | Render | Yes | No | Set to `0.0.0.0`. |
| `TRUST_PROXY_HOPS` | Render | Yes | No | Set to `1` (Render's reverse proxy hop). |
| `API_REPLICA_COUNT` | Render | Yes | No | Set to `1` (in-process rate limit store). |
| `MONGODB_URI` | Render | Yes | **Yes** | Atlas connection URI (`mongodb+srv://...`). |
| `MONGODB_DB_NAME` | Render | Yes | No | `orthoflow` |
| `MONGODB_TRANSACTIONS_ENABLED` | Render | Yes | No | Set to `true` (Atlas replica set). |
| `JWT_ACCESS_SECRET` | Render | Yes | **Yes** | $\ge 32$ chars random string. |
| `JWT_REFRESH_SECRET` | Render | Yes | **Yes** | $\ge 32$ chars distinct from access secret. |
| `PORTAL_JWT_ACCESS_SECRET` | Render | Yes | **Yes** | $\ge 32$ chars patient portal access key. |
| `PORTAL_JWT_REFRESH_SECRET` | Render | Yes | **Yes** | $\ge 32$ chars patient portal refresh key. |
| `CLOUDINARY_CLOUD_NAME` | Render | Yes | No | Cloudinary environment name. |
| `CLOUDINARY_API_KEY` | Render | Yes | **Yes** | Cloudinary public API key. |
| `CLOUDINARY_API_SECRET` | Render | Yes | **Yes** | Cloudinary secret API key. |
| `CLOUDINARY_UPLOAD_FOLDER` | Render | Yes | No | Root folder: `orthoflow`. |
| `FRONTEND_URL` | Render | Yes | No | Deployed Vercel URL (e.g. `https://orthoflow.vercel.app`). |
| `CORS_ADDITIONAL_ORIGINS` | Render | No | No | Comma-separated additional allowed HTTPS origins. |
| `SMTP_HOST` | Render | Yes | No | Transactional SMTP host (e.g. `smtp.sendgrid.net`). |
| `SMTP_PORT` | Render | Yes | No | `587` (or `465` with `SMTP_SECURE=true`). |
| `SMTP_SECURE` | Render | Yes | No | `false` for port 587, `true` for 465. |
| `SMTP_USER` | Render | Yes | **Yes** | SMTP account username. |
| `SMTP_PASS` | Render | Yes | **Yes** | SMTP account password / API key. |
| `SMTP_FROM_ADDRESS` | Render | Yes | No | Verified sender address (`noreply@orthoflow.clinic`). |
| `SMTP_FROM_NAME` | Render | Yes | No | `OrthoFlow` |
| `AUTH_CODE_SECRET` | Render | Yes | **Yes** | $\ge 32$ chars pepper for 6-digit challenge codes. |
| `COMMUNICATION_PAYLOAD_SECRET` | Render | Yes | **Yes** | $\ge 32$ chars encryption key for queued payloads. |

> [!TIP]
> Generate secure secrets using Node.js crypto:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
> ```

---

## Phase 7: Post-Deployment Smoke Test Checklist

Once both services are running:

- [ ] **Liveness Probe**:
  `curl -i https://orthoflow-api.onrender.com/health` $\rightarrow$ Expect `HTTP 200` with `{"status":"ok"}`.
- [ ] **Readiness Probe**:
  `curl -i https://orthoflow-api.onrender.com/health/ready` $\rightarrow$ Expect `HTTP 200` with `{"status":"ok","checks":{"database":{"reachable":true}}}`.
- [ ] **SPA Direct Refresh**:
  Navigate to `https://orthoflow.vercel.app/login` and press `F5` / Refresh $\rightarrow$ Page reloads cleanly without 404.
- [ ] **Clinic Registration**:
  Create a new clinic owner account at `/register` $\rightarrow$ Verify verification email code arrives via SMTP and dashboard loads.
- [ ] **Patient Management**:
  Create a patient record, upload an avatar/document $\rightarrow$ Verify asset reaches Cloudinary without base64 bloat in MongoDB.
- [ ] **Appointment Scheduling**:
  Create and reschedule an appointment on the calendar $\rightarrow$ Verify collision avoidance and real-time state updates.
- [ ] **Financial Records & Receipts**:
  Record a payment and download the generated PDF receipt $\rightarrow$ Verify PDF renders and downloads securely.
