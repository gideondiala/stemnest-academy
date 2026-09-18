# StemNest Academy — Future Features & Expert Answers
## Saved: May 2026

---

## 1. GROUP CLASSES (2–4 Students Per Session)

**Question:** Is it possible to have group classes to cut cost for students who can't pay for premium 1-on-1 classes? We want to create a batch where we join 2, 3 or 4 students in one session.

**Answer: Yes — 100% possible.**

### How it works

- Create a "batch" object that links multiple student bookings to one class slot and one teacher
- The same `classLink` (Google Meet / Zoom) is shared across all students in the batch
- Each student still has their own booking record and credits deduct individually
- The teacher sees "Group Class — 3 students" on their calendar slot
- Pricing can be tiered: e.g. 1-on-1 = £99/mo, Group (2–4) = £59/mo per student

### Data model (when ready to build)

```json
{
  "batchId": "BATCH-001",
  "type": "group",
  "maxStudents": 4,
  "students": ["studentId1", "studentId2", "studentId3"],
  "teacherId": "CT001",
  "classLink": "https://meet.google.com/xxx",
  "date": "2026-06-01",
  "time": "18:00",
  "lessonNumber": 7,
  "lessonName": "Conditional Statements"
}
```

### What needs building (future sprint)

1. Admin creates a "Group Batch" — selects course, teacher, max students (2/3/4)
2. Pre-Sales assigns multiple students to the same batch slot
3. Calendar shows the batch with all student names
4. Teacher sees all students in the session card
5. Credits deduct from each student individually when class ends

**This is a future feature — the current data model already supports it since bookings are separate objects. No breaking changes needed.**

---

## 2. PAYWISE — AUTO-GENERATE PAYMENT LINKS

**Question:** Is it possible to embed Paywise to auto-generate payment links instantly for parents to pay? If possible, how do I navigate this?

**Answer: Yes — fully possible. Here is the exact navigation path.**

### What Paywise offers

[Paywise](https://paywise.co.uk) is a UK-based payment processor that supports:
- Instant payment link generation via API
- GBP, NGN, GHS, USD, AED (all your target markets)
- Webhook notifications when payment is confirmed
- No redirect needed — parents pay on a hosted Paywise page

### How to set it up (step by step)

**Step 1 — Sign up**
- Go to: https://paywise.co.uk
- Create a merchant account
- Complete KYC (business verification — StemNest Academy Ltd)
- You will receive a **live API key** and a **webhook secret**

**Step 2 — Store your API key securely**
- The API key must NEVER go in the frontend (anyone can steal it)
- It lives in your Node.js backend as an environment variable:
  ```
  PAYWISE_API_KEY=your_live_key_here
  ```

**Step 3 — Backend endpoint (Node.js)**
When Post-Sales clicks "Generate Payment Link", your frontend calls your backend:
```
POST /api/payments/generate-link
{ studentName, email, course, amount, currency, credits }
```

Your backend calls Paywise:
```javascript
const response = await fetch('https://api.paywise.co.uk/v1/payment-links', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.PAYWISE_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 9900,          // in pence (£99.00)
    currency: 'GBP',
    customer_email: email,
    description: 'StemNest Academy — ' + course,
    metadata: { studentName, credits }
  })
});
const { payment_url } = await response.json();
// Return payment_url to frontend
```

**Step 4 — Parent pays**
- Post-Sales copies the link and sends it via WhatsApp / email
- Parent clicks the link, pays on Paywise's hosted page
- Paywise sends a webhook to your backend confirming payment

**Step 5 — Webhook (auto-confirm payment)**
```javascript
app.post('/api/webhooks/paywise', (req, res) => {
  const { event, metadata } = req.body;
  if (event === 'payment.completed') {
    // Mark student as paid in database
    // Add credits to student account
    // Notify Post-Sales dashboard
  }
});
```

### Timeline

| Phase | What happens |
|---|---|
| Now | Use manual payment links (current system) |
| When backend is live | Integrate Paywise API — 1–2 days |
| After integration | Payment links auto-generated, auto-confirmed |

**This requires the backend to be live first** — to keep your API key secret and handle webhooks. Once the Node.js backend is deployed, this is a 1–2 day integration.

### Alternative: Stripe

If Paywise doesn't work out, **Stripe** is the gold standard:
- Supports UK, Nigeria, Ghana, UAE, global
- Better documentation and developer tools
- Same integration pattern as above
- Stripe Checkout generates a hosted payment page instantly

---

## 3. BACKEND — NEXT STEPS

**When you're ready to start the backend, refer to:** `BACKEND_ARCHITECTURE_ADVICE.md`

The recommended stack is already documented there:
- **Backend:** Node.js + Express (already scaffolded in `backend/`)
- **Database:** PostgreSQL on AWS RDS
- **Payments:** Stripe or Paywise
- **Deployment:** AWS EC2 + GitHub Actions CI/CD

---

*Saved for reference. Tell Kiro when you're ready to start any of these.*
