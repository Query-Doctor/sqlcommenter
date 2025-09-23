export type Tag = [string, string];

function escapeMetaCharacters(value: string): string {
  return value.replaceAll("'", "\\'");
}

function serializeKey(key: string): string {
  return escapeMetaCharacters(encodeURIComponent(key));
}

function serializeValue(value: unknown): string {
  const encoded = encodeURIComponent(String(value));
  const metaEscaped = escapeMetaCharacters(encoded);
  const final = `'${metaEscaped}'`;
  return final;
}

function isEmpty(tags: Tag[]): boolean {
  return tags.length === 0;
}

function sort(kvPairs: string[]): string[] {
  return kvPairs.sort((a, b) => a.localeCompare(b));
}

export function serializeTags(tags: Tag[]): string {
  if (isEmpty(tags)) {
    return "";
  }
  const parts: string[] = [];
  for (const [k, v] of tags) {
    try {
      const key = serializeKey(k);
      const value = serializeValue(v);
      parts.push(`${key}=${value}`);
    } catch (e) {
      // ignore errors in serialization and skip p[air]
      console.error("Error encoding key", e);
    }
  }
  const sorted = sort(parts);
  const concatenated = sorted.join(",");
  return `/*${concatenated}*/`;
}

/**
 * Debatable whether this part of the spec even makes sense.
 * But it's checked for compliance.
 */
export function alreadyHasComment(sql: string): boolean {
  return sql.lastIndexOf("*/") !== -1;
}
