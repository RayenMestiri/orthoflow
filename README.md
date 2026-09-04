# 🦷 OrthoFlow

### Modern Orthodontic Practice Management, Built for Real Clinical Workflows

**OrthoFlow** is a modern cloud-based orthodontic practice management platform designed to help orthodontists and clinic staff manage the complete patient journey — from the first appointment to treatment follow-up, payments, clinical documents, and daily reception operations.

The project focuses on one core idea:

> **Clinic software should help the team run the clinic — not create more administrative work.**

OrthoFlow combines a premium 2026 SaaS experience with practical workflows built around the real operations of an orthodontic clinic.

---

## ✨ Product Vision

Traditional clinic-management applications often separate patients, appointments, treatments, payments, and documents into disconnected administrative screens.

OrthoFlow approaches the problem differently.

The **Patient Profile becomes the center of the system**, connecting:

```text
Patient
   │
   ├── Treatment
   ├── Appointments
   ├── Payments
   ├── Documents & Media
   └── Activity
```

Around it, clinic-wide operational workspaces provide the doctor and secretary with a clear view of what requires attention.

---

# 🚀 Main Features

## 👨‍⚕️ Patient Management

A centralized patient workspace containing the information required throughout the orthodontic journey.

Each patient can have:

* Personal information
* Guardian / parent information
* Contact details
* Orthodontic treatments
* Appointments
* Payment history
* Clinical documents and media
* Financial history
* Activity timeline

The goal is to avoid fragmented patient information across unrelated screens.

---

## 🦷 Orthodontic Treatment Management

Treatments have their own lifecycle and financial context.

Supported states include:

* `PLANNED`
* `ACTIVE`
* `PAUSED`
* `COMPLETED`
* `CANCELLED`

A patient may have several treatments over time while maintaining a clear historical record.

Each treatment can contain:

* Treatment type
* Agreed price
* Start and completion dates
* Treatment milestones
* Financial progress
* Related documents
* Related appointments

OrthoFlow separates two concepts that are often incorrectly mixed:

```text
Clinical treatment status
            ≠
Financial payment status
```

A clinically completed treatment may therefore still have an outstanding balance.

---

# 💰 Financial Operations

OrthoFlow includes a clinic-wide financial workspace designed for operational visibility rather than traditional accounting complexity.

The doctor can quickly understand:

* Money received today
* Money received during the month
* Outstanding treatment balances
* Collection progress
* Patients with no payments
* Partially paid treatments
* Fully paid treatments
* Overpayments
* Recent financial activity

The interface is designed as a **Financial Operations workspace**, not a generic CRUD table.

---

## 💵 Physical Payment Tracking

OrthoFlow currently focuses on **money physically received by the clinic**.

It is not an online payment gateway.

Each payment can record:

* Patient
* Related treatment
* Amount received
* Payment method
* Payer
* Staff member who received the money
* Date and time
* Notes
* Receipt
* Audit information

Payments use integer minor currency units internally to prevent financial rounding problems.

For Tunisian dinars:

```text
1 TND = 1000 millimes
```

---

## 🧾 Traceable Receipts

Every recorded payment can generate a sequential clinic receipt such as:

```text
REC-2026-000042
```

Receipt numbering is concurrency-safe.

Financial records are designed to remain traceable.

Instead of silently editing financial history:

```text
Incorrect payment
      ↓
Cancel with reason
      ↓
Create corrected payment
```

The original financial event remains visible.

---

## 💳 Treatment-Based Payment Allocation

Payments can be associated with financially relevant treatments.

Example:

```text
Rayen Mestiri

Metal Braces
Agreed      3,600 TND
Recorded    1,400 TND
Remaining   2,200 TND
```

When multiple payable treatments exist, the clinic chooses which treatment receives the payment.

Eligible treatments can include:

* Active treatments
* Paused treatments
* Planned treatments
* Completed treatments that still have a remaining balance

Cancelled or already fully-paid completed treatments are excluded from normal payment allocation.

Both the frontend and backend validate treatment eligibility.

---

# 📊 Premium Financial Dashboard

The Cash Records interface is designed around decision-making rather than repetitive statistic cards.

It includes:

### Financial Pulse

A high-level overview of clinic collections.

### Collection Health

Visualizes recorded versus outstanding treatment value.

### Needs Attention

Highlights cases such as:

* Outstanding balances
* No payment recorded
* Overpayment
* Cancelled payment requiring attention

### Patient Financial Health

Provides a visual distribution of:

* Paid
* Partially paid
* No payment
* Overpaid

### Patient Balances

The main financial workspace showing:

```text
Patient
Treatment
Agreed
Recorded
Remaining
Payment progress
Status
Last payment
```

### Recent Money Movement

A chronological view of recent financial activity.

---

# 🗓️ Appointment Scheduling

OrthoFlow provides a complete scheduling workspace powered by a modern calendar experience.

Features include:

