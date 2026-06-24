# CrestFlow — Frontend Context

> This file is updated after every backend integration to capture all frontend requirements for that feature.
> It serves as the source of truth for the dashboard build (Plan 8 and beyond).
> Format: newest sections at the top within each module.

---

## How to Read This File

Each section maps to a backend integration that has been planned or completed.
For each integration, this file documents:
- What screens/views the frontend needs
- What API calls each screen makes
- What state it manages
- UX behaviour and flows
- Data shapes the frontend consumes

---

## Module: Auth + Turnkey Wallet (Onboarding)

**Backend Plan:** `plans/01-auth-turnkey-onboarding.md`  
**API Base:** `POST /api/v1/auth/google`, `GET /api/v1/auth/me`

### Screens Required

#### 1. Landing / Login Screen
- "Sign in with Google" button — triggers Google OAuth popup
- On success: frontend receives Google `id_token`, sends to `POST /api/v1/auth/google`
- On response: stores returned `accessToken` (httpOnly cookie or secure localStorage)
- Redirect to Dashboard after successful auth

#### 2. Onboarding Loading State
- Shown between first Google sign-in and dashboard load
- Message: "Setting up your CrestFlow account and Algorand wallet..."
- Displayed while backend creates Turnkey sub-org + wallet + triggers portfolio scan
- Should not be skippable

#### 3. Wallet Ready State (inline in Dashboard)
- Shows Algorand address (truncated, copyable)
- Shows "Wallet active" badge
- Turnkey logo/attribution

### State to Manage
- `user.id`, `user.email`, `user.name`
- `user.algorandAddress` — shown in header/sidebar
- `user.walletId` — stored for signing flow (Engine 6)
- `user.kycStatus` — controls visibility of execution features
- `accessToken` — JWT for all subsequent API calls

### API Calls

| Trigger | Method | Endpoint | Payload |
|---|---|---|---|
| Google sign-in success | POST | `/api/v1/auth/google` | `{ idToken: string }` |
| Page load / token refresh | GET | `/api/v1/auth/me` | — (JWT in header) |

### Response Shapes

**POST /api/v1/auth/google**
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Aditya",
      "algorandAddress": "ALGO...",
      "kycStatus": "PENDING",
      "isNewUser": true
    }
  }
}
```

**GET /api/v1/auth/me**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Aditya",
    "algorandAddress": "ALGO...",
    "kycStatus": "PENDING"
  }
}
```

### UX Rules
- Google button only — no email/password fields on this screen
- If user is already authenticated (valid JWT), skip login and go to dashboard directly
- Show a spinner/loading screen while wallet is being provisioned (first sign-in only)
- `isNewUser: true` in response = show onboarding loading state before dashboard
- `isNewUser: false` = go directly to dashboard
- Algorand address should be truncated on display: `ABCD...WXYZ`
- Never show wallet ID or sub-org ID in the UI

---

*More sections will be added here as each backend integration plan is written.*
