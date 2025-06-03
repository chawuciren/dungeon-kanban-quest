require('dotenv').config();

console.log('🔍 环境变量调试信息\n');

console.log('📋 原始环境变量:');
console.log('DAILY_BASE_GOLD:', process.env.DAILY_BASE_GOLD);
console.log('DAILY_BASE_SILVER:', process.env.DAILY_BASE_SILVER);
console.log('DAILY_BASE_COPPER:', process.env.DAILY_BASE_COPPER);
console.log('DAILY_BASE_DIAMOND:', process.env.DAILY_BASE_DIAMOND);
console.log('');

console.log('DAILY_CLIENT_BONUS_GOLD:', process.env.DAILY_CLIENT_BONUS_GOLD);
console.log('DAILY_CLIENT_BONUS_SILVER:', process.env.DAILY_CLIENT_BONUS_SILVER);
console.log('DAILY_CLIENT_BONUS_COPPER:', process.env.DAILY_CLIENT_BONUS_COPPER);
console.log('DAILY_CLIENT_BONUS_DIAMOND:', process.env.DAILY_CLIENT_BONUS_DIAMOND);
console.log('');

console.log('DAILY_ADMIN_BONUS_GOLD:', process.env.DAILY_ADMIN_BONUS_GOLD);
console.log('DAILY_ADMIN_BONUS_SILVER:', process.env.DAILY_ADMIN_BONUS_SILVER);
console.log('DAILY_ADMIN_BONUS_COPPER:', process.env.DAILY_ADMIN_BONUS_COPPER);
console.log('DAILY_ADMIN_BONUS_DIAMOND:', process.env.DAILY_ADMIN_BONUS_DIAMOND);
console.log('');

// 加载配置
const config = require('../config');

console.log('⚙️  解析后的配置:');
console.log('基础奖励:', config.gamification.dailyCheckin.baseRewards);
console.log('客户奖励:', config.gamification.dailyCheckin.roleBonus.client);
console.log('管理员奖励:', config.gamification.dailyCheckin.roleBonus.admin);
console.log('');

// 测试CheckinService
const CheckinService = require('../services/CheckinService');

console.log('🧪 CheckinService测试:');

const testUsers = [
  { role: 'developer', name: '开发者' },
  { role: 'client', name: '客户' },
  { role: 'admin', name: '管理员' }
];

testUsers.forEach(user => {
  console.log(`${user.name} (${user.role}):`);
  const preview = CheckinService.getRewardPreview(user);
  console.log('  奖励:', preview.rewards);
  console.log('');
});
