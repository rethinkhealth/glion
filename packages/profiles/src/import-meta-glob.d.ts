/** `import.meta.glob`, resolved at build time by the bundler (Rolldown, Vite). */
interface ImportMeta {
  glob<T>(
    pattern: string | readonly string[],
    options: Readonly<{ import: "default" }>
  ): Record<string, () => Promise<T>>;
}
