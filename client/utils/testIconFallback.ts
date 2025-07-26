import { iconFallbackService } from './iconFallbackService';

/**
 * Test function to demonstrate the icon fallback service
 * Call this from console: testIconFallback()
 */
export async function testIconFallback() {
  console.log('🧪 Testing Icon Fallback Service...');
  
  const testCases = [
    'gcp_instance_group',        // Missing icon that triggered this feature
    'gcp_kubernetes_cluster',    // Another potentially missing icon
    'aws_invalid_service',       // AWS test case
    'azure_some_service',        // Azure test case
    'gcp_compute_instances'      // Another GCP test case
  ];

  for (const testIcon of testCases) {
    console.log(`\n🔍 Testing: ${testIcon}`);
    try {
      const fallback = await iconFallbackService.findFallbackIcon(testIcon);
      if (fallback) {
        console.log(`✅ Found fallback: ${testIcon} → ${fallback}`);
      } else {
        console.log(`❌ No fallback found for: ${testIcon}`);
      }
    } catch (error) {
      console.error(`💥 Error testing ${testIcon}:`, error);
    }
  }
  
  console.log('\n🎯 Icon fallback testing completed!');
}

/**
 * Quick test for a single icon
 */
export async function testSingleIcon(iconName: string) {
  console.log(`🧪 Testing single icon: ${iconName}`);
  try {
    const fallback = await iconFallbackService.findFallbackIcon(iconName);
    if (fallback) {
      console.log(`✅ Fallback found: ${iconName} → ${fallback}`);
      return fallback;
    } else {
      console.log(`❌ No fallback found for: ${iconName}`);
      return null;
    }
  } catch (error) {
    console.error(`💥 Error:`, error);
    return null;
  }
}

// Export to global window for console testing
if (typeof window !== 'undefined') {
  (window as any).testIconFallback = testIconFallback;
  (window as any).testSingleIcon = testSingleIcon;
  // console.log('🛠️ Icon fallback test functions available:');
  // console.log('   testIconFallback() - Test multiple icons');
  // console.log('   testSingleIcon("gcp_instance_group") - Test single icon');
} 