export const hostFetch: typeof fetch = (input, init) =>
  globalThis.fetch(input, init);

export function invokeFetch<Input, Init, Result>(
  fetcher: (input: Input, init?: Init) => Result,
  input: Input,
  init?: Init,
) {
  return Reflect.apply(fetcher, globalThis, [input, init]) as Result;
}
