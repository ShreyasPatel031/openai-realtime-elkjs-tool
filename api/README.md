# API Directory

## 🎯 Purpose
This directory contains API endpoint handlers that are shared between:
- **Local development** (via `server/server.js` imports)
- **Vercel production** (via automatic serverless function routing)

## ⚠️ IMPORTANT: API Development Guidelines

### ✅ DO:
1. **Create all new API endpoints in this `/api/` directory**
2. **Export a default function** that handles the request/response
3. **Use consistent error handling** across all endpoints
4. **Test locally first** before deploying to Vercel

### ❌ DON'T:
1. **Never add API logic directly to `server/server.js`**
2. **Don't duplicate logic** between local and production environments
3. **Don't create environment-specific endpoints** (unless absolutely necessary)

## 📁 File Structure
```
/api/
├── README.md              # This file
├── agentConfig.ts         # Model configurations
├── embed.ts              # Text embedding API
├── generateChatName.ts   # AI-powered architecture naming
├── stream.ts             # OpenAI streaming completions
└── toolCatalog.js        # Available function tools
```

## 🔧 How to Add New API Endpoints

### 1. Create the API file
```typescript
// /api/myNewEndpoint.ts
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Your API logic here
    const result = await processRequest(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
```

### 2. Add to local server
```javascript
// In server/server.js
const myNewEndpointHandler = (await import('../api/myNewEndpoint.ts')).default;
app.post("/api/myNewEndpoint", myNewEndpointHandler);
```

### 3. Test locally
```bash
npm run dev
# Test your endpoint at http://localhost:3000/api/myNewEndpoint
```

### 4. Deploy to Vercel
Vercel automatically creates serverless functions from `/api/` files.

## 🎯 Benefits of This Approach

✅ **Consistency**: Local and production behave identically  
✅ **Single Source of Truth**: One implementation for all environments  
✅ **Easy Testing**: Test locally with confidence it'll work in production  
✅ **Maintainability**: No environment-specific bugs or drift  
✅ **Type Safety**: Shared TypeScript definitions  

## 🚨 Emergency Debugging

If you see different behavior between local and production:

1. **Check `server/server.js`** - ensure it imports from `/api/` 
2. **Verify no duplicate logic** exists in server.js
3. **Test the actual `/api/` file** in isolation
4. **Check environment variables** are consistent

---

**Remember**: When in doubt, always put it in `/api/` ! 🎯
