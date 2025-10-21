export class KeyNotFoundError extends Error {
    public readonly keys: string[];

    constructor(keys: string | string[]) {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        const keysString = keyArray.join(", ");
        super(`Key(s) not found: ${keysString}`);

        this.name = "KeyNotFoundError";
        this.keys = keyArray;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, KeyNotFoundError);
        }
    }
}

export class DuplicateKeyError extends Error {
    public readonly keys: string[];

    constructor(keys: string | string[]) {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        const keysString = keyArray.join(", ");
        super(`Duplicate key(s): ${keysString}`);

        this.name = "DuplicateKeyError";
        this.keys = keyArray;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, DuplicateKeyError);
        }
    }
}