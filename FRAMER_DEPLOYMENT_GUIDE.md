# 🎯 Framer Deployment Guide
## Complete Pipeline: Local Development → Vercel → Framer Embedding

*Version: 1.0 | Last Updated: August 2025*

---

## 📋 **Overview**

This guide documents the complete pipeline for developing, deploying, and embedding your React architecture generator in Framer. The pipeline ensures seamless integration from local development to production embedding.

### **Pipeline Flow**
```
Local Development → Git Push → Vercel Auto-Deploy → Framer Code Component → Live Website
```

---

## 🏗️ **Architecture Overview**

### **Component Structure**
```
├── FramerEmbeddable.tsx (Entry Point)
├── ApiEndpointProvider (Context for API URLs)
├── InteractiveCanvas (Main UI)
├── StreamViewer (WebSocket Communication)
├── CustomNode/GroupNode (Asset Loading)
└── UMD Build Output (Global Window Variable)
```

### **Key Technologies**
- **React 18** - Component framework
- **Vite** - Build tool and bundler
- **UMD Module Format** - Universal module for browser globals
- **WebSocket/SSE** - Real-time streaming communication
- **Context API** - Prop management for API endpoints
- **Vercel** - Production hosting and CI/CD

---

## ⚡ **What's New: Unified Environment** 
> 🎯 **Major Improvement**: Local development and production environments are now **100% identical**

### **Key Changes Made:**
- ✅ `npm run dev` now builds embeddable component automatically
- ✅ `npm run build` command unified for both local and Vercel
- ✅ Environment variables standardized (see `.env.example`)
- ✅ No more separate configurations for local vs production
- ✅ Eliminated preview vs production environment differences

### **Benefits:**
- 🚫 **No more environment-specific bugs**
- 🔄 **Consistent behavior** across all environments  
- ⚡ **Faster debugging** - what works locally works in production
- 📦 **Single source of truth** for build process

---

## 🛠️ **Unified Development Setup**
> ⚠️ **Important**: Local development and production now use **identical** configurations to prevent environment-specific issues.

### **Environment Requirements**
```bash
Node.js >= 18
npm >= 8
```

### **Environment Variables (Unified for Local & Production)**
Create `.env` file (copy from `.env.example`):
```bash
OPENAI_API_KEY=your_openai_api_key_here
VITE_OPENAI_API_KEY=your_openai_api_key_here  # For Vite builds
```

### **Unified Development Commands**
```bash
# Install dependencies
npm install

# Start unified development server (builds embeddable + starts server)
npm run dev
# This automatically:
# 1. Builds the embeddable component (same as production)
# 2. Starts the development server on localhost:3010
# 3. Ensures local setup matches production exactly

# Build everything for production (same command Vercel uses)
npm run build

# Generate icons and dynamic lists (run after icon changes)
npm run generate-icons && npm run generate-dynamic-lists
```

> 🎯 **Unified Environment**: Local development now uses the **identical** build process as production, eliminating environment-specific issues.

### **Local Testing URL**
- **Main App**: `http://localhost:3010`
- **Embeddable Test**: `http://localhost:3010/dist/embeddable/architecture-generator.umd.js`

---

## 🚀 **Vercel Production Deployment**

### **Automatic Deployment Trigger**
Any push to the `search-vercel` branch automatically triggers:

1. **Install Dependencies** (`npm install`)
2. **Generate Assets** (`npm run generate-icons`)
3. **Create Dynamic Lists** (`npm run generate-dynamic-lists`)
4. **Build Main App** (`vite build`)
5. **Build Embeddable** (`npm run build:embeddable`)

### **Build Configuration**

**package.json scripts:**
```json
{
  "build:vercel": "npm run generate-icons && npm run generate-dynamic-lists && vite build && npm run build:embeddable",
  "build:embeddable": "vite build --config vite.embeddable.config.ts"
}
```

**vite.embeddable.config.ts key settings:**
```typescript
{
  build: {
    lib: {
      entry: 'client/components/FramerEmbeddable.tsx',
      name: 'ArchitectureGenerator',  // Global variable name
      formats: ['umd']  // Universal Module Definition
    },
    rollupOptions: {
      external: ['react', 'react-dom'],  // Don't bundle React
      output: {
        globals: { 'react': 'React' },
        exports: 'named'  // Support both default and named exports
      }
    }
  }
}
```

