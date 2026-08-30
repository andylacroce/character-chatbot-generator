// react-window v2 ships its own types (dist/react-window.d.ts, no `exports` map in its
// package.json — just plain `types`/`main`/`module` fields), but TypeScript's JSX generic
// inference fails on `List`'s generic signature under this project's config: passing
// `rowComponent`/`rowProps` still resolves the component's props to the base HTMLAttributes
// shape, dropping `height`/`rowCount`/etc. entirely (confirmed by attempting to remove this
// shim: type-check start reporting `Property 'height' does not exist...`). This blanket
// declaration widens the whole module to `any` as a workaround — see
// VirtualizedMessagesList.tsx for the manually-typed row props that fill the gap.
declare module 'react-window';
