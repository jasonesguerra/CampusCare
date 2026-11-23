# CampusCare

University of the Assumption facility and equipment maintenance management system. This initial implementation follows the project brief's goal: a locally runnable frontend and backend, multiple working UI sections, data models, API routes, and a live frontend-to-backend interaction for demonstration.

## Technology

- Frontend: React 18, Vite, JavaScript
- Backend: Node.js and Express
- Persistence: PostgreSQL with local JSON store fallback
- Icons: Lucide

The PostgreSQL adapter currently stores the application state in a JSONB row to preserve the existing API and data model during setup. The JSON file remains the fallback when PostgreSQL is not configured.

## Run locally

Requirements: Node.js 18 or newer and npm.

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173`. The Express API runs at `http://localhost:4000`; Vite proxies `/api` requests to it. Check `http://localhost:4000/api/health` to confirm the backend is available.

Useful commands:

```powershell
npm test
npm run build
npm start
```

`npm start` starts the API only. Use `npm run dev` for the integrated frontend and backend demonstration.

## Local PostgreSQL

Install PostgreSQL and start its Windows service. The local setup command creates a random `postgres` password and writes connection settings to `.env`; keep this file private.

```powershell
npm run db:configure
npm run db:create
npm run db:migrate
npm run dev
```

The migration seeds PostgreSQL from `backend/data/store.json`. The API automatically uses PostgreSQL when `DATABASE_URL` is set in `.env`; otherwise, it uses the JSON store. Setup and test commands load `.env` only where needed.

## Implemented sections

- Overview: live work-order and equipment counts, recent requests, priority attention, and facility status.
- Work orders: search, status and priority filters, create a request with facility, floor (1–3), and room (01–08), and update a request's status.
- Staff workspace: see assigned work and open unassigned requests, accept available requests, and update assigned work status.
- Request details: open any request row to view its full details and attached equipment photos.
- Student requests: attach up to 3 PNG, JPEG, or WebP photos (3 MB each) when reporting an issue.
- Accounts: students can register from the sign-in screen; only administrators can create maintenance staff accounts from the Accounts section.
- Manage account: every signed-in user can change their name and password; email and account type are read-only.
- Facilities: campus building directory and open-order counts.
- Equipment: asset register, condition, location, and next service date.
- Maintenance team: on-duty technicians and active assignment counts.
- Parts inventory: quantity on hand and reorder thresholds.

The UA logo supplied with the project is displayed in the application sidebar. Demo records are preloaded and new work orders and status changes persist in `backend/data/store.json`.
Image attachments are stored as data URLs in the same JSON file for this local demo; larger deployments should move uploads to managed file storage.

## Demo accounts

The sign-in screen keeps the seeded demo accounts for testing. Students can also create their own account from the sign-in screen. Administrators can create additional maintenance staff accounts from the Accounts section.

| Account | Email | Password |
| --- | --- | --- |
| Administrator | `admin@campuscare.test` | `Admin123!` |
| Student | `student@campuscare.test` | `Student123!` |
| Maintenance staff | `staff@campuscare.test` | `Staff123!` |

Administrators can access all management sections. Students can submit and track their own requests. Maintenance staff can view work assigned to them and update its status. New accounts are saved in the local JSON store with scrypt password hashes; sessions remain in memory. These seeded credentials and the local authentication flow are for the class prototype only, not production deployment.

## API routes

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register` (student registration)
- `POST /api/auth/logout`
- `GET /api/account`
- `PATCH /api/account` (updates the signed-in user's name and/or password)
- `GET /api/users` (administrator only)
- `POST /api/users/staff` (administrator only)
- `GET /api/overview`
- `GET /api/work-orders`
- `POST /api/work-orders`
- `POST /api/work-orders/:id/accept`
- `PATCH /api/work-orders/:id`
- `GET /api/facilities`
- `GET /api/equipment`
- `GET /api/staff`
- `GET /api/inventory`

## Project structure

```text
backend/
  data/store.json      Seed data and local persistence
  server.js            Express API and application factory
  server.test.js       API tests
  store.js             JSON store adapter
  postgres-store.js    PostgreSQL JSONB store adapter
frontend/
  public/ua-logo.png   University logo
  src/App.jsx          Login, role portals, dashboard, and management views
  src/main.jsx         React entry point
  src/styles.css       Responsive interface styles
  index.html           Vite document
```

## Suggested next steps

- Replace seeded demo accounts with managed users and durable authentication before real deployment.
- Move uploaded images from JSONB data URLs to object storage before production traffic grows.
- Add assignment controls, preventive-maintenance schedules, attachments, and work-order history.
- Replace sample campus records with verified facility, asset, staff, and inventory data.