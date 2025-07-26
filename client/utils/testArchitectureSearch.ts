import { architectureSearchService } from './architectureSearchService';

export async function testArchitectureSearch() {
  console.log('🧪 Testing Architecture Search Service...');
  
  const testCases = [
    'machine learning training',
    'gen ai chatbot',
    'data analytics',
    'microservices',
    'kubernetes deployment',
    'real-time streaming',
    'web application',
    'mobile backend'
  ];

  for (const testCase of testCases) {
    console.log(`\n🔍 Testing: "${testCase}"`);
    try {
      const result = await architectureSearchService.findMatchingArchitecture(testCase);
      if (result) {
        console.log(`✅ Match found: ${result.subgroup}`);
        console.log(`📋 Description: ${result.description}`);
        console.log(`🏗️ Architecture: ${result.architecture}`);
      } else {
        console.log(`❌ No match found for: ${testCase}`);
      }
    } catch (error) {
      console.error(`💥 Error testing ${testCase}:`, error);
    }
  }
}

export async function testSingleArchitecture(userInput: string) {
  console.log(`🧪 Testing single architecture search: ${userInput}`);
  
  // Check if service is initialized
  const architectures = architectureSearchService.getAvailableArchitectures();
  console.log(`📊 Service has ${architectures.length} architectures loaded`);
  
  if (architectures.length === 0) {
    console.warn('⚠️ No architectures loaded yet. Try again in a few seconds...');
    return null;
  }
  
  try {
    const result = await architectureSearchService.findMatchingArchitecture(userInput);
    if (result) {
      console.log(`✅ Match found: ${result.subgroup}`);
      console.log(`📋 Description: ${result.description}`);
      console.log(`🔗 Source URL: ${result.source}`);
      console.log(`☁️ Cloud Provider: ${result.cloud.toUpperCase()}`);
      console.log(`📁 Category: ${result.group} > ${result.subgroup}`);
      console.log(`🏗️ Architecture JSON:`);
      console.log(result.architecture);
      return result;
    } else {
      console.log(`❌ No match found for: ${userInput}`);
      return null;
    }
  } catch (error) {
    console.error(`💥 Error testing ${userInput}:`, error);
    return null;
  }
}

export function listAvailableArchitectures() {
  console.log('📋 Available reference architectures:');
  const architectures = architectureSearchService.getAvailableArchitectures();
  
  const grouped = architectures.reduce((acc, arch) => {
    if (!acc[arch.group]) acc[arch.group] = [];
    acc[arch.group].push(arch);
    return acc;
  }, {} as Record<string, any[]>);

  for (const [group, archs] of Object.entries(grouped)) {
    console.log(`\n📁 ${group}:`);
    archs.forEach(arch => {
      console.log(`  • ${arch.subgroup}: ${arch.description}`);
    });
  }
}

// Make functions available globally for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testArchitectureSearch = testArchitectureSearch;
  (window as any).testSingleArchitecture = testSingleArchitecture;
  (window as any).listAvailableArchitectures = listAvailableArchitectures;
  (window as any).architectureSearchService = architectureSearchService;
  
  console.log('🛠️ Architecture search test functions available:');
  console.log('   testArchitectureSearch() - Test multiple search terms');
  console.log('   testSingleArchitecture("machine learning") - Test single search');
  console.log('   listAvailableArchitectures() - Show all available architectures');
  console.log('   architectureSearchService - Direct access to service');
  
  // Auto-test disabled to avoid console noise - use manual testing instead
  // setTimeout(() => {
  //   console.log('🧪 Running architecture search auto-test...');
  //   const archs = architectureSearchService.getAvailableArchitectures();
  //   console.log(`📊 Auto-test: ${archs.length} architectures available`);
  //   
  //   if (archs.length > 0) {
  //     console.log('✅ Architecture service is working, testing search...');
  //     testSingleArchitecture("machine learning training").then(result => {
  //       console.log('🧪 Auto-test completed:', result ? `Found: ${result.subgroup}` : 'No result');
  //     }).catch(error => {
  //       console.error('🧪 Auto-test failed:', error);
  //     });
  //   } else {
  //     console.error('❌ Architecture service has no data - check CSV loading');
  //   }
  // }, 5000);
} 