# 🔐 SecureVault — Hybrid Cryptography File Storage

> AES-256-CBC · Triple-DES · Blowfish · LSB Steganography · MySQL · Node.js

---

## What is SecureVault?

A full-stack encrypted file storage system with triple-layer hybrid cryptography.
Every uploaded file is:
1. **Split into 3 blocks**
2. **Block 1 → AES-256-CBC encrypted**
3. **Block 2 → Triple-DES encrypted**
4. **Block 3 → Blowfish encrypted**
5. **Secret key hidden inside image using LSB Steganography**
6. **Only correct stego image can decrypt the file**

---

## Project Structure

```
securevault/
├── backend/
│   ├── src/
│   │   ├── server.js              ← Express app
│   │   ├── routes/
│   │   │   ├── auth.js            ← Login, register, JWT
│   │   │   ├── files.js           ← File CRUD
│   │   │   ├── hybrid.js          ← Encrypt/decrypt with stego
│   │   │   ├── sharing.js         ← Send/accept/reject files
│   │   │   ├── admin.js           ← Admin analytics
│   │   │   └── keys.js            ← Key management
│   │   ├── crypto/
│   │   │   └── cryptoEngine.js    ← All crypto algorithms
│   │   ├── middleware/
│   │   │   ├── auth.js            ← JWT middleware
│   │   │   └── validate.js        ← Request validation
│   │   ├── services/
│   │   │   └── localDB.js         ← MySQL database service
│   │   └── utils/
│   │       └── logger.js          ← Winston logger
│   ├── tests/
│   │   └── cryptoEngine.test.js   ← 30+ crypto tests
│   ├── seedUsers.js               ← Create 10 sample users
│   ├── package.json
│   ├── .env.example               ← Copy to .env and fill in
│   └── Dockerfile
├── frontend/
│   ├── auth.html                  ← Login / Signup page
│   └── index.html                 ← Main app
├── database/
│   └── setup.sql                  ← Run in MySQL Workbench
├── uploads/                       ← Auto-created on first run
│   ├── blocks/                    ← Encrypted file blocks
│   ├── stego/                     ← Stego images
│   └── files/                     ← Original encrypted files
└── README.md
```

---

## Quick Start (Windows)

### Step 1 — Setup MySQL database

1. Open MySQL Workbench
2. Connect with username: `root`
3. Open `database/setup.sql`
4. Press **Ctrl + Shift + Enter** to run

### Step 2 — Configure backend

```powershell
cd backend
copy .env.example .env
```

Open `.env` and set:
```
DB_PASSWORD=YourMySQLPassword
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```

### Step 3 — Install and start

```powershell
$env:PATH += ";C:\Program Files\nodejs"
npm install
npm run dev
```

You should see:
```
SecureVault API running  port=3000
MySQL connected successfully
```

### Step 4 — Open frontend

Right-click `frontend/auth.html` → **Open with Live Server**

### Step 5 — Create 10 sample users (optional)

```powershell
node seedUsers.js
```

---

## Accounts

### Admin account
Register through the UI then run in MySQL:
```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@vault.com';
```

### Sample users (after running seedUsers.js)
| Name | Email | Password |
|---|---|---|
| Arjun Kumar | arjun@example.com | Arjun@secure123 |
| Priya Sharma | priya@example.com | Priya@secure123 |
| Rahul Verma | rahul@example.com | Rahul@secure123 |
| Sneha Patel | sneha@example.com | Sneha@secure123 |
| Vikram Singh | vikram@example.com | Vikram@secure123 |
| Anjali Nair | anjali@example.com | Anjali@secure123 |
| Karthik Raj | karthik@example.com | Karthik@secure123 |
| Divya Menon | divya@example.com | Divya@secure123 |
| Rohan Gupta | rohan@example.com | Rohan@secure123 |
| Meera Iyer | meera@example.com | Meera@secure123 |

---

## How to use — Full demo flow

1. **Login** as Arjun Kumar
2. Go to **Upload File**
   - Select any PDF or image
   - Enter secret key: `mykey123`
   - Select any PNG/JPG image as stego image
   - Click **Encrypt & Upload**
3. Go to **My Files** → Click **Share**
   - Enter `priya@example.com`
   - Click **Share File**
4. **Logout** → Login as Priya Sharma
5. Go to **Received** → Click **Accept**
6. Click **⬇ Stego** to download the stego image
7. Click **🔓 Decrypt** → Upload the stego image → File downloads!
8. Login as **admin@vault.com** → See admin panel with charts

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/auth/register | Create account |
| POST | /api/v1/auth/login | Login |
| GET  | /api/v1/files | List files |
| POST | /api/v1/hybrid/upload | Encrypt & upload |
| POST | /api/v1/hybrid/:id/decrypt | Verify stego & decrypt |
| GET  | /api/v1/hybrid/:id/stego | Download stego image |
| POST | /api/v1/sharing/send | Share file |
| GET  | /api/v1/sharing/received | Received files |
| POST | /api/v1/sharing/:id/accept | Accept share |
| GET  | /api/v1/admin/dashboard | Admin stats |
| GET  | /health | API health check |

---

## Crypto Stack

| Algorithm | Purpose | Block |
|---|---|---|
| AES-256-CBC | File encryption | Block 1 |
| Triple-DES | File encryption | Block 2 |
| Blowfish (AES-GCM) | File encryption | Block 3 |
| PBKDF2-SHA512 | Key derivation | Password → Key |
| HMAC-SHA256 | File integrity | All files |
| LSB Steganography | Key hiding | Stego image |
| JWT (RS256) | Authentication | API tokens |

---

## Tech Stack

- **Backend**: Node.js 24 + Express 4
- **Database**: MySQL 8 (via mysql2)
- **Auth**: JWT + PBKDF2-SHA512
- **Crypto**: Node.js built-in crypto module + Jimp
- **Frontend**: Vanilla HTML/CSS/JS
- **Charts**: Chart.js

