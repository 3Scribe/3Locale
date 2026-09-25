import { AppError } from "./model";
export function shieldPlaceholders(source: string, identity: string) {
  let nonce = 0;
  let prefix: string;
  do {
    prefix = `__3LOCALE_${identity}_${nonce++}_`;
  } while (source.includes(prefix));
  const values = new Map<string, string>();
  // Protect XML-incompatible controls too, so opaque resource text still round-trips.
  const text = source.replace(
    // eslint-disable-next-line no-control-regex -- XML forbids these characters; shield them as opaque tokens.
    /__3LOCALE_[A-Za-z0-9_]*|\{\{[^{}]+\}\}|\{[^{}]+\}|[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/gu,
    (value) => {
      const token = `${prefix}${values.size}__`;
      values.set(token, value);
      return token;
    },
  );
  return {
    text,
    protectedTokens: [...values.keys()],
    restore(result: string) {
      let remainder = result;
      for (const token of values.keys()) {
        if (remainder.split(token).length !== 2)
          throw new AppError("machineInvalidResult");
        remainder = remainder.replace(token, "");
      }
      if (remainder.includes("__3LOCALE_"))
        throw new AppError("machineInvalidResult");
      // One pass prevents original user text from being interpreted as a protection token.
      return result.replace(new RegExp(`${prefix}\\d+__`, "g"), (token) =>
        values.get(token)!,
      );
    },
  };
}
