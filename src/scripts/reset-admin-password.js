const { User } = require('../models');
const bcrypt = require('bcryptjs');

/**
 * 重置管理员密码
 */
async function resetAdminPassword() {
  try {
    console.log('🔄 开始重置管理员密码...');

    // 查找admin用户
    const adminUser = await User.findOne({
      where: { username: 'admin' }
    });

    if (!adminUser) {
      console.log('❌ 未找到admin用户');
      return;
    }

    console.log('✅ 找到admin用户:', {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role,
      skillLevel: adminUser.skillLevel,
      status: adminUser.status
    });

    // 设置新密码
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 更新密码
    await adminUser.update({
      password: hashedPassword
    });

    console.log('✅ 管理员密码重置成功');
    console.log('📋 登录信息:');
    console.log('   用户名: admin');
    console.log('   密码: admin123');

    // 验证密码
    const isValid = await bcrypt.compare(newPassword, hashedPassword);
    console.log('🔍 密码验证:', isValid ? '✅ 通过' : '❌ 失败');

  } catch (error) {
    console.error('❌ 重置密码失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  resetAdminPassword()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = resetAdminPassword;
