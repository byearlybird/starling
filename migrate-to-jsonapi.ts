#!/usr/bin/env bun

/**
 * Migration script to convert old journal data format to new JSON:API spec format.
 *
 * Usage:
 *   bun migrate-to-jsonapi.ts <input-file> <output-file>
 *
 * Example:
 *   bun migrate-to-jsonapi.ts old-data.json new-data.json
 */

import { type JsonDocument, type ResourceObject } from "./packages/starling/src/core";
import { encodeEventstamp, generateNonce } from "./packages/starling/src/core/clock/eventstamp";
import { readFile, writeFile } from "node:fs/promises";

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

/**
 * Convert old data format to new JSON:API format.
 * Uses createdAt timestamps to seed eventstamps.
 */
function migrateData(oldData: OldEntry[]): NewDataFormat {
  // Track counter for same-millisecond events
  let lastMs = 0;
  let counter = 0;

  // Collect all items (entries + comments) with timestamps for chronological processing
  type TimestampedItem = {
    timestamp: Date;
    type: "entry" | "comment";
    data: OldEntry | OldComment;
    entryId?: string; // For comments
  };

  const allItems: TimestampedItem[] = [];

  // Collect entries
  for (const entry of oldData) {
    allItems.push({
      timestamp: new Date(entry.createdAt),
      type: "entry",
      data: entry,
    });

    // Collect comments for this entry
    for (const comment of entry.comments) {
      allItems.push({
        timestamp: new Date(comment.createdAt),
        type: "comment",
        data: comment,
        entryId: entry.id,
      });
    }
  }

  // Sort by timestamp to process chronologically
  allItems.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Process items and create resource objects
  const entryResources: ResourceObject[] = [];
  const commentResources: ResourceObject[] = [];

  for (const item of allItems) {
    // Generate eventstamp from timestamp
    const timestampMs = item.timestamp.getTime();

    // Increment counter if same millisecond, otherwise reset
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

      // Build attributes
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

      // Build eventstamps for each attribute
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

      // Build attributes
      const attributes = {
        id: comment.id,
        entryId: comment.entryId,
        content: comment.content,
        createdAt: comment.createdAt,
      };

      // Build eventstamps for each attribute
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

  // Use the last generated eventstamp as the latest
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error("Usage: bun migrate-to-jsonapi.ts <input-file> <output-file>");
    console.error("");
    console.error("Example:");
    console.error("  bun migrate-to-jsonapi.ts old-data.json new-data.json");
    process.exit(1);
  }

  const [inputFile, outputFile] = args;

  console.log(`Reading old data from: ${inputFile}`);
  const oldDataJson = await readFile(inputFile, "utf-8");
  const oldData = JSON.parse(oldDataJson) as OldEntry[];

  console.log(`Found ${oldData.length} entries`);
  const totalComments = oldData.reduce((sum, entry) => sum + entry.comments.length, 0);
  console.log(`Found ${totalComments} comments`);

  console.log("\nMigrating data...");
  const newData = migrateData(oldData);

  console.log(`Created ${newData.entries.data.length} entry resources`);
  console.log(`Created ${newData.comments.data.length} comment resources`);
  console.log(`Latest eventstamp: ${newData.entries.meta.latest}`);

  console.log(`\nWriting new data to: ${outputFile}`);
  await writeFile(outputFile, JSON.stringify(newData, null, 2), "utf-8");

  console.log("\n✅ Migration complete!");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
