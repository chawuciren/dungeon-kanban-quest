const CheckinService = require('../services/CheckinService');

// 测试不同角色的签到奖励
function testCheckinRewards() {
  console.log('🧪 测试每日签到奖励计算\n');

  // 显示当前配置
  const config = require('../config');
  const checkinConfig = config.gamification.dailyCheckin;
  console.log('⚙️  当前配置:');
  console.log('   基础奖励:', checkinConfig.baseRewards);
  console.log('   角色奖励:');
  console.log('     - 开发者:', checkinConfig.roleBonus.developer);
  console.log('     - 客户:', checkinConfig.roleBonus.client);
  console.log('     - 管理员:', checkinConfig.roleBonus.admin);
  console.log('');

  // 测试普通用户
  const normalUser = { role: 'developer' };
  const normalReward = CheckinService.getRewardPreview(normalUser);
  console.log('👤 普通用户 (developer):');
  console.log('   计算: 基础奖励 + 开发者奖励');
  console.log('   奖励:', normalReward.rewards);
  console.log('   描述:', normalReward.description);
  console.log('');

  // 测试客户
  const clientUser = { role: 'client' };
  const clientReward = CheckinService.getRewardPreview(clientUser);
  console.log('👑 委托贵族 (client):');
  console.log('   计算: 基础奖励 + 客户奖励');
  console.log('   奖励:', clientReward.rewards);
  console.log('   描述:', clientReward.description);
  console.log('');

  // 测试管理员
  const adminUser = { role: 'admin' };
  const adminReward = CheckinService.getRewardPreview(adminUser);
  console.log('⚡ 管理员 (admin):');
  console.log('   计算: 基础奖励 + 管理员奖励');
  console.log('   奖励:', adminReward.rewards);
  console.log('   描述:', adminReward.description);
  console.log('');

  // 验证预期结果
  console.log('📋 预期结果验证:');

  // 普通用户：基础奖励(20金币+50银币) + 开发者奖励(0) = 20金币 + 50银币
  const expectedNormal = { gold: 20, silver: 50 };
  const normalMatch = JSON.stringify(normalReward.rewards) === JSON.stringify(expectedNormal);
  console.log(`   普通用户: ${normalMatch ? '✅' : '❌'}`);
  console.log(`     期望: ${JSON.stringify(expectedNormal)}`);
  console.log(`     实际: ${JSON.stringify(normalReward.rewards)}`);

  // 客户：基础奖励(20金币+50银币) + 客户奖励(80金币+200银币+1钻石) = 100金币 + 250银币 + 1钻石
  const expectedClient = { diamond: 1, gold: 100, silver: 250 };
  const clientMatch = JSON.stringify(clientReward.rewards) === JSON.stringify(expectedClient);
  console.log(`   委托贵族: ${clientMatch ? '✅' : '❌'}`);
  console.log(`     期望: ${JSON.stringify(expectedClient)}`);
  console.log(`     实际: ${JSON.stringify(clientReward.rewards)}`);

  // 管理员：基础奖励(20金币+50银币) + 管理员奖励(50金币-50银币+2钻石) = 70金币 + 0银币 + 2钻石
  const expectedAdmin = { diamond: 2, gold: 70 };
  const adminMatch = JSON.stringify(adminReward.rewards) === JSON.stringify(expectedAdmin);
  console.log(`   管理员: ${adminMatch ? '✅' : '❌'}`);
  console.log(`     期望: ${JSON.stringify(expectedAdmin)}`);
  console.log(`     实际: ${JSON.stringify(adminReward.rewards)}`);
}

// 如果直接运行此脚本
if (require.main === module) {
  testCheckinRewards();
}

module.exports = testCheckinRewards;
