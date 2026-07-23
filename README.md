<div align="center">

# StudentProof 🎓 

### Reusable On-Chain Proof of Student

Verify once with your Student ID. Prove your student status anywhere.

![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Auth.js](https://img.shields.io/badge/Auth.js-v5-green)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Status](https://img.shields.io/badge/status-Development-orange)

</div>

---

##  Overview

Millions of students worldwide cannot access student discounts, educational tools, or university services simply because their institution doesn't provide a verified `.edu` email address.

**StudentProof** replaces email-based verification with a reusable **Proof of Student**.

Students verify themselves once using their student ID card. After verification, they receive a reusable on-chain proof that can be used across any platform integrating StudentProof.

No repeated uploads.

No manual verification every time.

One verification. Unlimited reuse.

---

# 🛠 Tech Stack

## Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion

## Authentication

- Auth.js v5
- Google OAuth

## Backend

- Next.js Route Handlers
- PostgreSQL
- Prisma ORM

## OCR

- OpenCV
- EasyOCR

## Blockchain

- Avalanche C-Chain (Fuji testnet)
- viem

---

# 📖 How it Works

```text
Google Login
      │
      ▼
Upload Student ID
      │
      ▼
OCR extracts student details
      │
      ▼
Validate against institution database
      │
      ▼
Create StudentProof Wallet
      │
      ▼
Issue reusable Proof of Student
      │
      ▼
Use anywhere through SDK/API
```

---

# Why StudentProof?

Current student verification usually depends on university email addresses.

This creates problems because:

- Many institutions don't provide `.edu` emails.
- Students repeatedly upload ID cards.
- Every website builds its own verification flow.
- Personal information is exposed unnecessarily.

StudentProof provides a reusable verification layer that applications can integrate once.

---

# 📂 Project Structure

```
app/
 ├── api/
 ├── dashboard/
 ├── docs/
 ├── sdk/
 ├── layout.tsx
 └── page.tsx

components/
 ├── hero/
 └── ui/

lib/

auth.ts

middleware.ts
```

---

# 📄 License

This project is licensed under the MIT License.

---

<div align="center">

Made with ❤️ for students worldwide.

</div>