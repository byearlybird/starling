import {
        createDatabase,
        httpPlugin,
        idbPlugin,
} from "@byearlybird/starling-db";
import { z } from "zod";

export const statusSchema = z.enum(["todo", "doing", "done"]);

export const taskSchema = z.object({
        id: z.string().uuid().default(() => crypto.randomUUID()),
        status: statusSchema.default("todo"),
        title: z.string().min(1),
        createdAt: z.string().default(() => new Date().toISOString()),
});

export type Task = z.infer<typeof taskSchema>;
export type TaskInput = z.input<typeof taskSchema>;
export type Status = z.infer<typeof statusSchema>;

const syncBaseUrl = import.meta.env.VITE_STARLING_HTTP_BASE_URL;

const pseudoEncrypt = (data: unknown): string => {
        const jsonString = JSON.stringify(data);
        return btoa(jsonString);
};

const pseudoDecrypt = (encrypted: unknown): unknown => {
        if (typeof encrypted !== "string") {
                throw new Error("Expected encrypted data to be a string");
        }

        const jsonString = atob(encrypted);
        return JSON.parse(jsonString);
};

const isObject = (value: unknown): value is Record<string, unknown> => {
        return typeof value === "object" && value !== null && !Array.isArray(value);
};

const mapLeafValues = (
        value: unknown,
        fn: (value: unknown) => unknown,
): unknown => {
        if (Array.isArray(value)) {
                return value.map((entry) => mapLeafValues(entry, fn));
        }

        if (isObject(value)) {
                return Object.fromEntries(
                        Object.entries(value).map(([key, entry]) => [
                                key,
                                mapLeafValues(entry, fn),
                        ]),
                );
        }

        return fn(value);
};

const encryptDocument = (document: unknown) => {
        if (
                !document ||
                typeof document !== "object" ||
                !("data" in document) ||
                !Array.isArray((document as { data: unknown }).data)
        ) {
                return document;
        }

        const { data, ...rest } = document as { data: Array<Record<string, unknown>> };

        return {
                ...rest,
                data: data.map((resource) => ({
                        ...resource,
                        attributes: mapLeafValues(
                                resource.attributes,
                                pseudoEncrypt,
                        ) as Task,
                })),
        };
};

const decryptDocument = (document: unknown) => {
        if (
                !document ||
                typeof document !== "object" ||
                !("data" in document) ||
                !Array.isArray((document as { data: unknown }).data)
        ) {
                return document;
        }

        const { data, ...rest } = document as { data: Array<Record<string, unknown>> };

        return {
                ...rest,
                data: data.map((resource) => ({
                        ...resource,
                        attributes: mapLeafValues(
                                resource.attributes,
                                pseudoDecrypt,
                        ) as Task,
                })),
        };
};

const database = createDatabase("react-tasks", {
        tasks: {
                schema: taskSchema,
                getId: (task) => task.id,
        },
}).use(idbPlugin());

if (syncBaseUrl) {
        database.use(
                httpPlugin({
                        baseUrl: syncBaseUrl,
                        onRequest: ({ document }) =>
                                document
                                        ? { document: encryptDocument(document) }
                                        : undefined,
                        onResponse: ({ document }) =>
                                document
                                        ? { document: decryptDocument(document) }
                                        : undefined,
                }),
        );
}

export const db = await database.init();

export type TaskDatabase = typeof db;
