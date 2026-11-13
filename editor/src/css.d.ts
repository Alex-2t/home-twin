// A .css file imported from code comes as its text (build.ts: esbuild's loader '.css': 'text'): the dashboard card's styles
// go into Preview's Shadow DOM (editor/look.ts).
declare module '*.css' {
  const text: string;
  export default text;
}
