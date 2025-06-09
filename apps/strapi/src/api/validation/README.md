# Validation API Documentation

## Overview

The Validation API provides endpoints for the Rate Extension to submit validation requests via Redis Streams.

## Authentication

All endpoints require authentication using either:
- JWT token (for authenticated users)
- API token (for service-to-service communication)

## Endpoints

### 1. Validate Items

Submit items for validation.

**Endpoint:** `POST /api/validation/validate`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
// OR
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "items": [
    {
      "url": "https://example.com",
      "title": "Example Site",
      "description": "Sample description"
    }
  ],
  "priority": "normal", // optional: "low", "normal", "high"
  "webhookUrl": "https://your-webhook.com/callback" // optional
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "req_1234567890_abc123",
  "message": "Validation request submitted successfully",
  "status": "pending"
}
```

### 2. Check Status

Get the status of a validation request.

**Endpoint:** `GET /api/validation/status/:requestId`

**Headers:**
```
Authorization: Bearer <TOKEN>
```

**Response (Pending):**
```json
{
  "success": false,
  "requestId": "req_1234567890_abc123",
  "status": "pending",
  "message": "Request is still being processed"
}
```

**Response (Completed):**
```json
{
  "success": true,
  "requestId": "req_1234567890_abc123",
  "status": "completed",
  "results": [
    {
      "url": "https://example.com",
      "status": "DONE",
      "trust_score": 85.5,
      "risk_indicators": []
    }
  ],
  "processedAt": "2024-06-09T00:00:00Z",
  "message": "Validation completed successfully"
}
```

### 3. Batch Validate

Submit multiple batches for validation.

**Endpoint:** `POST /api/validation/batch`

**Headers:**
```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "priority": "normal", // default priority for all batches
  "webhookUrl": "https://default-webhook.com", // default webhook
  "batches": [
    {
      "id": "batch_001",
      "items": [
        {
          "url": "https://site1.com",
          "title": "Site 1"
        },
        {
          "url": "https://site2.com",
          "title": "Site 2"
        }
      ],
      "priority": "high", // override default
      "webhookUrl": "https://batch-specific-webhook.com" // override default
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Batch validation requests submitted successfully",
  "batches": [
    {
      "batchId": "batch_001",
      "requestId": "req_1234567890_xyz789",
      "itemCount": 2
    }
  ],
  "totalBatches": 1,
  "totalItems": 2
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "status": 400,
    "name": "BadRequestError",
    "message": "No items provided for validation"
  }
}
```

### 401 Unauthorized
```json
{
  "error": {
    "status": 401,
    "name": "UnauthorizedError",
    "message": "Missing or invalid authentication token"
  }
}
```

### 500 Internal Server Error
```json
{
  "error": {
    "status": 500,
    "name": "InternalServerError",
    "message": "Failed to process validation request"
  }
}
```

## Rate Limits

- Default: 100 requests per minute per user
- Batch endpoint: 10 requests per minute per user
- Status checks: 300 requests per minute per user

## WebSocket Support (Coming Soon)

Real-time updates will be available via WebSocket connection:
```javascript
const ws = new WebSocket('wss://api.ratebox.com/validation/ws');
ws.send(JSON.stringify({
  type: 'subscribe',
  requestId: 'req_1234567890_abc123'
}));
```
