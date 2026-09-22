const { execSync } = require('child_process');
const path = require('path');

const tests = [
  { name: '认证与会话', file: 'test-auth.js' },
  { name: '商品CRUD', file: 'test-products.js' },
  { name: '分类与标签', file: 'test-categories-tags.js' },
  { name: '购买流程与下载令牌', file: 'test-checkout-download.js' },
  { name: '站点设置', file: 'test-site-config.js' },
  { name: 'API Key管理', file: 'test-api-keys.js' },
  { name: 'AI供应商管理', file: 'test-ai.js' },
  { name: 'Open API v1', file: 'test-v1-api.js' },
  { name: '并发与边界', file: 'test-concurrency-edge.js' }
];

console.log('╔══════════════════════════════════════╗');
console.log('║   AEOX Store Lite 全系统测试套件    ║');
console.log('╚══════════════════════════════════════╝\n');

let totalPassed = 0;
let totalFailed = 0;
const failedTests = [];

for (const test of tests) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`▶ ${test.name} (${test.file})`);
  console.log('═'.repeat(50));

  try {
    const output = execSync(`node "${path.join(__dirname, test.file)}"`, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log(output);

    const match = output.match(/通过: (\d+) \| 失败: (\d+)/);
    if (match) {
      totalPassed += parseInt(match[1]);
      totalFailed += parseInt(match[2]);
      if (parseInt(match[2]) > 0) failedTests.push(test.name);
    }
  } catch (e) {
    const output = e.stdout || e.message;
    console.log(output);

    const match = output.match(/通过: (\d+) \| 失败: (\d+)/);
    if (match) {
      totalPassed += parseInt(match[1]);
      totalFailed += parseInt(match[2]);
      if (parseInt(match[2]) > 0) failedTests.push(test.name);
    } else {
      totalFailed++;
      failedTests.push(test.name + ' (异常)');
    }
  }
}

console.log('\n\n' + '█'.repeat(50));
console.log('  AEOX Store Lite 全系统测试汇总');
console.log('█'.repeat(50));
console.log(`  总通过: ${totalPassed}`);
console.log(`  总失败: ${totalFailed}`);
console.log(`  测试套: ${tests.length}`);

if (failedTests.length > 0) {
  console.log('\n  失败的测试套:');
  failedTests.forEach(t => console.log(`    ✗ ${t}`));
} else {
  console.log('\n  全部通过!');
}

process.exit(totalFailed > 0 ? 1 : 0);
