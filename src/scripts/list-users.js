const { User } = require('../models');

/**
 * 列出所有用户
 */
async function listUsers() {
  try {
    console.log('📋 查询所有用户...');

    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'role', 'skillLevel', 'status', 'createdAt']
    });

    if (users.length === 0) {
      console.log('❌ 数据库中没有用户');
      return;
    }

    console.log(`✅ 找到 ${users.length} 个用户:`);
    console.log('');

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   邮箱: ${user.email}`);
      console.log(`   角色: ${user.role}`);
      console.log(`   技能等级: ${user.skillLevel}`);
      console.log(`   状态: ${user.status}`);
      console.log(`   创建时间: ${user.createdAt}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ 查询用户失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  listUsers()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = listUsers;
