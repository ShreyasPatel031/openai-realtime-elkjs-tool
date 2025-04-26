import { ROOT_DEFAULT_OPTIONS, NON_ROOT_DEFAULT_OPTIONS } from "../../elk/elkOptions";

export const ensureIds = (node: any, parent = ""): any => {
  if (!node) return node;

  if (!parent) {                          // root
    Object.assign(node, {
      ...ROOT_DEFAULT_OPTIONS,
      layoutOptions: { ...ROOT_DEFAULT_OPTIONS.layoutOptions, ...(node.layoutOptions ?? {}) },
    });
  } else {
    node.width  ??= NON_ROOT_DEFAULT_OPTIONS.width;
    node.height ??= NON_ROOT_DEFAULT_OPTIONS.height;
    node.layoutOptions = { ...NON_ROOT_DEFAULT_OPTIONS.layoutOptions, ...(node.layoutOptions ?? {}) };
  }

  node.id ||= `${parent}-${Math.random().toString(36).slice(2, 9)}`;
  (node.children || []).forEach((c: any) => ensureIds(c, node.id));
  return node;
}; 