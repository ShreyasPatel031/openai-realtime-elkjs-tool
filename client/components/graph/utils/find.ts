// utils/elk/find.ts
export const findNodeById = (node: any, id: string): any => {
  if (!node) return null;
  if (node.id === id) return node;
  return (node.children || [])
    .map((c: any) => findNodeById(c, id))
    .find(Boolean) ?? null;
}; 