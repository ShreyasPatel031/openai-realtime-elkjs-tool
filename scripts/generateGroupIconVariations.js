#!/usr/bin/env node
// Script to generate dashed and dotted variations of AWS group icons

const fs = require('fs');
const path = require('path');

const inputDir = './public/group-icons/aws';
const icons = [
  'aws_account.svg',
  'aws_auto_scaling_group.svg', 
  'aws_cloud.svg',
  'aws_corporate_datacenter.svg',
  'aws_ec2_instance_contents.svg',
  'aws_private_subnet.svg',
  'aws_public_subnet.svg',
  'aws_region.svg',
  'aws_server_contents.svg',
  'aws_spot_fleet.svg',
  'aws_vpc.svg'
];

// Function to modify SVG for dashed lines
function createDashedVariation(svgContent, iconName) {
  // Add stroke-dasharray to path elements
  let dashedSvg = svgContent.replace(
    /<path /g, 
    '<path stroke-dasharray="8,4" stroke-width="2" '
  );
  
  // Also add dashed style to rect elements that might have strokes
  dashedSvg = dashedSvg.replace(
    /<rect([^>]*stroke[^>]*)>/g,
    (match, attributes) => {
      if (!attributes.includes('stroke-dasharray')) {
        return `<rect${attributes} stroke-dasharray="8,4">`;
      }
      return match;
    }
  );
  
  return dashedSvg;
}

// Function to modify SVG for dotted lines  
function createDottedVariation(svgContent, iconName) {
  // Add stroke-dasharray for dots
  let dottedSvg = svgContent.replace(
    /<path /g,
    '<path stroke-dasharray="2,2" stroke-width="2" '
  );
  
  // Also add dotted style to rect elements
  dottedSvg = dottedSvg.replace(
    /<rect([^>]*stroke[^>]*)>/g,
    (match, attributes) => {
      if (!attributes.includes('stroke-dasharray')) {
        return `<rect${attributes} stroke-dasharray="2,2">`;
      }
      return match;
    }
  );
  
  return dottedSvg;
}

// Process each icon
icons.forEach(iconFile => {
  const iconPath = path.join(inputDir, iconFile);
  const iconName = path.basename(iconFile, '.svg');
  
  try {
    // Read original SVG
    const originalSvg = fs.readFileSync(iconPath, 'utf8');
    
    // Generate dashed variation
    const dashedSvg = createDashedVariation(originalSvg, iconName);
    const dashedPath = path.join(inputDir, `${iconName}_dashed.svg`);
    fs.writeFileSync(dashedPath, dashedSvg);
    
    // Generate dotted variation
    const dottedSvg = createDottedVariation(originalSvg, iconName);
    const dottedPath = path.join(inputDir, `${iconName}_dotted.svg`);
    fs.writeFileSync(dottedPath, dottedSvg);
    
    console.log(`✅ Generated variations for ${iconName}`);
    
  } catch (error) {
    console.error(`❌ Error processing ${iconFile}:`, error.message);
  }
});

console.log('🎉 Group icon variations generation complete!'); 