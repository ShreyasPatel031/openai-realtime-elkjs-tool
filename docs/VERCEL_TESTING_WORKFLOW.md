# Vercel Testing & Deployment Workflow

This document outlines the comprehensive testing and deployment workflow for the Atelier project on Vercel.

## 🚨 **IMPORTANT RULES**
1. **NEVER deploy directly to production using `vercel --prod`**
2. **All pushes are automatically tested on live Vercel preview**
3. **Cannot bypass tests with `--no-verify` - protection is enforced**
4. **Manual promotion to production only after tests pass**

## Overview

The workflow ensures that both **end-to-end functionality** and **fallback mechanisms** work correctly in production before any deployment is promoted from preview to production.

## Available Commands

### Development & Testing
```bash
# Deploy to Vercel preview
npm run deploy:preview

# Test the latest Vercel preview deployment
npm run test:vercel-preview

# Deploy to preview AND run tests automatically
npm run deploy:test-preview

# Run production promotion workflow (tests + promotion guidance)
npm run promote:production
```

### Manual Commands
```bash
# Deploy to preview only
vercel

# Deploy to production (ONLY after tests pass)
vercel --prod
```

## Testing Suite

The testing suite (`scripts/test-vercel-preview.js`) performs comprehensive checks:

### 🏥 **Health Checks**
- **API Health**: Tests all critical endpoints (`/api/simple-agent`, `/api/embed`, `/api/generateChatName`)
- **Static Assets**: Verifies critical files are served correctly (`precomputed-icon-embeddings.json`)

### 🔄 **End-to-End Testing**
- **Architecture Generation**: Tests complete flow from user input to architecture output
- **Response Validation**: Ensures API returns valid architecture data with components
- **Component Counting**: Verifies generated architectures have actual content

### 🔧 **Fallback Mechanism Testing**
- **Embedding Availability**: Confirms icon embedding file is accessible
- **Embedding Structure**: Validates embedding data format and content
- **Fallback Functionality**: Tests system behavior with non-standard icon requests

## Workflow Steps

### 1. One-Time Setup
```bash
# Set up git hooks and push protection (run once)
npm run setup:git-hooks
```

### 2. Development
```bash
# Make your changes locally
# Test locally with: npm run dev
# Commit your changes: git commit -m "your message"
```

### 3. Protected Push (Automatic Testing)
```bash
# Push with automatic Vercel preview testing
git push

# This automatically:
# 1. Deploys to Vercel preview
# 2. Waits for deployment to be ready
# 3. Runs comprehensive tests on live preview
# 4. Blocks push if any tests fail
# 5. Allows push only if all tests pass
```

### 4. Review Test Results
During push, you'll see:
- ✅ **ALL TESTS PASSED**: Push allowed, ready for production
- ❌ **TESTS FAILED**: Push blocked, fix issues and try again

### 5. Production Promotion (Only after successful push)
```bash
# Run the promotion workflow
npm run promote:production

# If satisfied with preview, manually promote:
vercel --prod
```

## Test Results Interpretation

### ✅ **All Tests Passed**
```
🎉 ALL TESTS PASSED - READY FOR PRODUCTION PROMOTION
✅ Preview URL: https://atelier-xxxxx-shreyaspatel031s-projects.vercel.app
This deployment can be safely promoted to production.
```
**Action**: Safe to promote to production

### ❌ **Some Tests Failed**
```
❌ SOME TESTS FAILED - DO NOT PROMOTE TO PRODUCTION
Fix the failing tests before promoting to production.
```
**Action**: Fix issues and redeploy to preview

## Common Issues & Solutions

### API Health Failures
- **Symptom**: API returning HTML instead of JSON
- **Cause**: Routing issues in `vercel.json`
- **Solution**: Check API route configuration

### Static Asset Failures
- **Symptom**: `precomputed-icon-embeddings.json` returns 404
- **Cause**: Build process not copying files correctly
- **Solution**: Check `copy-embeddings` script in build process

### End-to-End Failures
- **Symptom**: Architecture generation fails or returns empty results
- **Cause**: Agent configuration or OpenAI API issues
- **Solution**: Check agent configuration and API keys

### Fallback Mechanism Failures
- **Symptom**: Icon fallback not working
- **Cause**: Embedding file missing or corrupted
- **Solution**: Regenerate embeddings with `npm run precompute-icon-embeddings`

## File Structure

```
scripts/
├── test-vercel-preview.js      # Main testing suite
├── promote-to-production.js    # Production promotion workflow
└── precompute-icon-embeddings.js  # Embedding generation

package.json                    # NPM scripts
docs/
└── VERCEL_TESTING_WORKFLOW.md # This document
```

## Security & Best Practices

1. **Never bypass tests**: Always run the full test suite before production
2. **Preview first**: Always deploy to preview before production
3. **Monitor results**: Check test output carefully for any warnings
4. **Rollback plan**: Keep previous working production deployment info for quick rollback

## Troubleshooting

### Test Suite Not Finding Preview URL
```bash
# Check available deployments
vercel ls

# Manually specify URL in test if needed
PREVIEW_URL=https://your-preview-url npm run test:vercel-preview
```

### Tests Timing Out
- Increase timeout values in test script
- Check if APIs are responding slowly
- Verify network connectivity

### False Positives/Negatives
- Review test logic in `scripts/test-vercel-preview.js`
- Add more specific validation criteria
- Update test expectations based on API changes

---

## Summary

This workflow ensures that:
1. **No broken deployments reach production**
2. **Both end-to-end and fallback systems work correctly**
3. **All critical functionality is validated before promotion**
4. **Clear feedback is provided on what needs fixing**

Always follow the workflow: **Develop → Preview → Test → Promote**
