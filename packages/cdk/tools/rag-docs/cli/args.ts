// Minimal --key value / --flag parser. The tools are operator facing scripts, so
// an extra dependency is not worth it.
export const parseArgs = (argv: readonly string[]): Record<string, string> =>
  argv.reduce<{ result: Record<string, string>; pending?: string }>(
    (state, token) => {
      if (token.startsWith('--')) {
        const [key, inlineValue] = token.slice(2).split('=', 2);
        if (inlineValue !== undefined) {
          return { result: { ...state.result, [key]: inlineValue } };
        }
        return { result: { ...state.result, [key]: 'true' }, pending: key };
      }

      if (state.pending) {
        return { result: { ...state.result, [state.pending]: token } };
      }

      return state;
    },
    { result: {} }
  ).result;

export const requireArg = (
  args: Record<string, string>,
  key: string
): string => {
  const value = args[key];
  if (!value || value === 'true') {
    throw new Error(`--${key} is required`);
  }
  return value;
};

export const optionalNumberArg = (
  args: Record<string, string>,
  key: string
): number | undefined => {
  const value = args[key];
  if (value === undefined || value === 'true') return undefined;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`--${key} must be an integer, but received ${value}`);
  }
  return parsed;
};
