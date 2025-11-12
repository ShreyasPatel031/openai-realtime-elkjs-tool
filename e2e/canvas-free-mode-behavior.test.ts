import { test, expect, Page, Locator } from "@playwright/test";

interface NodeSnapshot {
  id: string;
  rect: { x: number; y: number; width: number; height: number };
}

async function goToCanvas(page: Page) {
  await page.goto("http://localhost:3000");
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

    const prevEdgeCount = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);

    await page.click('button[aria-label="Add connector (C)"]', { timeout: 5000 });
    await page.waitForSelector('[data-connector-dot], [style*="rgba(0, 255, 0"]', { timeout: 10000 });

    const start = {
      x: first.node.rect.x + first.node.rect.width + 16,
      y: first.node.rect.y + first.node.rect.height / 2,
    };
    const end = {
      x: second.node.rect.x - 16,
      y: second.node.rect.y + second.node.rect.height / 2,
    };

    await page.mouse.click(start.x, start.y);
    await page.mouse.click(end.x, end.y);

    await page.waitForFunction(
      (previous) => document.querySelectorAll('.react-flow__edge').length > previous,
      prevEdgeCount,
      { timeout: 15000 },
    );

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