* Day view
* Week view
* Month view
* Appointment creation
* Drag & drop
* Resize
* Appointment editing
* Clinic working hours
* Configurable appointment durations
* Current-time indicator
* Appointment status management

The scheduling system intentionally supports multiple appointments at the same time.

This reflects real orthodontic clinics where controlled overlap may be part of daily operations.

---

## ⚡ Concurrent Appointment Capacity

Instead of treating every overlap as an error, OrthoFlow supports configurable clinic capacity.

Example:

```text
10:00 — Ahmed
10:00 — Mariem
```

Both appointments can be valid.

If clinic capacity is exceeded, the system can warn the user while still allowing an authorized override.

This creates a much more realistic scheduling workflow than traditional strict-overlap validation.

---

# 🏥 Reception / Today's Clinic Flow

Scheduling answers:

> **Who is supposed to come?**

Reception answers:

> **What is happening in the clinic right now?**

The dedicated **Today** workspace manages the real daily flow of patients.

```text
Scheduled
    ↓
Confirmed
    ↓
Arrived
    ↓
Waiting
    ↓
In Treatment
    ↓
Completed
```

Additional outcomes include:

```text
No Show
Cancelled
```

---

## 👥 Today's Operational Queue

The clinic can immediately identify:

* Patients currently waiting
* Patient currently with the doctor
* Upcoming patients
* Late appointments
* Completed visits
* No-shows
* Cancelled appointments

Example:

```text
TODAY

09:00
Ahmed Ben Salah
Waiting · 12 min

09:30
Mariem Trabelsi
In treatment

10:00
Youssef Ayari
17 min late

10:15
Sami Trabelsi
Scheduled
```

---

## ⏱️ Smart Time Tracking

OrthoFlow stores timestamps rather than static duration values.

This makes information such as:

```text
Waiting 12 min
```

update automatically without continuously writing changes to the database.

Late appointments are also **derived**, not stored as permanent clinical states.

The system never automatically marks a patient as a no-show simply because the appointment time passed.

A staff member must explicitly confirm that decision.

---

# 📁 Patient Documents & Clinical Media

Patient Profiles include a dedicated Documents workspace for managing clinical and administrative files.

Supported content includes:

* Clinical photos
* X-rays
* Administrative documents
* PDFs
* Treatment-related files

Files are stored using **Cloudinary**, while MongoDB stores only their structured metadata.

---

## 🖼️ Media Experience

The workspace provides:

* Gallery view
* List view
* Upload progress
* Image preview
* PDF support
* Metadata editing
* Treatment association
* Archive workflow
* Restore support
* Search and filtering
* Responsive mobile interface

Clinical images preserve their original aspect ratio instead of being destructively cropped.

---

## 🔐 Secure Upload Architecture

Uploads are controlled by the backend.

```text
Angular
   ↓
Fastify
   ↓
File validation
   ↓
Cloudinary
   ↓
MongoDB metadata
```

The browser never receives Cloudinary credentials.

Server-side validation includes MIME/signature checks and file-size limits.

If persistence fails after upload, compensating cleanup prevents orphaned Cloudinary assets.

---

# 🔎 Tenant Isolation & Security

OrthoFlow is designed as a clinic-scoped SaaS architecture.

All major resources are isolated using the active clinic context.

This includes:

* Patients
* Treatments
* Appointments
* Payments
* Receipts
* Documents
* Financial queries
* Reception data
* Audit records

The backend remains authoritative for authorization and business rules.

Frontend visibility alone is never considered security.

---

# 👤 Role-Based Access Control

The MVP focuses on a simple real-world clinic structure:

### Owner Doctor

Full operational and clinical access.

### Secretary

Administrative and reception-oriented access according to granted permissions.

The architecture remains extensible without introducing unnecessary role complexity in the first version.

---

# 🧭 Auditability

Sensitive operations create traceable history.

Examples include:

* Payment recorded
* Payment cancelled
* Document uploaded
* Document archived
* Appointment status changed
* Patient arrived
* Visit started
* Visit completed

The objective is not merely to know the current state.

OrthoFlow aims to answer:

> **What happened, when did it happen, and who performed the action?**

---

# 🎨 Design Philosophy

OrthoFlow is intentionally designed to avoid the visual style of traditional medical administration software.

The interface follows a calm, premium SaaS direction inspired by the clarity of products such as Linear, Stripe, Notion, Vercel and Apple — while maintaining its own clinical identity.

### Visual principles

* Warm cream workspace
* Deep clinical green
* Restrained accent colors
* Strong typography
* High information hierarchy
* Generous but controlled spacing
* Contextual actions
* Minimal visual noise
* Responsive layouts
* Accessible interaction targets

The project avoids:

* Generic Bootstrap dashboards
* Excessive cards
* Glassmorphism
* Huge gradients
* Rainbow status colors
* Decorative animations
* Fake analytics

The philosophy is simple:

> **Premium design comes from hierarchy, clarity and interaction quality — not decoration.**

---

# 🏗️ Technology Stack

## Frontend

