// Auto-generated dynamic lists for agents at build time
// Generated on: 2025-06-05T09:13:32.179Z

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
  };
  totalCounts: {
    groupIcons: number;
    regularIcons: number;
  };
}

// Group Icons - for architecture grouping and containers
export const availableGroupIcons = [
  "aws_account",
  "aws_auto_scaling_group",
  "aws_cloud",
  "aws_corporate_datacenter",
  "aws_ec2_instance_contents",
  "aws_private_subnet",
  "aws_public_subnet",
  "aws_region",
  "aws_server_contents",
  "aws_spot_fleet",
  "aws_vpc",
  "gcp_user_default",
  "gcp_system",
  "gcp_infrastructure_system",
  "gcp_external_saas_providers",
  "gcp_external_data_sources",
  "gcp_colo_dc_onpremises",
  "gcp_external_infrastructure_3rd_party",
  "gcp_external_infrastructure_1st_party",
  "gcp_project_zone_cloud_service_provider",
  "gcp_logical_grouping_services_instances",
  "gcp_zone_inside_logical_grouping",
  "gcp_subnetwork",
  "gcp_kubernetes_cluster",
  "gcp_pod",
  "gcp_account",
  "gcp_region",
  "gcp_zone_inside_region",
  "gcp_firewall",
  "gcp_instance_group",
  "gcp_replica_pool",
  "gcp_optional_component_dashed",
  "azure_subscription_filled",
  "azure_subscription_border",
  "azure_resource_group_filled",
  "azure_resource_group_border",
  "azure_virtual_network_filled",
  "azure_virtual_network_border",
  "azure_subnet_filled",
  "azure_subnet_border",
  "azure_availability_zone_filled",
  "azure_availability_zone_border",
  "azure_region_filled",
  "azure_region_border",
  "azure_tenant_filled",
  "azure_tenant_border",
  "azure_management_group_filled",
  "azure_management_group_border",
  "azure_application_group_filled",
  "azure_application_group_border",
  "azure_security_group_filled"
];

export const awsGroupIcons = availableGroupIcons.filter(icon => icon.startsWith('aws_'));
export const gcpGroupIcons = availableGroupIcons.filter(icon => icon.startsWith('gcp_'));
export const azureGroupIcons = availableGroupIcons.filter(icon => icon.startsWith('azure_'));

// Regular Icons - for individual services and components
export const availableRegularIcons = {
  aws: [

  ],
  gcp: [

  ],
  azure: [

  ]
};

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
    groupIcons: 51,
    regularIcons: 0
  }
};

// Helper functions for agents
export function getGroupIconsByProvider(provider: 'aws' | 'gcp' | 'azure'): string[] {
  return dynamicAgentResources.groupIcons[provider];
}

export function getRegularIconsByProvider(provider: 'aws' | 'gcp' | 'azure'): string[] {
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
export const groupIconInstructions = `
📦 GROUP ICONS (51 available)
Group icons are used for creating visual containers and logical groupings in architecture diagrams.
They provide colored backgrounds/borders to organize related components.

Available Group Icons by Provider:
• AWS (11): aws_account, aws_auto_scaling_group, aws_cloud, aws_corporate_datacenter, aws_ec2_instance_contents...
• GCP (21): gcp_user_default, gcp_system, gcp_infrastructure_system, gcp_external_saas_providers, gcp_external_data_sources...
• Azure (19): azure_subscription_filled, azure_subscription_border, azure_resource_group_filled, azure_resource_group_border, azure_virtual_network_filled...

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
`;

export default dynamicAgentResources;
