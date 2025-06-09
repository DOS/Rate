# Importer API Documentation

## Overview

The Importer API provides endpoints for the Rate Importer module to submit bulk validation requests via Redis Streams.

## Authentication

All endpoints require API token authentication for service-to-service communication.

## Endpoints

### 1. Import Items

Submit items for import and validation.

**Endpoint:** `POST /api/importer/import`

**Headers:**
```
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "items": [
    {
      "url": "https://checkscam.com/site1",
      "title": "Suspicious Site 1",
      "description": "Reported scam site",
      "source_id": "cs_123456",
      "reported_date": "2024-06-08"
    }
  ],
  "source": "checkscam.com", // optional, default: "checkscam.com"
  "priority": "batch", // optional: "low", "normal", "batch", "bulk"
  "webhookUrl": "https://importer.ratebox.com/webhook/validation-complete"
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "req_1234567890_imp123",
  "message": "Import request submitted successfully",
  "itemCount": 1,
  "status": "queued"
}
```

### 2. Check Import Status

Get the status of an import request.

**Endpoint:** `GET /api/importer/status/:requestId`

**Headers:**
```
Authorization: Bearer <API_TOKEN>
```

**Response (Processing):**
```json
{
  "success": false,
  "requestId": "req_1234567890_imp123",
  "status": "processing",
  "message": "Import is still being processed"
}
```

**Response (Completed):**
```json
{
  "success": true,
  "requestId": "req_1234567890_imp123",
  "status": "completed",
  "results": {
    "total": 100,
    "processed": 100,
    "success": 85,
    "errors": 15
  },
  "statistics": {
    "avgTrustScore": 72.5,
    "highRisk": 12,
    "mediumRisk": 23,
    "lowRisk": 50,
    "safe": 15
  },
  "processedAt": "2024-06-09T00:00:00Z",
  "message": "Import completed successfully"
}
```

### 3. Bulk Import

Submit multiple datasets for import.

**Endpoint:** `POST /api/importer/bulk`

**Headers:**
```
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "source": "checkscam.com", // default source
  "priority": "bulk", // default priority
  "webhookUrl": "https://default-webhook.com",
  "datasets": [
    {
      "id": "dataset_20240608_001",
      "source": "checkscam.com",
      "items": [
        {
          "url": "https://scam1.com",
          "title": "Scam Site 1",
          "source_id": "cs_001"
        },
        {
          "url": "https://scam2.com",
          "title": "Scam Site 2",
          "source_id": "cs_002"
        }
      ],
      "tags": ["phishing", "financial"],
      "priority": "high",
      "webhookUrl": "https://dataset-specific-webhook.com"
    },
    {
      "id": "dataset_20240608_002",
      "items": [
        {
          "url": "https://suspicious1.com",
          "title": "Suspicious Site 1",
          "source_id": "cs_003"
        }
      ],
      "tags": ["suspicious", "review"]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk import requests submitted successfully",
  "datasets": [
    {
      "datasetId": "dataset_20240608_001",
      "requestId": "req_1234567890_bulk001",
      "itemCount": 2,
      "source": "checkscam.com"
    },
    {
      "datasetId": "dataset_20240608_002",
      "requestId": "req_1234567890_bulk002",
      "itemCount": 1,
      "source": "checkscam.com"
    }
  ],
  "totalDatasets": 2,
  "totalItems": 3
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "status": 400,
    "name": "BadRequestError",
    "message": "No items provided for import"
  }
}
```

### 401 Unauthorized
```json
{
  "error": {
    "status": 401,
    "name": "UnauthorizedError",
    "message": "Invalid API token"
  }
}
```

### 500 Internal Server Error
```json
{
  "error": {
    "status": 500,
    "name": "InternalServerError",
    "message": "Failed to process import request"
  }
}
```

## Rate Limits

- Import endpoint: 50 requests per minute per API token
- Bulk endpoint: 10 requests per minute per API token
- Status checks: 200 requests per minute per API token

## Webhook Callbacks

When a validation completes, the system will send a POST request to the specified webhook URL:

```json
{
  "requestId": "req_1234567890_imp123",
  "status": "completed",
  "results": {
    "total": 100,
    "processed": 100,
    "success": 85,
    "errors": 15
  },
  "statistics": {
    "avgTrustScore": 72.5,
    "highRisk": 12,
    "mediumRisk": 23,
    "lowRisk": 50,
    "safe": 15
  },
  "processedAt": "2024-06-09T00:00:00Z"
}
```

## Best Practices

1. **Batch Size**: Keep batches under 1000 items for optimal performance
2. **Deduplication**: The system automatically deduplicates URLs within a 24-hour window
3. **Priority**: Use "bulk" priority for large datasets, "high" for urgent validations
4. **Webhooks**: Always provide a webhook URL for async processing notifications
5. **Error Handling**: Implement exponential backoff for retries on 5xx errors