### **Production URLs**
- **Main Site**: `https://archgen-ecru.vercel.app`
- **Embeddable Component**: `https://archgen-ecru.vercel.app/dist/embeddable/architecture-generator.umd.js`
- **CSS Styles**: `https://archgen-ecru.vercel.app/dist/embeddable/style.css`

---

## 🎨 **Framer Integration**

### **Method 1: Direct URL Import (Recommended)**

1. **Create Code Component** in Framer
2. **Add this code:**

```typescript
// Import directly from your production URL
import { FramerEmbeddable } from "https://archgen-ecru.vercel.app/dist/embeddable/architecture-generator.umd.js"

// Framer Code Component wrapper
export default function ArchitectureGenerator(props) {
  return (
    <FramerEmbeddable 
      apiEndpoint={props.apiEndpoint || "https://archgen-ecru.vercel.app"}
      width={props.width || "100%"}
      height={props.height || "800px"}
    />
  )
}

// Framer property controls
ArchitectureGenerator.defaultProps = {
  width: "100%", 
  height: "800px",
  apiEndpoint: "https://archgen-ecru.vercel.app"
}
```

### **Method 2: Zero-Code Import**

```typescript
// Direct export - no wrapper needed
export { FramerEmbeddable as default } from "https://archgen-ecru.vercel.app/dist/embeddable/architecture-generator.umd.js"
```

### **Framer Property Controls**

The component automatically exposes these controls in Framer's properties panel:

- **API Endpoint**: Text input (default: production URL)
- **Width**: Text input (default: "100%")
- **Height**: Text input (default: "800px")

---

## 🔄 **WebSocket & Real-time Communication**

### **Streaming Architecture**

```
User Input → StreamViewer → StreamExecutor → POST /api/stream → OpenAI API → SSE Response → UI Updates
```

### **Key Components**

**StreamExecutor.ts:**
- Handles POST requests to `/api/stream`
- Manages Server-Sent Events (SSE)
- Supports endpoint configuration via `apiEndpoint` prop

**EventSelectors:**
- Filters and processes streaming events
- Handles function calls and graph updates
- Manages error states and retries

**Connection Recovery:**
- Automatic reconnection on WebSocket failures
- Exponential backoff for failed requests
- User feedback during connection issues

### **API Endpoint Propagation**

The `apiEndpoint` flows through the component hierarchy:

```
FramerEmbeddable (props) 
  → ApiEndpointProvider (context)
    → InteractiveCanvas (consumer)
      → StreamViewer (props)
        → StreamExecutor (options)
          → HTTP requests
```

---

## 🖼️ **Asset Loading & CDN**

### **Icon Management**

**Asset URL Construction:**
```typescript
// Helper function in ApiEndpointContext.tsx
const buildAssetUrl = (path: string, apiEndpoint?: string): string => {
  if (!apiEndpoint) return path; // Fallback to relative
  
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const cleanEndpoint = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
  
  return `${cleanEndpoint}/${cleanPath}`;
}
```

**Usage in Components:**
```typescript
// CustomNode.tsx and GroupNode.tsx
const apiEndpoint = useApiEndpoint();
const iconUrl = buildAssetUrl('/assets/canvas/icon.svg', apiEndpoint);
// Results in: https://archgen-ecru.vercel.app/assets/canvas/icon.svg
```

### **Asset Categories**
- **Canvas Icons**: `/assets/canvas/` - Generic architecture icons
- **Provider Icons**: `/icons/aws/`, `/icons/gcp/`, `/icons/azure/` - Cloud provider specific
- **Generated Icons**: Auto-generated variations with colors

---

## 🔧 **Development Workflow**

### **Making Changes**

1. **Local Development**:
   ```bash
   npm run dev  # Start local server
   # Make your changes
   npm run build:embeddable  # Test embeddable locally
   ```

2. **Test Locally**:
   - Verify main app works: `http://localhost:3010`
   - Test embeddable: Check UMD file loads correctly

3. **Deploy to Production**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin search-vercel  # Triggers Vercel deployment
   ```

4. **Verify in Framer**:
   - Framer automatically uses the latest deployed version
   - Test the embed in your Framer project

### **Troubleshooting Common Issues**

**Issue: Component not loading in Framer**
- ✅ Check: `https://archgen-ecru.vercel.app/dist/embeddable/architecture-generator.umd.js`
- ✅ Verify: UMD file returns valid JavaScript
- ✅ Test: Browser console for import errors

