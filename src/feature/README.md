## Feature Controller

- Controller for feature flag management
- Reading flags is public; toggling requires SYSTEM_R5 role
------------------------------------------------------------------------------------------

#### Get all feature flags

<details>
 <summary><code>GET</code> <code>/api/feature</code></summary>

##### Response Format
```
{
    "code": 200 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "featureKeyA": boolean,
        "featureKeyB": boolean
    }
}
```

##### Example
```
{
    "code": 200,
    "status": "Ok",
    "data": {
        "expense_module": true,
        "meal_planner": false
    }
}
```
</details>

------------------------------------------------------------------------------------------

#### Toggle a feature flag on or off (Admin only)

<details>
 <summary><code>POST</code> <code>/api/feature/:key/toggle</code></summary>

Header: Authorization: Bearer <Token>  (requires SYSTEM_R5 role)

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "key": string,
        "isEnabled": boolean
    } | string
}
```
</details>

------------------------------------------------------------------------------------------
