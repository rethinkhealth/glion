/** `import.meta.glob`, resolved at build time by the bundler (Rolldown, Vite). */
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: Readonly<{ eager: true; import: "default" }>
  ): Record<string, T>;
  glob<T>(
    pattern: string,
    options: Readonly<{ import: "default" }>
  ): Record<string, () => Promise<T>>;
}
