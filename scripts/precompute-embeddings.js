#!/usr/bin/env node

/**
 * Pre-compute embeddings at build time to eliminate runtime delays
 * This script processes the architecture CSV and generates embeddings for all entries
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

// Simple .env file loader
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  console.log('✅ Loaded .env file');
} else {
  console.log('⚠️ No .env file found');
}

const CSV_PATH = 'public/Architecture References - Sheet1.csv';
const OUTPUT_PATH = 'client/generated/precomputed-embeddings.json';

async function precomputeEmbeddings() {
  console.log('🏗️  Pre-computing embeddings at build time...');
  
  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.VITE_OPENAI_API_KEY) {
    console.log('⚠️  No OpenAI API key found, skipping embedding pre-computation');
    console.log('    OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
    console.log('    VITE_OPENAI_API_KEY:', process.env.VITE_OPENAI_API_KEY ? 'SET' : 'NOT SET');
    // Create empty file so runtime doesn't crash
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ architectures: [], embeddings: {} }));
    return;
  }
  
  console.log('✅ OpenAI API key found, proceeding with embedding pre-computation');
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
  });
  
  try {
    // Read and parse CSV
    console.log('📄 Reading architecture CSV...');
    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    const architectures = [];
    const embeddings = {};
    
    console.log('🔍 Processing architectures...');
    for (let i = 1; i < Math.min(lines.length, 63); i++) { // Process up to 62 architectures
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const values = parseCSVLine(line);
        if (values.length >= 6) {
          const arch = {
            id: `arch_${i}`,
            cloud: values[0]?.trim() || '',
            group: values[1]?.trim() || '',
            subgroup: values[2]?.trim() || '',
            source: values[3]?.trim() || '',
            description: values[4]?.trim() || '',
            architecture: values[5]?.trim() || ''
          };
          
          if (arch.subgroup && arch.description) {
            // Create search text for embedding
            const searchText = `${arch.cloud} ${arch.group} ${arch.subgroup} ${arch.description}`.toLowerCase();
            
            console.log(`⚡ Computing embedding for: ${arch.subgroup}`);
            
            // Get embedding
            const response = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: searchText,
            });
            
            architectures.push(arch);
            embeddings[searchText] = response.data[0].embedding;
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        console.warn(`⚠️  Skipping line ${i}:`, error.message);
      }
    }
    
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write precomputed data
    const output = {
      architectures,
      embeddings,
      generatedAt: new Date().toISOString(),
      count: architectures.length
    };
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`✅ Pre-computed ${architectures.length} embeddings and saved to ${OUTPUT_PATH}`);
    
  } catch (error) {
    console.error('❌ Failed to pre-compute embeddings:', error);
    process.exit(1);
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result.map(field => field.replace(/^"|"$/g, ''));
}

precomputeEmbeddings(); 