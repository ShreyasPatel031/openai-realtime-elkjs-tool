#!/usr/bin/env node

/**
 * Pre-compute icon embeddings at build time for fast icon fallback
 * This script generates embeddings for all available icons and creates similarity mappings
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const envPath = path.join(__dirname, '..', '.env');

// Simple .env file loader with proper quote handling
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=').trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key.trim()] = value;
      }
    }
  });
  console.log('✅ Loaded .env file for icon embeddings');
  console.log('API Key loaded:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
} else {
  console.log('⚠️ No .env file found');
}

const OUTPUT_PATH = 'client/generated/precomputed-icon-embeddings.json';

// Import icon lists
const ICON_LISTS_PATH = 'client/generated/iconLists.ts';

function parseIconLists() {
  if (!fs.existsSync(ICON_LISTS_PATH)) {
    console.error('❌ iconLists.ts not found. Run generate-icons first.');
    process.exit(1);
  }
  
  const content = fs.readFileSync(ICON_LISTS_PATH, 'utf-8');
  
  // Extract the iconLists object using a more robust approach
  const startMatch = content.match(/export const iconLists: IconLists = {/);
  if (!startMatch) {
    console.error('❌ Could not find iconLists export in file');
    process.exit(1);
  }
  
  const startIndex = startMatch.index + startMatch[0].length;
  let braceCount = 1;
  let endIndex = startIndex;
  
  // Find the matching closing brace
  for (let i = startIndex; i < content.length && braceCount > 0; i++) {
    if (content[i] === '{') braceCount++;
    else if (content[i] === '}') braceCount--;
    endIndex = i;
  }
  
  if (braceCount > 0) {
    console.error('❌ Could not find closing brace for iconLists');
    process.exit(1);
  }
  
  let objectStr = content.substring(startIndex, endIndex);
  
  // Convert to JSON-like format
  objectStr = objectStr.replace(/(\w+):\s*{/g, '"$1": {');
  objectStr = objectStr.replace(/(\w+):\s*\[/g, '"$1": [');
  objectStr = objectStr.replace(/'/g, '"');
  objectStr = objectStr.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
  
  try {
    return JSON.parse('{' + objectStr + '}');
  } catch (error) {
    console.error('❌ Failed to parse icon lists:', error);
    console.error('Parsed content preview:', objectStr.substring(0, 500));
    process.exit(1);
  }
}

function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

async function precomputeIconEmbeddings() {
  console.log('🎨 Pre-computing icon embeddings at build time...');
  
  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.VITE_OPENAI_API_KEY) {
    console.log('⚠️  No OpenAI API key found, skipping icon embedding pre-computation');
    // Create empty file so runtime doesn't crash
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ embeddings: {}, similarities: {} }));
    return;
  }
  
  console.log('✅ OpenAI API key found, proceeding with icon embedding pre-computation');
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
  });
  
  try {
    // Parse icon lists
    console.log('📋 Loading icon lists...');
    const iconLists = parseIconLists();
    
    // Collect all icons with their provider prefixes
    const allIcons = [];
    console.log('📦 Icon lists structure:', Object.keys(iconLists));
    
    for (const [provider, categories] of Object.entries(iconLists)) {
      if (provider === 'generic' || provider === 'all') {
        // Skip generic and all arrays
        continue;
      }
      
      console.log(`📋 Processing provider: ${provider}, categories:`, Object.keys(categories || {}));
      
      if (categories && typeof categories === 'object') {
        for (const [category, icons] of Object.entries(categories)) {
          if (Array.isArray(icons)) {
            icons.forEach(icon => {
              allIcons.push({
                provider,
                category,
                name: icon,
                fullName: `${provider}_${icon}`,
                searchText: icon.replace(/_/g, ' ') // Convert underscores to spaces for better embedding
              });
            });
          } else {
            console.warn(`⚠️ Category ${category} in ${provider} is not an array:`, typeof icons);
          }
        }
      } else {
        console.warn(`⚠️ Provider ${provider} categories is not an object:`, typeof categories);
      }
    }
    
    console.log(`🔍 Found ${allIcons.length} total icons across all providers`);
    
    // Generate embeddings for all icons
    const embeddings = {};
    const batchSize = 50; // Conservative batch size
    
    console.log('🚀 Computing embeddings in batches...');
    
    for (let i = 0; i < allIcons.length; i += batchSize) {
      const batch = allIcons.slice(i, i + batchSize);
      const batchTexts = batch.map(icon => icon.searchText);
      
      console.log(`⚡ Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allIcons.length/batchSize)} (${batch.length} icons)`);
      
      try {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batchTexts,
        });
        
        batch.forEach((icon, index) => {
          embeddings[icon.name] = response.data[index].embedding;
        });
        
        // Small delay between batches
        if (i + batchSize < allIcons.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`❌ Batch failed, processing individually:`, error.message);
        
        // Fallback to individual processing
        for (const icon of batch) {
          try {
            const response = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: icon.searchText,
            });
            embeddings[icon.name] = response.data[0].embedding;
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.warn(`⚠️  Skipping ${icon.fullName}:`, error.message);
          }
        }
      }
    }
    
    console.log('🔗 Computing similarity mappings...');
    
    // Pre-compute similarity mappings for faster lookup
    const similarities = {};
    const providers = Object.keys(iconLists);
    
    for (const provider of providers) {
      similarities[provider] = {};
      const providerIcons = allIcons.filter(icon => icon.provider === provider);
      
      console.log(`📊 Computing ${providerIcons.length * providerIcons.length} similarities for ${provider}...`);
      
      for (const iconA of providerIcons) {
        if (!embeddings[iconA.name]) continue;
        
        similarities[provider][iconA.name] = {};
        
        for (const iconB of providerIcons) {
          if (!embeddings[iconB.name] || iconA.name === iconB.name) continue;
          
          const similarity = cosineSimilarity(embeddings[iconA.name], embeddings[iconB.name]);
          similarities[provider][iconA.name][iconB.name] = similarity;
        }
      }
    }
    
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write precomputed data
    const output = {
      embeddings,
      similarities,
      generatedAt: new Date().toISOString(),
      iconCount: Object.keys(embeddings).length,
      providers: providers
    };
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`✅ Pre-computed ${Object.keys(embeddings).length} icon embeddings and similarities`);
    console.log(`📁 Saved to ${OUTPUT_PATH}`);
    
  } catch (error) {
    console.error('❌ Failed to pre-compute icon embeddings:', error);
    process.exit(1);
  }
}

precomputeIconEmbeddings();
