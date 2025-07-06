#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Generates dynamic lists for agents at build time
 * This includes group icons, regular icons, and other agent resources
 */

console.log('🏗️  Generating dynamic lists for agents...');

// Read group icon colors
const groupIconColorsPath = path.join(__dirname, '..', 'client', 'generated', 'groupIconColors.ts');
const groupIconColorsContent = fs.readFileSync(groupIconColorsPath, 'utf8');

// Extract available group icons from the file
const availableGroupIconsMatch = groupIconColorsContent.match(/export const availableGroupIcons = \[([\s\S]*?)\];/);
if (!availableGroupIconsMatch) {
  throw new Error('Could not find availableGroupIcons export in groupIconColors.ts');
}

const availableGroupIcons = availableGroupIconsMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith('"') && line.includes(','))
  .map(line => line.replace(/[",]/g, '').trim())
  .filter(Boolean);

console.log(`📦 Found ${availableGroupIcons.length} group icons`);

// Split group icons by provider for the template
const awsGroupIconsList = availableGroupIcons.filter(icon => icon.startsWith('aws_'));
const gcpGroupIconsList = availableGroupIcons.filter(icon => icon.startsWith('gcp_'));
const azureGroupIconsList = availableGroupIcons.filter(icon => icon.startsWith('azure_'));

// Read regular icon lists (for comparison and completeness)
const iconListsPath = path.join(__dirname, '..', 'client', 'generated', 'iconLists.ts');
const iconListsContent = fs.readFileSync(iconListsPath, 'utf8');

// Extract AWS, GCP, Azure, and Generic icons from the prefixed icons list
const availableIconsPrefixedMatch = iconListsContent.match(/export const availableIconsPrefixed = \[([\s\S]*?)\];/);
const allPrefixedIcons = availableIconsPrefixedMatch ? availableIconsPrefixedMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith('"') && line.includes(','))
  .map(line => line.replace(/[",]/g, '').trim())
  .filter(Boolean) : [];

// Split by provider prefix
const awsIcons = allPrefixedIcons.filter(icon => icon.startsWith('aws_')).map(icon => icon.replace(/^aws_/, ''));
const gcpIcons = allPrefixedIcons.filter(icon => icon.startsWith('gcp_')).map(icon => icon.replace(/^gcp_/, ''));
const azureIcons = allPrefixedIcons.filter(icon => icon.startsWith('azure_')).map(icon => icon.replace(/^azure_/, ''));
const genericIcons = allPrefixedIcons.filter(icon => !icon.startsWith('aws_') && !icon.startsWith('gcp_') && !icon.startsWith('azure_'));

const extractIconNames = (match) => {
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('"') && line.includes(','))
    .map(line => line.replace(/[",]/g, '').trim())
    .filter(Boolean);
};

console.log(`🔧 Found ${awsIcons.length} AWS icons, ${gcpIcons.length} GCP icons, ${azureIcons.length} Azure icons, ${genericIcons.length} generic icons`);

// Generate dynamic agent configuration
const agentConfigContent = `// Auto-generated dynamic lists for agents at build time
// Generated on: ${new Date().toISOString()}

export interface DynamicAgentResources {
  groupIcons: {
    all: string[];
    aws: string[];
    gcp: string[];
    azure: string[];
  };
  regularIcons: {
    aws: string[];
    gcp: string[];
    azure: string[];
    generic: string[];
  };
  totalCounts: {
    groupIcons: number;
    regularIcons: number;
  };
}

// Group Icons - for architecture grouping and containers
export const availableGroupIcons = [
${availableGroupIcons.map(icon => `  "${icon}"`).join(',\n')}
];

export const awsGroupIcons = availableGroupIcons.filter(icon => icon.startsWith('aws_'));
export const gcpGroupIcons = availableGroupIcons.filter(icon => icon.startsWith('gcp_'));
export const azureGroupIcons = availableGroupIcons.filter(icon => icon.startsWith('azure_'));

// Regular Icons - for individual services and components
export const availableRegularIcons = {
  aws: [
${awsIcons.map(icon => `    "${icon}"`).join(',\n')}
  ],
  gcp: [
${gcpIcons.map(icon => `    "${icon}"`).join(',\n')}
  ],
  azure: [
${azureIcons.map(icon => `    "${icon}"`).join(',\n')}
  ],
  generic: [
${genericIcons.map(icon => `    "${icon}"`).join(',\n')}
  ]
};

// Comprehensive icon list for reasoning agent (includes provider-prefixed and generic)
export const availableIconsComprehensive = [
${awsIcons.map(icon => `  "aws_${icon}"`).join(',\n')},
${gcpIcons.map(icon => `  "gcp_${icon}"`).join(',\n')},
${azureIcons.map(icon => `  "azure_${icon}"`).join(',\n')},
${genericIcons.map(icon => `  "${icon}"`).join(',\n')}
];

// Combined resource object for agent access
export const dynamicAgentResources: DynamicAgentResources = {
  groupIcons: {
    all: availableGroupIcons,
    aws: awsGroupIcons,
    gcp: gcpGroupIcons,
    azure: azureGroupIcons
  },
  regularIcons: availableRegularIcons,
  totalCounts: {
    groupIcons: ${availableGroupIcons.length},
    regularIcons: ${awsIcons.length + gcpIcons.length + azureIcons.length + genericIcons.length}
  }
};

// Helper functions for agents
export function getGroupIconsByProvider(provider: 'aws' | 'gcp' | 'azure'): string[] {
  return dynamicAgentResources.groupIcons[provider];
}

export function getRegularIconsByProvider(provider: 'aws' | 'gcp' | 'azure' | 'generic'): string[] {
  return dynamicAgentResources.regularIcons[provider];
}

export function isGroupIcon(iconName: string): boolean {
  return availableGroupIcons.includes(iconName);
}

export function isRegularIcon(iconName: string): boolean {
  return Object.values(availableRegularIcons).flat().includes(iconName);
}

export function getIconProvider(iconName: string): 'aws' | 'gcp' | 'azure' | null {
  if (iconName.startsWith('aws_')) return 'aws';
  if (iconName.startsWith('gcp_')) return 'gcp';
  if (iconName.startsWith('azure_')) return 'azure';
  return null;
}

// Agent instruction content for group icons
export const groupIconInstructions = \`
📦 GROUP ICONS (${availableGroupIcons.length} available)
Group icons are used for creating visual containers and logical groupings in architecture diagrams.
They provide colored backgrounds/borders to organize related components.

Available Group Icons by Provider:
• AWS (${awsGroupIconsList.length}): ${awsGroupIconsList.slice(0, 5).join(', ')}${awsGroupIconsList.length > 5 ? '...' : ''}
• GCP (${gcpGroupIconsList.length}): ${gcpGroupIconsList.slice(0, 5).join(', ')}${gcpGroupIconsList.length > 5 ? '...' : ''}
• Azure (${azureGroupIconsList.length}): ${azureGroupIconsList.slice(0, 5).join(', ')}${azureGroupIconsList.length > 5 ? '...' : ''}

Usage in group_nodes function:
group_nodes(nodeIds, parentId, groupId, style, groupIconName)

Examples:
- aws_vpc: Purple border for AWS VPC grouping
- gcp_kubernetes_cluster: Pink background for GCP K8s clusters  
- azure_subscription_filled: Light blue filled background for Azure subscriptions
- gcp_system: Neutral light gray for general system grouping

Group Icon Properties:
- AWS: All have fill=false (border only styling)
- GCP: Most have fill=true (filled backgrounds), except optional_component_dashed
- Azure: Both filled and border variants available

Choose group icons based on:
1. Cloud provider alignment (aws_, gcp_, azure_)
2. Logical grouping type (vpc, subnet, cluster, etc.)
3. Visual hierarchy (filled vs border)
4. Color coordination with architecture
\`;

export default dynamicAgentResources;
`;

// Write the generated file
const outputPath = path.join(__dirname, '..', 'client', 'generated', 'dynamicAgentResources.ts');
fs.writeFileSync(outputPath, agentConfigContent);

console.log(`✅ Generated dynamic agent resources: ${outputPath}`);
console.log(`📊 Summary:`);
console.log(`   - Group Icons: ${availableGroupIcons.length} total`);
console.log(`   - AWS Group Icons: ${awsGroupIconsList.length}`);
console.log(`   - GCP Group Icons: ${gcpGroupIconsList.length}`);
console.log(`   - Azure Group Icons: ${azureGroupIconsList.length}`);
console.log(`   - Regular Icons: ${awsIcons.length + gcpIcons.length + azureIcons.length + genericIcons.length} total (${genericIcons.length} generic)`); 