**Issue: Icons not loading**
- ✅ Check: `apiEndpoint` prop is correctly passed
- ✅ Verify: `buildAssetUrl` helper is constructing full URLs
- ✅ Test: Asset URLs resolve correctly

**Issue: API calls failing**
- ✅ Check: Environment variables in Vercel dashboard
- ✅ Verify: `OPENAI_API_KEY` is set correctly
- ✅ Test: Direct API endpoint responds

---

## 📚 **File Structure Reference**

### **Key Files for Embedding**

```
├── client/
│   ├── components/
│   │   ├── FramerEmbeddable.tsx      # 🎯 Main embeddable component
│   │   ├── CustomNode.tsx            # Icon loading logic
│   │   └── GroupNode.tsx             # Icon loading logic
│   ├── contexts/
│   │   └── ApiEndpointContext.tsx    # 🔗 API endpoint management
│   └── reasoning/
│       └── StreamExecutor.ts         # 📡 WebSocket communication
├── vite.embeddable.config.ts         # 🛠️ UMD build configuration
├── package.json                      # 📋 Build scripts
└── dist/embeddable/                  # 📦 Build output
    ├── architecture-generator.umd.js  # 🎯 Framer import file
    └── style.css                     # 🎨 Component styles
```

### **Build Scripts Reference**

```json
{
  "dev": "node --loader ts-node/esm server/server.js --dev",
  "build:vercel": "npm run generate-icons && npm run generate-dynamic-lists && vite build && npm run build:embeddable",
  "build:embeddable": "vite build --config vite.embeddable.config.ts",
  "generate-icons": "tsx client/scripts/generateIconList.ts",
  "generate-dynamic-lists": "node scripts/generateDynamicLists.cjs"
}
```

---

## ✅ **Testing Checklist**

### **Before Each Deployment**

**Local Testing:**
- [ ] `npm run dev` starts successfully
- [ ] Main app loads at `localhost:3010`
- [ ] WebSocket connections work
- [ ] Icons load correctly
- [ ] `npm run build:embeddable` completes successfully

**Production Testing:**
- [ ] Vercel deployment succeeds
- [ ] Main site loads: `https://archgen-ecru.vercel.app`
- [ ] UMD file accessible: `https://archgen-ecru.vercel.app/dist/embeddable/architecture-generator.umd.js`
- [ ] Assets load from CDN

**Framer Testing:**
- [ ] Code Component imports successfully
- [ ] Component renders in Framer
- [ ] Property controls work
- [ ] API calls function correctly
- [ ] Icons display properly

---

## 🎯 **Success Metrics**

### **What "Working" Means**

1. **Local Development**: 
   - Server starts on port 3010
   - WebSocket streaming works
   - All icons load correctly

2. **Vercel Production**:
   - Build completes without errors
   - Main site responds to requests
   - UMD file is generated and accessible
   - Environment variables are configured

3. **Framer Integration**:
   - Component imports without errors
   - Real-time architecture generation works
   - Property controls function
   - Visual styling matches main site

### **Performance Targets**

- **Bundle Size**: UMD file < 2MB gzipped
- **Load Time**: Component initialization < 3 seconds
- **Streaming**: Real-time response to user inputs
- **Error Rate**: < 1% API call failures

---

## 🔄 **Update Process**

### **Automatic Updates**

Framer automatically receives updates when you:
1. Push changes to `search-vercel` branch
2. Vercel rebuilds and deploys
3. New UMD file is available at the same URL
4. Framer uses the updated version immediately

### **Manual Updates**

If you need to update the Framer URL:
1. Copy new URL from Vercel deployment
2. Update the import statement in Framer
3. Republish your Framer site

---

## 📞 **Support & Troubleshooting**

### **Common Commands**

```bash
# Reset everything
npm run clean && npm install && npm run build:embeddable

# Debug local server
npm run dev -- --debug

# Check build output
ls -la dist/embeddable/

# Test UMD file locally
python3 -m http.server 8000
# Visit: http://localhost:8000/dist/embeddable/architecture-generator.umd.js
```

### **Log Files**

Check these for debugging:
- Vercel deployment logs (Vercel dashboard)
- Browser developer console (Network tab)
- Local server console output

---

**🎉 Your architecture generator is now production-ready and embeddable in Framer!**

*This pipeline ensures that every change flows seamlessly from development to live embedding.* 