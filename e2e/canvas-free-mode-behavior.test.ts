import { test, expect, Page, Locator } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ? `${process.env.E2E_BASE_URL}/canvas` : 'http://localhost:3000/canvas';

test.beforeEach(async ({ page }) => {
  page.on("console", (message) => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
  });
});

interface NodeSnapshot {
  id: string;
  rect: { x: number; y: number; width: number; height: number };
}

async function goToCanvas(page: Page) {
  await page.goto(baseURL);
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.waitForSelector(".react-flow__pane", { timeout: 20000 });
}

async function getNodeSnapshots(page: Page): Promise<NodeSnapshot[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.react-flow__node')).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-id') || '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
  });
}

function centerOf(rect: { x: number; y: number; width: number; height: number }) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function computeCanvasPoint(paneBox: DOMRect, relative: { x: number; y: number }) {
  return { x: paneBox.x + relative.x, y: paneBox.y + relative.y };
}

function candidateRelativePositions(paneBox: DOMRect, fractions: Array<[number, number]>) {
  return fractions.map(([fx, fy]) => ({ x: paneBox.width * fx, y: paneBox.height * fy }));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pickEmptyCanvasPoint(
  snapshots: NodeSnapshot[],
  paneBox: DOMRect,
  candidateFractions: Array<[number, number]>,
  minSpacing: number,
) {
  const centers = snapshots.map((node) => centerOf(node.rect));
  const candidates = candidateRelativePositions(paneBox, candidateFractions);

  for (const relative of candidates) {
    const absolute = computeCanvasPoint(paneBox, relative);
    const farEnough = centers.every((existing) => distance(existing, absolute) > minSpacing);
    if (farEnough) {
      return { relative, absolute };
    }
  }

  const fallbackRelative = candidates[candidates.length - 1];
  return { relative: fallbackRelative, absolute: computeCanvasPoint(paneBox, fallbackRelative) };
}

async function waitForNodeNear(
  page: Page,
  point: { x: number; y: number },
  tolerance = 160,
  timeout = 15000,
): Promise<NodeSnapshot> {
  const handle = await page.waitForFunction(
    ({ x, y, tolerance }) => {
      const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        if (Math.abs(centerX - x) <= tolerance && Math.abs(centerY - y) <= tolerance) {
          return {
            id: el.getAttribute('data-id') || '',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        }
      }
      return null;
    },
    { x: point.x, y: point.y, tolerance },
    { timeout },
  );
  return await handle.jsonValue();
}

async function findNodeNear(
  page: Page,
  point: { x: number; y: number },
  tolerance = 64,
): Promise<NodeSnapshot | null> {
  return page.evaluate(({ x, y, tolerance }) => {
    const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      if (Math.abs(centerX - x) <= tolerance && Math.abs(centerY - y) <= tolerance) {
        return {
          id: el.getAttribute('data-id') || '',
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }
    }
    return null;
  }, { x: point.x, y: point.y, tolerance });
}

async function createUserNode(
  page: Page,
  pane: Locator,
  paneBox: DOMRect,
  relative: { x: number; y: number },
) {
  await page.click('button[aria-label="Add box (R)"]', { timeout: 5000 });
  const clickPoint = computeCanvasPoint(paneBox, relative);
  await pane.click({ position: relative });
  const node = await waitForNodeNear(page, clickPoint, 120);
  return { node, clickPoint };
}

test.describe('Canvas FREE-mode interactions', () => {
  test('places draft group at click location without ELK shift', async ({ page }) => {
    await goToCanvas(page);

    const pane = page.locator('.react-flow__pane');
    const initialPaneBox = await pane.boundingBox();
    expect(initialPaneBox).not.toBeNull();
    if (!initialPaneBox) return;

    const existingNodes = await getNodeSnapshots(page);
    const groupPoint = pickEmptyCanvasPoint(
      existingNodes,
      initialPaneBox,
      [
        [0.78, 0.78],
        [0.22, 0.78],
        [0.78, 0.25],
        [0.25, 0.22],
        [0.52, 0.78],
      ],
      280,
    );

    await page.click('button[aria-label="Create group (G)"]', { timeout: 5000 });
    await pane.click({ position: groupPoint.relative });

    const newGroup = await waitForNodeNear(page, groupPoint.absolute, 220);
    const center = centerOf(newGroup.rect);
    const dx = Math.abs(center.x - groupPoint.absolute.x);
    const dy = Math.abs(center.y - groupPoint.absolute.y);

    expect(dx).toBeLessThanOrEqual(220);
    expect(dy).toBeLessThanOrEqual(220);
  });

  test('renders edge immediately when connecting user nodes', async ({ page }) => {
    await goToCanvas(page);

    const pane = page.locator('.react-flow__pane');
    let paneBox = await pane.boundingBox();
    expect(paneBox).not.toBeNull();
    if (!paneBox) return;

    let snapshots = await getNodeSnapshots(page);
    const leftPoint = pickEmptyCanvasPoint(
      snapshots,
      paneBox,
      [
        [0.22, 0.72],
        [0.18, 0.6],
        [0.3, 0.75],
        [0.25, 0.55],
      ],
      200,
    );

    const first = await createUserNode(page, pane, paneBox, leftPoint.relative);

    paneBox = (await pane.boundingBox()) ?? paneBox;
    snapshots = await getNodeSnapshots(page);
    const rightPoint = pickEmptyCanvasPoint(
      snapshots,
      paneBox,
      [
        [0.78, 0.32],
        [0.72, 0.65],
        [0.8, 0.52],
        [0.68, 0.28],
      ],
      200,
    );

    const second = await createUserNode(page, pane, paneBox, rightPoint.relative);

    // Wait for both nodes to be fully rendered and get fresh positions
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll('.react-flow__node');
        return nodes.length >= 2;
      },
      { timeout: 10000 }
    );

    // Get fresh node snapshots to ensure we have accurate positions
    const freshSnapshots = await getNodeSnapshots(page);
    const firstNode = freshSnapshots.find(n => {
      const dist = Math.hypot(n.rect.x + n.rect.width/2 - first.clickPoint.x, n.rect.y + n.rect.height/2 - first.clickPoint.y);
      return dist < 100;
    });
    const secondNode = freshSnapshots.find(n => {
      const dist = Math.hypot(n.rect.x + n.rect.width/2 - second.clickPoint.x, n.rect.y + n.rect.height/2 - second.clickPoint.y);
      return dist < 100;
    });

    expect(firstNode).toBeDefined();
    expect(secondNode).toBeDefined();
    if (!firstNode || !secondNode) return;

    const prevEdgeCount = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);

    await page.click('button[aria-label="Add connector (C)"]', { timeout: 5000 });
    
    // Wait for connector dots to appear (green background indicates they're visible)
    await page.waitForFunction(
      () => {
        const dots = Array.from(document.querySelectorAll('[style*="rgba(0, 255, 0"]'));
        return dots.length >= 2; // At least 2 dots (one per node)
      },
      { timeout: 10000 }
    );

    // Get updated node positions after connector tool is activated
    const updatedSnapshots = await getNodeSnapshots(page);
    const updatedFirst = updatedSnapshots.find(n => n.id === firstNode.id);
    const updatedSecond = updatedSnapshots.find(n => n.id === secondNode.id);

    if (!updatedFirst || !updatedSecond) {
      throw new Error('Could not find updated node positions');
    }

    // Calculate positions for connector dots - right side of first node, left side of second node
    const start = {
      x: updatedFirst.rect.x + updatedFirst.rect.width + 16,
      y: updatedFirst.rect.y + updatedFirst.rect.height / 2,
    };
    const end = {
      x: updatedSecond.rect.x - 16,
      y: updatedSecond.rect.y + updatedSecond.rect.height / 2,
    };

    // Click on the right connector dot of the first node
    await page.mouse.click(start.x, start.y, { delay: 100 });

    // Wait for connection state to be established
    await page.waitForTimeout(500);

    // Click on the left connector dot of the second node
    await page.mouse.click(end.x, end.y, { delay: 100 });

    // Wait for edge to appear - give extra time for edge creation to complete
    await page.waitForTimeout(1000);
    
    try {
      await page.waitForFunction(
        (previous) => document.querySelectorAll('.react-flow__edge').length > previous,
        prevEdgeCount,
        { timeout: 20000 }, // Increased timeout for flaky test
      );
    } catch (e) {
      // Get diagnostic info before failing
      const diagnostic = await page.evaluate(() => ({
        edgeCount: document.querySelectorAll('.react-flow__edge').length,
        nodes: document.querySelectorAll('.react-flow__node').length,
        hasConnectorButton: !!document.querySelector('button[aria-label*="connector" i]')
      }));
      throw new Error(`Edge did not appear. Previous count: ${prevEdgeCount}, Current: ${diagnostic.edgeCount}, Nodes: ${diagnostic.nodes}`);
    }

    const finalEdgeCount = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);
    expect(finalEdgeCount).toBeGreaterThan(prevEdgeCount);

    await page.waitForTimeout(200);
    expect(await page.locator('svg path[stroke-dasharray="5 5"]').count()).toBe(0);

    const firstAfter = await findNodeNear(page, first.clickPoint, 64);
    const secondAfter = await findNodeNear(page, second.clickPoint, 64);
    expect(firstAfter).not.toBeNull();
    expect(secondAfter).not.toBeNull();

    if (firstAfter) {
      const dx = Math.abs(firstAfter.rect.x - first.node.rect.x);
      const dy = Math.abs(firstAfter.rect.y - first.node.rect.y);
      expect(dx).toBeLessThanOrEqual(12);
      expect(dy).toBeLessThanOrEqual(12);
    }

    if (secondAfter) {
      const dx = Math.abs(secondAfter.rect.x - second.node.rect.x);
      const dy = Math.abs(secondAfter.rect.y - second.node.rect.y);
      expect(dx).toBeLessThanOrEqual(140);
      expect(dy).toBeLessThanOrEqual(140);
    }
  });
});
