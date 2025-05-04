  if (sourceHandle && targetHandle) {
    edges.push({ /* ... */ });
  } else {
    console.warn("[RF-convert] edge skipped – handle not found", {
      edgeId,
      sourceNodeId,
      targetNodeId,
      sourceHandle,
      targetHandle
    });
  } 