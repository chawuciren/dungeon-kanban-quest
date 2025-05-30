const { sequelize } = require('../config/database');
const logger = require('../config/logger');

/**
 * 数据库迁移脚本：更新用户角色值
 * 将游戏化角色名称改为更直接的英文职业名称
 */

const roleMapping = {
  'guild_master': 'admin',
  'quest_captain': 'product_manager', 
  'swordsman': 'developer',
  'ranger': 'tester',
  'quest_giver': 'client',
  'enchanter': 'ui_designer',
  'alchemist': 'devops'
};

async function updateUserRoles() {
  try {
    logger.info('开始更新用户角色数据...');
    
    // 开始事务
    const transaction = await sequelize.transaction();
    
    try {
      // 更新每个角色
      for (const [oldRole, newRole] of Object.entries(roleMapping)) {
        const [affectedCount] = await sequelize.query(
          'UPDATE users SET role = ? WHERE role = ?',
          {
            replacements: [newRole, oldRole],
            transaction
          }
        );
        
        if (affectedCount > 0) {
          logger.info(`已更新 ${affectedCount} 个用户的角色从 ${oldRole} 到 ${newRole}`);
        }
      }
      
      // 提交事务
      await transaction.commit();
      logger.info('用户角色数据更新完成！');
      
    } catch (error) {
      // 回滚事务
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    logger.error('更新用户角色失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  updateUserRoles()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { updateUserRoles, roleMapping };
