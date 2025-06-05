#!/usr/bin/env node
// Optimized parser for AWS group icons - LLM-efficient format

const fs = require('fs');
const path = require('path');

const inputDir = './client/public/group-icons/aws';

// Function to extract primary background color from SVG
function getPrimaryBackgroundColor(svgContent) {
  // Look for rect fill colors first
  const rectFillMatch = svgContent.match(/rect[^>]*fill="(#[0-9A-Fa-f]{6})"/);
  if (rectFillMatch) return rectFillMatch[1];
  
  // Fallback to first hex color found
  const hexPattern = /#[0-9A-Fa-f]{6}/g;
  const matches = svgContent.match(hexPattern);
  return matches ? matches[0] : '#000000';
}

// Function to analyze an icon and extract minimal data
function analyzeIcon(iconPath) {
  try {
    const svgContent = fs.readFileSync(iconPath, 'utf8');
    const primaryColor = getPrimaryBackgroundColor(svgContent);
    return primaryColor;
  } catch (error) {
    console.error(`Error analyzing ${iconPath}:`, error.message);
    return null;
  }
}

// Main function to process all group icons
function parseGroupIcons() {
  const results = [];
  
  // Get all AWS group icon SVG files
  const iconFiles = fs.readdirSync(inputDir)
    .filter(file => file.endsWith('.svg') && 
                   file.startsWith('aws_') && 
                   !file.includes('_32'))
    .sort();
  
  console.log('🎨 Parsing AWS Group Icons (LLM-optimized format)...\n');
  
  iconFiles.forEach(iconFile => {
    const iconPath = path.join(inputDir, iconFile);
    const primaryColor = analyzeIcon(iconPath);
    
    if (primaryColor) {
      const iconName = path.basename(iconFile, '.svg');
      
      // Optimized format: just name, hex, and fill
      const iconData = {
        name: iconName,        // aws_account, aws_cloud, etc.
        hex: primaryColor,     // #E7157B, #242F3E, etc.
        fill: false           // AWS default: border only, not filled
      };
      
      results.push(iconData);
      
      console.log(`📋 ${iconName}: ${primaryColor} (fill: false)`);
    }
  });
  
  return results;
}

// Generate optimized TypeScript configuration file
function generateOptimizedGroupIconConfig(iconData) {
  const tsContent = `// Auto-generated AWS Group Icons (LLM-optimized)
// Minimal format: name, hex color, fill boolean

export interface GroupIcon {
  name: string;   // Provider-prefixed name (aws_account, aws_cloud, etc.)
  hex: string;    // Primary hex color (#E7157B, #242F3E, etc.)
  fill: boolean;  // true = filled with color, false = border only
}

export const awsGroupIcons: GroupIcon[] = ${JSON.stringify(iconData, null, 2)};

// Quick hex lookup by name
export const groupIconHexMap: { [key: string]: string } = {
${iconData.map(icon => `  "${icon.name}": "${icon.hex}"`).join(',\n')}
};

// Available group icon names (for agent use)
export const availableGroupIcons = [
${iconData.map(icon => `  "${icon.name}"`).join(',\n')}
];

export default {
  awsGroupIcons,
  groupIconHexMap,
  availableGroupIcons
};`;

  return tsContent;
}

// Run the parser
const iconData = parseGroupIcons();

if (iconData.length > 0) {
  // Generate optimized TypeScript config
  const tsConfig = generateOptimizedGroupIconConfig(iconData);
  
  // Write to file
  const outputPath = './client/generated/groupIconColors.ts';
  fs.writeFileSync(outputPath, tsConfig);
  
  console.log(`\n✅ Generated optimized group icon config with ${iconData.length} icons`);
  console.log(`📁 Saved to: ${outputPath}`);
  console.log(`📦 Size optimized for LLM efficiency`);
  console.log(`🎨 All AWS icons set to fill: false (border only)`);
} else {
  console.log('❌ No group icons found to process');
} 