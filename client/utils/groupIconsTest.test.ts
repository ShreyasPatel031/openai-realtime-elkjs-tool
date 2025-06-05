// Test file for group icon functionality
import { getGroupIconHex, isGroupIcon, getGroupIconsByProvider } from '../generated/groupIconColors';
import { availableGroupIcons, getIconProvider } from '../generated/dynamicAgentResources';

describe('Group Icon Functionality', () => {
  test('should get correct hex color for AWS group icons', () => {
    const awsVpcHex = getGroupIconHex('aws_vpc');
    expect(awsVpcHex).toBe('#8C4FFF'); // Purple
    
    const awsAccountHex = getGroupIconHex('aws_account');
    expect(awsAccountHex).toBe('#E7157B'); // Pink
  });

  test('should get correct hex color for GCP group icons', () => {
    const gcpSystemHex = getGroupIconHex('gcp_system');
    expect(gcpSystemHex).toBe('#F1F8E9'); // Light green
    
    const gcpK8sHex = getGroupIconHex('gcp_kubernetes_cluster');
    expect(gcpK8sHex).toBe('#FCE4EC'); // Pink
  });

  test('should get correct hex color for Azure group icons', () => {
    const azureSubHex = getGroupIconHex('azure_subscription_filled');
    expect(azureSubHex).toBe('#E5F2FB'); // Light blue
    
    const azureRegionHex = getGroupIconHex('azure_region_filled');
    expect(azureRegionHex).toBe('#F2F2F2'); // Gray
  });

  test('should correctly identify group icons', () => {
    expect(isGroupIcon('aws_vpc')).toBe(true);
    expect(isGroupIcon('gcp_system')).toBe(true);
    expect(isGroupIcon('azure_subscription_filled')).toBe(true);
    expect(isGroupIcon('regular_icon')).toBe(false);
  });

  test('should get correct provider for group icons', () => {
    expect(getIconProvider('aws_vpc')).toBe('aws');
    expect(getIconProvider('gcp_system')).toBe('gcp');
    expect(getIconProvider('azure_subscription_filled')).toBe('azure');
    expect(getIconProvider('unknown_icon')).toBe(null);
  });

  test('should filter group icons by provider', () => {
    const awsIcons = availableGroupIcons.filter(icon => icon.startsWith('aws_'));
    const gcpIcons = availableGroupIcons.filter(icon => icon.startsWith('gcp_'));
    const azureIcons = availableGroupIcons.filter(icon => icon.startsWith('azure_'));
    
    expect(awsIcons.length).toBe(11);
    expect(gcpIcons.length).toBe(21);
    expect(azureIcons.length).toBe(19);
    
    expect(awsIcons.every(icon => icon.startsWith('aws_'))).toBe(true);
    expect(gcpIcons.every(icon => icon.startsWith('gcp_'))).toBe(true);
    expect(azureIcons.every(icon => icon.startsWith('azure_'))).toBe(true);
  });

  test('should have all 51 group icons available', () => {
    expect(availableGroupIcons.length).toBe(51);
  });

  test('should return null for non-existent group icon', () => {
    expect(getGroupIconHex('non_existent_icon')).toBe(null);
  });
}); 