* Angular
* TypeScript
* Standalone Components
* Angular Signals
* Angular Router
* Reactive Forms
* SCSS
* FullCalendar

## Backend

* Node.js
* Fastify
* TypeScript
* Zod
* Pino
* Swagger / OpenAPI

## Database

* MongoDB Atlas
* Mongoose

## Authentication & Security

* JWT Access Tokens
* Refresh Tokens
* Argon2
* Role-Based Access Control
* Clinic/Tenant isolation

## Storage

* Cloudinary

## Testing

* Vitest
* Backend unit / domain tests
* Angular component and store tests

---

# 🧠 Architectural Principles

OrthoFlow follows several rules throughout the project.

### Backend authoritative business rules

Critical financial, security and lifecycle logic is validated server-side.

### Read models for operational dashboards

Complex pages such as Financial Operations and Reception use dedicated read models rather than triggering many frontend requests.

### No N+1 financial queries

Patient balances are calculated through MongoDB aggregation pipelines.

### Derived state when possible

Values such as:

* Remaining balance
* Payment status
* Late appointment state
* Waiting duration

are derived from authoritative source data rather than duplicated into mutable fields unnecessarily.

### Immutable financial history

Recorded money is cancelled/corrected rather than silently overwritten.

### Feature-oriented architecture

Frontend and backend functionality is grouped by business capability rather than becoming one large shared module.

---

# 📂 High-Level Architecture

```text
OrthoFlow
│
├── frontend/
│   └── Angular
│       ├── Dashboard
│       ├── Today / Reception
│       ├── Patients
│       ├── Treatments
│       ├── Schedule
│       ├── Cash Records
│       └── Patient Media
│
├── backend/
│   └── Fastify
│       ├── Auth
│       ├── Clinics
│       ├── Patients
│       ├── Treatments
│       ├── Appointments
│       ├── Reception
│       ├── Cash Records
│       ├── Finance
│       ├── Patient Media
│       ├── Receipts
│       └── Audit Logs
│
├── MongoDB Atlas
│
└── Cloudinary
```

---

# 🔄 Example Clinic Journey

```text
Patient created
      ↓
Guardian associated
      ↓
Appointment scheduled
      ↓
Treatment created
      ↓
Patient arrives
      ↓
Reception marks ARRIVED
      ↓
Patient waits
      ↓
Doctor starts visit
      ↓
Treatment progresses
      ↓
Clinical media added
      ↓
Physical payment recorded
      ↓
Receipt generated
      ↓
Next appointment scheduled
```

This connected workflow is the core of OrthoFlow.

---

# 🛣️ Product Roadmap

The platform is being developed incrementally around real clinic workflows.

### Implemented / Core

* Patient management
* Orthodontic treatment management
* Scheduling
* Appointment lifecycle
* Physical payment records
* Receipt traceability
* Financial Operations dashboard
* Patient financial balances
* Patient Documents & Media
* Reception / Today's Clinic Flow
* RBAC
* Audit architecture
* Tenant isolation

### Next

* Clinical Visit / Session Notes
* Treatment progress integration
* Follow-up / next appointment workflow
* Unified patient activity timeline
* Global patient search
* Operational dashboard improvements
* Reports & analytics

### Later

* Parent / Guardian Portal
* Notifications
* Appointment reminders
* SMS / WhatsApp / Email integrations

---

# 🎯 Why OrthoFlow?

OrthoFlow is more than a CRUD application built around database entities.

It is an attempt to model the **actual operational lifecycle of an orthodontic clinic**.

From:

```text
“Who is my next patient?”
```

to:

```text
“How long have they been waiting?”
```

to:

```text
“What treatment are they following?”
```

to:

```text
“How much remains to be paid?”
```

to:

```text
“Who received the last payment?”
```

to:

```text
“What happened during their previous visits?”
```

The goal is to keep those answers connected inside one coherent product.

---

## 🌟 Project Goal

Build an orthodontic management platform that feels:

**fast enough for reception,
clear enough for administration,
reliable enough for financial records,
structured enough for clinical work,
and polished enough for a modern private practice.**

---

### OrthoFlow

**From appointment to treatment — one connected clinical workflow.**

---

## 🚀 Production Deployment

OrthoFlow is production-ready and configured for cloud deployment across:

* **GitHub**: Source control & automated CI quality gates ([.github/workflows/ci.yml](file:///.github/workflows/ci.yml)).
* **Vercel**: Angular 22 Single Page Application with edge caching and SPA routing rewrites ([frontend/vercel.json](file:///frontend/vercel.json)).
* **Render**: Managed Fastify Node.js API with health checks and graceful shutdown ([render.yaml](file:///render.yaml)).
* **MongoDB Atlas**: Managed replica-set database with connection pooling and automated index sync.
* **Cloudinary**: Authenticated & secure clinical document and photography storage.

For detailed step-by-step instructions, environment variable references, and post-deployment validation checklists, see **[DEPLOYMENT.md](file:///DEPLOYMENT.md)**.

