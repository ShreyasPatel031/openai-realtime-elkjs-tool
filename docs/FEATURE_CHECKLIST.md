# Feature Implementation Checklist

Copy this checklist for each new feature to ensure consistent, fast development.

## Feature: ________________

### Pre-Implementation (15 min)

#### Architecture Enforcement
- [ ] Run `./scripts/check-architecture.sh` - must pass
- [ ] Review `docs/FIGJAM_REFACTOR.md` for feature scope
- [ ] Identify entry point: Canvas/Chat/Toolbar/Keyboard
- [ ] Check for similar existing patterns

#### Test Planning
- [ ] Identify test types needed:
  - [ ] Core functionality (feature works)
  - [ ] Position accuracy (geometry correct) 
  - [ ] Persistence (survives refresh)
  - [ ] Deletion (cleanup works)

### Implementation (Variable time)

#### Test-First Development
- [ ] Copy test pattern from `docs/FEATURE_DEVELOPMENT_TEMPLATE.md`
- [ ] Write failing tests for core functionality
- [ ] Write failing tests for position accuracy (if applicable)
- [ ] Write failing tests for persistence
- [ ] Write failing tests for deletion (if applicable)
- [ ] Run tests - confirm they fail appropriately

#### Entry Point Implementation
- [ ] **Canvas Interaction**: Use `canvasInteractions.ts` pattern
- [ ] **AI/Chat Feature**: Use `userRequirements.ts` pattern
- [ ] **Toolbar Feature**: Use `CanvasToolbar.tsx` pattern  
- [ ] **Keyboard Shortcut**: Use `canvasDeleteInteractions.ts` pattern

#### Core Implementation
- [ ] All operations go through `Orchestrator.apply()`
- [ ] Use proper intent format:
  ```typescript
  {
    source: 'user' | 'ai',
    kind: 'free-structural' | 'ai-structural' | 'geo-only',
    scopeId: string,
    payload: { action: 'your-action', ...params }
  }
  ```
- [ ] No direct `setNodes()` or `setEdges()` calls
- [ ] No ELK fallbacks in FREE mode
- [ ] Renderer reads ONLY from ViewState

### Verification (20 min)

#### Test Verification
- [ ] All tests pass
- [ ] No test flakiness
- [ ] Tests accurately reflect real app behavior
- [ ] No artificial simulations or hacks in tests

#### Architecture Compliance
- [ ] Run `./scripts/check-architecture.sh` - must pass
- [ ] No console errors or warnings
- [ ] No regressions in existing functionality

#### Manual Testing
- [ ] Feature works in browser
- [ ] Persistence works in real app
- [ ] Integrates with existing tools
- [ ] Performance is acceptable

### Integration (10 min)

#### Test Suite Integration
- [ ] Add test to main test suite in `package.json`
- [ ] Verify tests run in CI/pre-push hook
- [ ] All comprehensive tests pass

#### Documentation
- [ ] Update `docs/FEATURE_DEVELOPMENT_TEMPLATE.md` if new patterns
- [ ] Add feature to architecture docs if significant
- [ ] Update entry points documentation if new entry point

### Completion

#### Final Checks
- [ ] Feature complete and working
- [ ] All tests passing
- [ ] Architecture compliant
- [ ] No breaking changes
- [ ] Ready for code review

#### Time Tracking
- **Estimated time**: _____ hours
- **Actual time**: _____ hours  
- **Speedup vs old method**: _____%

---

## Common Issues & Solutions

### ❌ Tests passing but real app broken
**Cause**: Test simulating artificial behavior  
**Solution**: Test real entry points, not mocked behavior

### ❌ Nodes appearing at (0,0)
**Cause**: Missing position in intent payload  
**Solution**: Include `position: { x, y }` and `size: { w, h }` in payload

### ❌ Persistence not working  
**Cause**: Restoration not triggering render  
**Solution**: Ensure `triggerRestorationRender()` called after restore

### ❌ Architecture violations
**Cause**: Direct ReactFlow manipulation or ELK fallbacks  
**Solution**: Use `Orchestrator.apply()` and ViewState-only rendering

### ❌ ViewState corruption
**Cause**: Cloning failures or empty object resets  
**Solution**: Always fallback to previous state, never empty object

---

## Success Metrics

**Target times with template**:
- Simple canvas feature: **1-2 hours**
- Complex interaction: **2-4 hours**
- AI integration: **3-5 hours**

**Quality metrics**:
- Zero architecture violations
- 100% test pass rate
- No manual testing required for basic functionality
- No regressions in existing features




