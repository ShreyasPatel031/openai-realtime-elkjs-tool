/**
 *  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 *  ┃  **DATA LAYERS – READ ME BEFORE EDITING**                    ┃
 *  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 *  ┃  1. domain-graph (graph/*)                                   ┃
 *  ┃     - pure ELK JSON                                           ┃
 *  ┃     - NO x/y/sections/width/height/etc                        ┃
 *  ┃                                                               ┃
 *  ┃  2. processed-graph (ensureIds + elkOptions)                  ┃
 *  ┃     - lives only inside hooks/layout funcs                    ┃
 *  ┃     - generated, never mutated manually                       ┃
 *  ┃                                                               ┃
 *  ┃  3. view-graph (ReactFlow nodes/edges)                        ┃
 *  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 */

// utils/elk/ids.ts
import { ROOT_DEFAULT_OPTIONS, NON_ROOT_DEFAULT_OPTIONS } from "./elkOptions";

/**
 * Recursively assigns stable IDs and layoutOptions.
 * Any node that already has an `id` is left untouched.
 */
export function ensureIds(root: any): any {
  let counter = 0;

  function recurse(node: any, parentId: string) {
    if (!node) return;

    // root vs non-root layout options
    if (!parentId) {
      Object.assign(node, {
        ...ROOT_DEFAULT_OPTIONS,
        layoutOptions: {
          ...ROOT_DEFAULT_OPTIONS.layoutOptions,
          ...(node.layoutOptions ?? {}),
        },
      });
    } else {
      node.width  ??= NON_ROOT_DEFAULT_OPTIONS.width;
      node.height ??= NON_ROOT_DEFAULT_OPTIONS.height;
      node.layoutOptions = {
        ...NON_ROOT_DEFAULT_OPTIONS.layoutOptions,
        ...(node.layoutOptions ?? {}),
      };
    }

    // assign a new ID only if missing
    if (!node.id) {
      node.id = `auto-${counter++}`;  
    }

    // recurse into children
    (node.children || []).forEach((child: any) =>
      recurse(child, node.id)
    );
  }

  recurse(root, "");
  return root;
}
