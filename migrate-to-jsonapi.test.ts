import { describe, expect, test } from "bun:test";
import { type JsonDocument, type ResourceObject } from "./packages/starling/src/core";
import { encodeEventstamp, generateNonce } from "./packages/starling/src/core/clock/eventstamp";

type OldComment = {
  id: string;
  content: string;
  entryId: string;
  createdAt: string;
};

type OldEntry = {
  id: string;
  content: string;
  createdAt: string;
  date?: string;
  isBookmarked?: boolean;
  comments: OldComment[];
};

type NewDataFormat = {
  entries: JsonDocument;
  comments: JsonDocument;
};

function migrateData(oldData: OldEntry[]): NewDataFormat {
  let lastMs = 0;
  let counter = 0;

  type TimestampedItem = {
    timestamp: Date;
    type: "entry" | "comment";
    data: OldEntry | OldComment;
    entryId?: string;
  };

  const allItems: TimestampedItem[] = [];

  for (const entry of oldData) {
    allItems.push({
      timestamp: new Date(entry.createdAt),
      type: "entry",
      data: entry,
    });

    for (const comment of entry.comments) {
      allItems.push({
        timestamp: new Date(comment.createdAt),
        type: "comment",
        data: comment,
        entryId: entry.id,
      });
    }
  }

  allItems.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const entryResources: ResourceObject[] = [];
  const commentResources: ResourceObject[] = [];

  for (const item of allItems) {
    const timestampMs = item.timestamp.getTime();

    if (timestampMs === lastMs) {
      counter++;
    } else {
      lastMs = timestampMs;
      counter = 0;
    }

    const nonce = generateNonce();
    const eventstamp = encodeEventstamp(timestampMs, counter, nonce);

    if (item.type === "entry") {
      const entry = item.data as OldEntry;

      const attributes: Record<string, unknown> = {
        id: entry.id,
        content: entry.content,
        createdAt: entry.createdAt,
      };

      if (entry.date !== undefined) {
        attributes.date = entry.date;
      }

      if (entry.isBookmarked !== undefined) {
        attributes.isBookmarked = entry.isBookmarked;
      }

      const eventstamps: Record<string, string> = {};
      for (const key of Object.keys(attributes)) {
        eventstamps[key] = eventstamp;
      }

      entryResources.push({
        type: "entries",
        id: entry.id,
        attributes,
        meta: {
          eventstamps,
          latest: eventstamp,
          deletedAt: null,
        },
      });
    } else {
      const comment = item.data as OldComment;

      const attributes = {
        id: comment.id,
        entryId: comment.entryId,
        content: comment.content,
        createdAt: comment.createdAt,
      };

      const eventstamps: Record<string, string> = {};
      for (const key of Object.keys(attributes)) {
        eventstamps[key] = eventstamp;
      }

      commentResources.push({
        type: "comments",
        id: comment.id,
        attributes,
        meta: {
          eventstamps,
          latest: eventstamp,
          deletedAt: null,
        },
      });
    }
  }

  const latestEventstamp = encodeEventstamp(lastMs, counter, generateNonce());

  return {
    entries: {
      jsonapi: { version: "1.1" },
      meta: { latest: latestEventstamp },
      data: entryResources,
    },
    comments: {
      jsonapi: { version: "1.1" },
      meta: { latest: latestEventstamp },
      data: commentResources,
    },
  };
}

