export type EncodedValue = {
    __value: unknown;
    __eventstamp: string;
};

export type EncodedObject = {
    [key: string]: EncodedValue;
};

export type DecodedObject = {
    [key: string]: unknown;
};
