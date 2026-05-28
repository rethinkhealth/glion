import { nanoid } from "nanoid";

const MAX_LENGTH = 20;

export interface Options {
  prefix?: string;
  size?: number;
}

export function uid(options: Options = {}): string {
  const { prefix, size = MAX_LENGTH } = options;

  if (!prefix) {
    return nanoid(size);
  }

  const remaining = size - prefix.length;

  if (remaining <= 0) {
    return prefix.slice(0, size);
  }

  return `${prefix}${nanoid(remaining)}`;
}
