## Expense Controller

- Controller for the personal expense and budget tracker
- All endpoints require authentication — data is strictly per-user
- Transactions support two types: `expense` and `earning`
- Credit card expenses only reduce the balance on the card's due date, not at swipe time
- The frontend `BALANCE` stat excludes CC transactions (`cardId != null`) and future-dated transactions — only cash movements up to today count toward the displayed balance
------------------------------------------------------------------------------------------

#### Load expense data (init)

Returns the user's current balance, all transactions, and all credit cards in a single call.

<details>
 <summary><code>GET</code> <code>/api/expense</code></summary>

Header: Authorization: Bearer <Token>

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "balance": number,
        "transactions": [
            {
                "id": number,
                "type": "expense" | "earning",
                "amount": number,
                "description": string,
                "category": string,
                "date": string,         // YYYY-MM-DD
                "notes": string | null,
                "cardId": number | null,
                "createdAt": number
            }
        ],
        "cards": [
            {
                "id": number,
                "name": string,
                "cycleEndDay": number,  // 1–28
                "dueDay": number,       // 1–28
                "color": string         // hex color
            }
        ]
    }
}
```
</details>

------------------------------------------------------------------------------------------

#### Set current balance

Upserts the user's current cash balance.

<details>
 <summary><code>POST</code> <code>/api/expense/balance</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "balance": number   // required
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": null | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Create a transaction

<details>
 <summary><code>POST</code> <code>/api/expense/transaction</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "type": "expense" | "earning",  // required
    "amount": number,               // required
    "description": string,          // required
    "category": string,             // required
    "date": string,                 // required, YYYY-MM-DD
    "notes": string,                // optional
    "cardId": number                // optional — null means cash/debit, a card ID means CC purchase
}
```

##### Expense categories: `food`, `transport`, `shopping`, `entertainment`, `utilities`, `health`, `other`
##### Earning categories: `salary`, `freelance`, `investment`, `gift`, `other`

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "id": number,
        "type": "expense" | "earning",
        "amount": number,
        "description": string,
        "category": string,
        "date": string,
        "notes": string | null,
        "cardId": number | null,
        "createdAt": number
    } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Update a transaction

<details>
 <summary><code>POST</code> <code>/api/expense/transaction/update</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "id": number,                   // required
    "type": "expense" | "earning",  // required
    "amount": number,               // required
    "description": string,          // required
    "category": string,             // required
    "date": string,                 // required, YYYY-MM-DD
    "notes": string,                // optional
    "cardId": number                // optional
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": { ...updated transaction } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Delete a transaction (soft delete)

<details>
 <summary><code>POST</code> <code>/api/expense/transaction/delete</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "id": number   // required
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": null | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Create a credit card

<details>
 <summary><code>POST</code> <code>/api/expense/card</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "name": string,         // required, card label e.g. "DBS Live Fresh"
    "cycleEndDay": number,  // required, 1–28: day of month the billing cycle ends
    "dueDay": number,       // required, 1–28: payment due day of the following month
    "color": string         // required, hex color e.g. "#3b82f6"
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "id": number,
        "name": string,
        "cycleEndDay": number,
        "dueDay": number,
        "color": string
    } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Update a credit card

<details>
 <summary><code>POST</code> <code>/api/expense/card/update</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "id": number,           // required
    "name": string,         // required
    "cycleEndDay": number,  // required
    "dueDay": number,       // required
    "color": string         // required
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": { ...updated card } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Delete a credit card (soft delete)

Also nulls out `card_id` on all active transactions that referenced this card.

<details>
 <summary><code>POST</code> <code>/api/expense/card/delete</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "id": number   // required
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": null | string
}
```
</details>

------------------------------------------------------------------------------------------
