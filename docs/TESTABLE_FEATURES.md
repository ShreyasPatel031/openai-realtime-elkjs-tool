# Testable Features Right Now

## ✅ Ready to Test (No Code Changes Needed)

### 1. Arrange Button Toggle Behavior
**What to test:**
- Click arrange button on a group → should toggle FREE ↔ LOCK
- When LOCK: button turns blue, ELK runs automatically
- When FREE: button is gray, manual positioning works
- Move items inside a LOCK group → should automatically change to FREE

**How to test:**
1. Create a group with some nodes
2. Click the arrange button (should turn blue, ELK runs)
3. Try to move a node inside the group (should change back to FREE)
4. Click arrange again (should toggle back to LOCK)

**Expected:** Button always visible, toggles mode, visual feedback (blue = LOCK)

---

### 2. Root Cannot Be LOCK
**What to test:**
- Root group should never be able to be set to LOCK mode
- Any attempt to lock root should fail or be prevented

**How to test:**
1. Try to set root to LOCK mode (if there's a UI for it)
2. Check that root always stays FREE
3. Verify code prevents `mode: 'LOCK'` on root

**Expected:** Root always FREE, cannot be locked

---

### 3. Mode Persistence (Save/Load)
**What to test:**
- Create groups, set some to LOCK mode
- Save the architecture
- Reload/reopen the architecture
- Verify groups still have their correct mode (FREE/LOCK)

**How to test:**
1. Create multiple groups
2. Set some to LOCK (click arrange button)
3. Save the architecture
4. Reload the page or open in new tab
5. Check that groups still have correct mode

**Expected:** Mode persists across save/load

**Files to check:**
- `client/services/architectureService.ts` - verify `mode` field in `rawGraph` is saved
- `client/components/ui/InteractiveCanvas.tsx` - verify mode is restored on load

---

### 4. Source Metadata Cleanup
**What to test:**
- Save an architecture
- Check saved data - should NOT contain `source`, `createdBy`, or origin metadata
- Reload - should work without origin metadata

**How to test:**
1. Create architecture (via AI or manual)
2. Save it
3. Inspect saved data (Firebase console or export JSON)
4. Verify no `source` or `createdBy` fields exist
5. Reload - should work fine

**Expected:** No origin metadata in saved data

**Files to check:**
- `client/services/architectureService.ts` - `cleanFirestoreData()` method
- `client/components/graph/mutations.ts` - ensure mutations don't add source metadata

---

### 5. Block Resize in LOCK Mode (UI)
**What to test:**
- When group is LOCK mode, resize handles should be disabled or hidden
- When group is FREE mode, resize should work

**How to test:**
1. Create a group, set to LOCK (arrange button blue)
2. Try to resize the group - should be disabled/hidden
3. Set to FREE (arrange button gray)
4. Try to resize - should work

**Expected:** Resize disabled in LOCK, enabled in FREE

**Files to check:**
- `client/components/node/DraftGroupNode.tsx` - resize handle rendering

---

## 🔧 Needs Code Changes (But Can Test After)

### 6. Group Mode Toggle UI Component
**What to build:**
- Dedicated FREE/LOCK toggle component
- Add to group selection UI (context menu or sidebar)
- Disable for root group

**How to test after building:**
1. Select a group
2. Toggle mode using new component
3. Verify mode changes persist
4. Try to toggle root - should be disabled

**Files to create:**
- `client/components/ui/GroupModeToggle.tsx`

---

### 7. Fix Arrange Button Visibility
**What to fix:**
- Remove code that hides arrange button in LOCK mode
- Button should always be visible (it's the toggle mechanism)

**Current issue:**
- `client/components/node/DraftGroupNode.tsx` lines 390-395 hide button in LOCK mode
- Should always be visible, just blue when LOCK

**How to test after fix:**
1. Set group to LOCK mode
2. Verify arrange button is still visible (just blue)
3. Click it - should toggle back to FREE

---

## 🧪 Testing Checklist

### Quick Smoke Tests
- [ ] Arrange button toggles FREE ↔ LOCK
- [ ] Button turns blue when LOCK
- [ ] Moving items in LOCK group changes to FREE
- [ ] Root cannot be locked
- [ ] Mode persists after save/reload

### Data Integrity Tests
- [ ] No `source` field in saved data
- [ ] No `createdBy` field in saved data
- [ ] `mode` field exists in saved `rawGraph`
- [ ] `mode` field restored on load

### UI Behavior Tests
- [ ] Arrange button always visible (not hidden in LOCK)
- [ ] Resize disabled in LOCK mode
- [ ] Visual feedback clear (blue = LOCK, gray = FREE)

---

## 📝 Test Results Template

```
Test Date: [date]
Tester: [name]

Arrange Button:
- [ ] Toggle works
- [ ] Blue when LOCK
- [ ] Gray when FREE
- [ ] Always visible

Mode Persistence:
- [ ] Saves correctly
- [ ] Loads correctly
- [ ] Root stays FREE

Source Metadata:
- [ ] No source field
- [ ] No createdBy field
- [ ] Loads without metadata

Resize in LOCK:
- [ ] Disabled in LOCK
- [ ] Enabled in FREE

Issues Found:
[list any bugs or unexpected behavior]
```

---

## 🐛 Known Issues to Verify

1. **Arrange button hidden in LOCK mode** (line 390-395 in DraftGroupNode.tsx)
   - Should be removed - button should always be visible

2. **Mode persistence** - Need to verify `mode` field is actually saved/loaded
   - Check `architectureService.ts` save/load methods

3. **Source metadata** - Need to audit if any mutations add `source` field
   - Check all mutation call sites



