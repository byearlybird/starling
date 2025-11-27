# Data Migration to JSON:API Format

This document describes how to migrate old journal data to the new JSON:API spec format used by Starling.

## Migration Script

The `migrate-to-jsonapi.ts` script converts old data format to the new JSON:API format.

### Usage

```bash
bun migrate-to-jsonapi.ts <input-file> <output-file>
```

**Example:**
```bash
bun migrate-to-jsonapi.ts old-data.json new-data.json
```

### What it does

The migration script:

1. **Reads old data** - Loads the old format (flat array of entries with nested comments)
2. **Generates eventstamps** - Uses `createdAt` timestamps to seed eventstamps, preserving chronological order
3. **Separates collections** - Splits entries and comments into separate JSON:API documents
4. **Creates resource objects** - Converts each entry/comment to a proper ResourceObject with:
   - `type`: "entries" or "comments"
   - `id`: Original ID preserved
   - `attributes`: All data fields (id, content, createdAt, date, isBookmarked, etc.)
   - `meta`: eventstamps for each field, latest eventstamp, and deletedAt (null)
5. **Writes new format** - Outputs two collections in JSON:API format

### Input Format (Old)

```json
[
  {
    "id": "abc-123",
    "content": "Some content",
    "createdAt": "2025-08-12T13:32:30.422Z",
    "date": "2025-08-12",
    "isBookmarked": false,
    "comments": [
      {
        "id": "def-456",
        "content": "A comment",
        "entryId": "abc-123",
        "createdAt": "2025-08-13T14:22:16.516Z"
      }
    ]
  }
]
```

### Output Format (New)

```json
{
  "entries": {
    "jsonapi": { "version": "1.1" },
    "meta": { "latest": "2025-08-13T14:22:16.516Z|0000|a7f2" },
    "data": [
      {
        "type": "entries",
        "id": "abc-123",
        "attributes": {
          "id": "abc-123",
          "content": "Some content",
          "createdAt": "2025-08-12T13:32:30.422Z",
          "date": "2025-08-12",
          "isBookmarked": false
        },
        "meta": {
          "eventstamps": {
            "id": "2025-08-12T13:32:30.422Z|0000|5359",
            "content": "2025-08-12T13:32:30.422Z|0000|5359",
            "createdAt": "2025-08-12T13:32:30.422Z|0000|5359",
            "date": "2025-08-12T13:32:30.422Z|0000|5359",
            "isBookmarked": "2025-08-12T13:32:30.422Z|0000|5359"
          },
          "latest": "2025-08-12T13:32:30.422Z|0000|5359",
          "deletedAt": null
        }
      }
    ]
  },
  "comments": {
    "jsonapi": { "version": "1.1" },
    "meta": { "latest": "2025-08-13T14:22:16.516Z|0001|860c" },
    "data": [
      {
        "type": "comments",
        "id": "def-456",
        "attributes": {
          "id": "def-456",
          "entryId": "abc-123",
          "content": "A comment",
          "createdAt": "2025-08-13T14:22:16.516Z"
        },
        "meta": {
          "eventstamps": {
            "id": "2025-08-13T14:22:16.516Z|0000|ecf5",
            "entryId": "2025-08-13T14:22:16.516Z|0000|ecf5",
            "content": "2025-08-13T14:22:16.516Z|0000|ecf5",
            "createdAt": "2025-08-13T14:22:16.516Z|0000|ecf5"
          },
          "latest": "2025-08-13T14:22:16.516Z|0000|ecf5",
          "deletedAt": null
        }
      }
    ]
  }
}
```

### Key Changes

- **Separated collections**: Entries and comments are now separate top-level collections
- **JSON:API structure**: Each collection follows the JSON:API 1.1 specification
- **Eventstamps**: Each field has an eventstamp for conflict resolution during sync
- **Preserved data**: All original fields (id, content, createdAt, date, isBookmarked) are preserved
- **Chronological ordering**: Eventstamps are generated in chronological order based on createdAt timestamps

### Notes

- This is a one-time migration script
- The script preserves all optional fields (date, isBookmarked) when present
- Eventstamps include a random nonce to ensure uniqueness
- The migration processes entries and comments chronologically to maintain proper eventstamp ordering