describe("migrate-to-jsonapi", () => {
  test("converts basic entry without comments", () => {
    const oldData: OldEntry[] = [
      {
        id: "entry-1",
        content: "Test entry",
        createdAt: "2025-08-12T13:32:30.422Z",
        comments: [],
      },
    ];

    const result = migrateData(oldData);

    expect(result.entries.data).toHaveLength(1);
    expect(result.comments.data).toHaveLength(0);

    const entry = result.entries.data[0];
    expect(entry?.type).toBe("entries");
    expect(entry?.id).toBe("entry-1");
    expect(entry?.attributes.id).toBe("entry-1");
    expect(entry?.attributes.content).toBe("Test entry");
    expect(entry?.attributes.createdAt).toBe("2025-08-12T13:32:30.422Z");
    expect(entry?.meta.deletedAt).toBe(null);
    expect(entry?.meta.eventstamps).toHaveProperty("id");
    expect(entry?.meta.eventstamps).toHaveProperty("content");
    expect(entry?.meta.eventstamps).toHaveProperty("createdAt");
  });

  test("preserves optional fields", () => {
    const oldData: OldEntry[] = [
      {
        id: "entry-1",
        content: "Test entry",
        createdAt: "2025-08-12T13:32:30.422Z",
        date: "2025-08-12",
        isBookmarked: true,
        comments: [],
      },
    ];

    const result = migrateData(oldData);
    const entry = result.entries.data[0];

    expect(entry?.attributes.date).toBe("2025-08-12");
    expect(entry?.attributes.isBookmarked).toBe(true);
    expect(entry?.meta.eventstamps).toHaveProperty("date");
    expect(entry?.meta.eventstamps).toHaveProperty("isBookmarked");
  });

  test("separates comments into own collection", () => {
    const oldData: OldEntry[] = [
      {
        id: "entry-1",
        content: "Entry with comment",
        createdAt: "2025-08-12T13:32:30.422Z",
        comments: [
          {
            id: "comment-1",
            content: "A comment",
            entryId: "entry-1",
            createdAt: "2025-08-12T14:00:00.000Z",
          },
        ],
      },
    ];

    const result = migrateData(oldData);

    expect(result.entries.data).toHaveLength(1);
    expect(result.comments.data).toHaveLength(1);

    const comment = result.comments.data[0];
    expect(comment?.type).toBe("comments");
    expect(comment?.id).toBe("comment-1");
    expect(comment?.attributes.entryId).toBe("entry-1");
    expect(comment?.attributes.content).toBe("A comment");
    expect(comment?.meta.eventstamps).toHaveProperty("entryId");
  });

  test("maintains chronological order", () => {
    const oldData: OldEntry[] = [
      {
        id: "entry-2",
        content: "Second entry",
        createdAt: "2025-08-12T14:00:00.000Z",
        comments: [],
      },
      {
        id: "entry-1",
        content: "First entry",
        createdAt: "2025-08-12T13:00:00.000Z",
        comments: [
          {
            id: "comment-1",
            content: "Comment on first",
            entryId: "entry-1",
            createdAt: "2025-08-12T13:30:00.000Z",
          },
        ],
      },
    ];

    const result = migrateData(oldData);

    // Check that eventstamps reflect chronological order
    const entry1Stamp = result.entries.data.find((e) => e.id === "entry-1")?.meta.latest;
    const entry2Stamp = result.entries.data.find((e) => e.id === "entry-2")?.meta.latest;
    const comment1Stamp = result.comments.data[0]?.meta.latest;

    expect(entry1Stamp).toBeDefined();
    expect(entry2Stamp).toBeDefined();
    expect(comment1Stamp).toBeDefined();

    // Entry 1 should have earlier stamp than comment
    if (entry1Stamp && comment1Stamp) {
      expect(entry1Stamp < comment1Stamp).toBe(true);
    }

    // Comment should have earlier stamp than entry 2
    if (comment1Stamp && entry2Stamp) {
      expect(comment1Stamp < entry2Stamp).toBe(true);
    }
  });

  test("handles multiple comments", () => {
    const oldData: OldEntry[] = [
      {
        id: "entry-1",
        content: "Entry",
        createdAt: "2025-08-12T13:00:00.000Z",
        comments: [
          {
            id: "comment-1",
            content: "First comment",
            entryId: "entry-1",
            createdAt: "2025-08-12T13:30:00.000Z",
          },
          {
            id: "comment-2",
            content: "Second comment",
            entryId: "entry-1",
            createdAt: "2025-08-12T14:00:00.000Z",
          },
        ],
      },
    ];

    const result = migrateData(oldData);

    expect(result.entries.data).toHaveLength(1);
    expect(result.comments.data).toHaveLength(2);
    expect(result.comments.data[0]?.id).toBe("comment-1");
    expect(result.comments.data[1]?.id).toBe("comment-2");
  });

  test("creates valid JSON:API structure", () => {
    const oldData: OldEntry[] = [
      {
        id: "entry-1",
        content: "Test",
        createdAt: "2025-08-12T13:00:00.000Z",
        comments: [],
      },
    ];

    const result = migrateData(oldData);

    // Check entries structure
    expect(result.entries).toHaveProperty("jsonapi");
    expect(result.entries.jsonapi.version).toBe("1.1");
    expect(result.entries).toHaveProperty("meta");
    expect(result.entries.meta).toHaveProperty("latest");
    expect(result.entries).toHaveProperty("data");

    // Check comments structure
    expect(result.comments).toHaveProperty("jsonapi");
    expect(result.comments.jsonapi.version).toBe("1.1");
    expect(result.comments).toHaveProperty("meta");
    expect(result.comments.meta).toHaveProperty("latest");
    expect(result.comments).toHaveProperty("data");
  });

  test("generates valid eventstamps", () => {
    const oldData: OldEntry[] = [
      {
        id: "entry-1",
        content: "Test",
        createdAt: "2025-08-12T13:32:30.422Z",
        comments: [],
      },
    ];

    const result = migrateData(oldData);
    const entry = result.entries.data[0];

    // Eventstamp format: YYYY-MM-DDTHH:mm:ss.SSSZ|HHHH|HHHH
    const eventstampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{4,}\|[0-9a-f]{4}$/;

    expect(entry?.meta.latest).toMatch(eventstampRegex);
    expect(entry?.meta.eventstamps.id).toMatch(eventstampRegex);
    expect(result.entries.meta.latest).toMatch(eventstampRegex);
  });
});
