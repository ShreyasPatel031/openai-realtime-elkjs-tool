import { useEffect } from 'react';
import { useReactFlow } from 'reactflow';

// const DebugGeometry = () => {
//   const rf = useReactFlow();

//   useEffect(() => {
//     /** wait for RF to mount everything */
//     const timer = setTimeout(() => {
//       const edge = rf.getEdges().find(e => e.id === 'e1');
//       if (!edge) {
//         console.log('[🔍 DOM] No edge with id e1 found');
//         return;
//       }

//       console.log('[🔍 DOM] Found edge:', edge);

//       const srcHandle = document.querySelector(
//         `[data-id="${edge.source}__${edge.sourceHandle}"]`
//       ) as HTMLElement | null;

//       const tgtHandle = document.querySelector(
//         `[data-id="${edge.target}__${edge.targetHandle}"]`
//       ) as HTMLElement | null;

//       const srcNodeEl = document.querySelector(`[id="node-${edge.source}"]`);
//       const tgtNodeEl = document.querySelector(`[id="node-${edge.target}"]`);

//       console.log('[🔍 DOM]', {
//         edgeId: edge.id,
//         source: edge.source,
//         target: edge.target,
//         srcHandle: srcHandle?.getBoundingClientRect(),
//         tgtHandle: tgtHandle?.getBoundingClientRect(),
//         srcNode: srcNodeEl?.getBoundingClientRect(),
//         tgtNode: tgtNodeEl?.getBoundingClientRect(),
//       });
//     }, 1000); // Wait 1 second for everything to be mounted

//     return () => clearTimeout(timer);
//   }, [rf]);

//   return null;   // invisible helper
// };

// export default DebugGeometry; 