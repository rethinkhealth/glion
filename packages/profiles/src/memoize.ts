/**
 * `fn`, remembering its result for each argument object. Later calls with the
 * same object return the same result; an object's result goes when the object
 * is collected.
 */
export const memoize = <A extends object, R>(fn: (arg: A) => R) => {
  const results = new WeakMap<A, R>();
  return (arg: A): R => {
    let result = results.get(arg);
    if (result === undefined) {
      result = fn(arg);
      results.set(arg, result);
    }
    return result;
  };
};
