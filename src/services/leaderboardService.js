const { BountyTask, User, Project, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const logger = require('../config/logger');

/**
 * 榜单服务 - 基于现有表实时计算榜单数据
 * 不需要额外的统计表，直接从任务表聚合计算
 */
class LeaderboardService {
  
  /**
   * 获取任务完成数量榜单
   * @param {Object} options - 查询选项
   * @returns {Array} 榜单数据
   */
  static async getTaskCompletionLeaderboard(options = {}) {
    const { projectId, periodStart, periodEnd, limit = 20 } = options;
    
    try {
      let whereClause = `t.status = 'completed' AND t.assignee_id IS NOT NULL`;
      const replacements = [];
      
      if (projectId) {
        whereClause += ` AND t.project_id = ?`;
        replacements.push(projectId);
      }
      
      if (periodStart && periodEnd) {
        whereClause += ` AND t.completed_at BETWEEN ? AND ?`;
        replacements.push(periodStart, periodEnd);
      }
      
      const query = `
        SELECT 
          u.id as userId,
          u.username,
          u.first_name as firstName,
          u.last_name as lastName,
          u.avatar,
          COUNT(t.id) as completedTasks,
          SUM(CASE WHEN t.completed_at <= t.due_date THEN 1 ELSE 0 END) as onTimeTasks,
          SUM(COALESCE(t.actual_hours, 0)) as totalHours,
          AVG(t.star_level) as avgDifficulty
        FROM users u
        INNER JOIN bounty_tasks t ON u.id = t.assignee_id
        WHERE ${whereClause}
        GROUP BY u.id, u.username, u.first_name, u.last_name, u.avatar
        ORDER BY completedTasks DESC, onTimeTasks DESC
        LIMIT ?
      `;
      
      replacements.push(limit);
      
      const results = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
      });
      
      return results.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        username: row.username,
        fullName: `${row.firstName} ${row.lastName}`,
        avatar: row.avatar,
        score: parseInt(row.completedTasks),
        details: {
          completedTasks: parseInt(row.completedTasks),
          onTimeTasks: parseInt(row.onTimeTasks),
          totalHours: parseFloat(row.totalHours) || 0,
          avgDifficulty: parseFloat(row.avgDifficulty) || 0,
          onTimeRate: row.completedTasks > 0 ? ((row.onTimeTasks / row.completedTasks) * 100).toFixed(1) : 0
        }
      }));
      
    } catch (error) {
      logger.error('获取任务完成榜单失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取工时贡献榜单
   * @param {Object} options - 查询选项
   * @returns {Array} 榜单数据
   */
  static async getHoursContributionLeaderboard(options = {}) {
    const { projectId, periodStart, periodEnd, limit = 20 } = options;
    
    try {
      let whereClause = `t.actual_hours IS NOT NULL AND t.actual_hours > 0 AND t.assignee_id IS NOT NULL`;
      const replacements = [];
      
      if (projectId) {
        whereClause += ` AND t.project_id = ?`;
        replacements.push(projectId);
      }
      
      if (periodStart && periodEnd) {
        whereClause += ` AND t.updated_at BETWEEN ? AND ?`;
        replacements.push(periodStart, periodEnd);
      }
      
      const query = `
        SELECT 
          u.id as userId,
          u.username,
          u.first_name as firstName,
          u.last_name as lastName,
          u.avatar,
          SUM(t.actual_hours) as totalHours,
          COUNT(t.id) as totalTasks,
          SUM(COALESCE(t.estimated_hours, 0)) as totalEstimatedHours,
          AVG(t.star_level) as avgDifficulty
        FROM users u
        INNER JOIN bounty_tasks t ON u.id = t.assignee_id
        WHERE ${whereClause}
        GROUP BY u.id, u.username, u.first_name, u.last_name, u.avatar
        ORDER BY totalHours DESC
        LIMIT ?
      `;
      
      replacements.push(limit);
      
      const results = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
      });
      
      return results.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        username: row.username,
        fullName: `${row.firstName} ${row.lastName}`,
        avatar: row.avatar,
        score: parseFloat(row.totalHours).toFixed(1),
        details: {
          totalHours: parseFloat(row.totalHours),
          totalTasks: parseInt(row.totalTasks),
          totalEstimatedHours: parseFloat(row.totalEstimatedHours) || 0,
          avgDifficulty: parseFloat(row.avgDifficulty) || 0,
          hoursAccuracy: row.totalEstimatedHours > 0 ? 
            ((row.totalEstimatedHours / row.totalHours) * 100).toFixed(1) : 0
        }
      }));
      
    } catch (error) {
      logger.error('获取工时贡献榜单失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取按时交付率榜单
   * @param {Object} options - 查询选项
   * @returns {Array} 榜单数据
   */
  static async getOnTimeDeliveryLeaderboard(options = {}) {
    const { projectId, periodStart, periodEnd, limit = 20, minTasks = 3 } = options;
    
    try {
      let whereClause = `t.status = 'completed' AND t.due_date IS NOT NULL AND t.completed_at IS NOT NULL AND t.assignee_id IS NOT NULL`;
      const replacements = [];
      
      if (projectId) {
        whereClause += ` AND t.project_id = ?`;
        replacements.push(projectId);
      }
      
      if (periodStart && periodEnd) {
        whereClause += ` AND t.completed_at BETWEEN ? AND ?`;
        replacements.push(periodStart, periodEnd);
      }
      
      const query = `
        SELECT 
          u.id as userId,
          u.username,
          u.first_name as firstName,
          u.last_name as lastName,
          u.avatar,
          COUNT(t.id) as totalTasks,
          SUM(CASE WHEN t.completed_at <= t.due_date THEN 1 ELSE 0 END) as onTimeTasks,
          SUM(CASE WHEN t.completed_at > t.due_date THEN 1 ELSE 0 END) as overdueTasks,
          AVG(t.star_level) as avgDifficulty
        FROM users u
        INNER JOIN bounty_tasks t ON u.id = t.assignee_id
        WHERE ${whereClause}
        GROUP BY u.id, u.username, u.first_name, u.last_name, u.avatar
        HAVING COUNT(t.id) >= ?
        ORDER BY (SUM(CASE WHEN t.completed_at <= t.due_date THEN 1 ELSE 0 END) * 1.0 / COUNT(t.id)) DESC, COUNT(t.id) DESC
        LIMIT ?
      `;
      
      replacements.push(minTasks, limit);
      
      const results = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
      });
      
      return results.map((row, index) => {
        const onTimeRate = (row.onTimeTasks / row.totalTasks * 100);
        return {
          rank: index + 1,
          userId: row.userId,
          username: row.username,
          fullName: `${row.firstName} ${row.lastName}`,
          avatar: row.avatar,
          score: onTimeRate.toFixed(1),
          details: {
            totalTasks: parseInt(row.totalTasks),
            onTimeTasks: parseInt(row.onTimeTasks),
            overdueTasks: parseInt(row.overdueTasks),
            onTimeRate: onTimeRate.toFixed(1),
            avgDifficulty: parseFloat(row.avgDifficulty) || 0
          }
        };
      });
      
    } catch (error) {
      logger.error('获取按时交付率榜单失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取高难度任务挑战榜单
   * @param {Object} options - 查询选项
   * @returns {Array} 榜单数据
   */
  static async getDifficultyChallengeLeaderboard(options = {}) {
    const { projectId, periodStart, periodEnd, limit = 20 } = options;
    
    try {
      let whereClause = `t.status = 'completed' AND t.star_level >= 4 AND t.assignee_id IS NOT NULL`;
      const replacements = [];
      
      if (projectId) {
        whereClause += ` AND t.project_id = ?`;
        replacements.push(projectId);
      }
      
      if (periodStart && periodEnd) {
        whereClause += ` AND t.completed_at BETWEEN ? AND ?`;
        replacements.push(periodStart, periodEnd);
      }
      
      const query = `
        SELECT 
          u.id as userId,
          u.username,
          u.first_name as firstName,
          u.last_name as lastName,
          u.avatar,
          COUNT(t.id) as highDiffTasks,
          SUM(CASE WHEN t.star_level = 4 THEN 1 ELSE 0 END) as star4Tasks,
          SUM(CASE WHEN t.star_level = 5 THEN 1 ELSE 0 END) as star5Tasks,
          AVG(t.star_level) as avgDifficulty
        FROM users u
        INNER JOIN bounty_tasks t ON u.id = t.assignee_id
        WHERE ${whereClause}
        GROUP BY u.id, u.username, u.first_name, u.last_name, u.avatar
        ORDER BY highDiffTasks DESC, star5Tasks DESC
        LIMIT ?
      `;
      
      replacements.push(limit);
      
      const results = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
      });
      
      return results.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        username: row.username,
        fullName: `${row.firstName} ${row.lastName}`,
        avatar: row.avatar,
        score: parseInt(row.highDiffTasks),
        details: {
          highDiffTasks: parseInt(row.highDiffTasks),
          star4Tasks: parseInt(row.star4Tasks),
          star5Tasks: parseInt(row.star5Tasks),
          avgDifficulty: parseFloat(row.avgDifficulty) || 0
        }
      }));
      
    } catch (error) {
      logger.error('获取高难度任务挑战榜单失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取专业能力榜单（按任务类型）
   * @param {string} taskType - 任务类型
   * @param {Object} options - 查询选项
   * @returns {Array} 榜单数据
   */
  static async getSpecialtyLeaderboard(taskType, options = {}) {
    const { projectId, periodStart, periodEnd, limit = 20 } = options;
    
    try {
      let whereClause = `t.status = 'completed' AND t.task_type = ? AND t.assignee_id IS NOT NULL`;
      const replacements = [taskType];
      
      if (projectId) {
        whereClause += ` AND t.project_id = ?`;
        replacements.push(projectId);
      }
      
      if (periodStart && periodEnd) {
        whereClause += ` AND t.completed_at BETWEEN ? AND ?`;
        replacements.push(periodStart, periodEnd);
      }
      
      const query = `
        SELECT 
          u.id as userId,
          u.username,
          u.first_name as firstName,
          u.last_name as lastName,
          u.avatar,
          COUNT(t.id) as specialtyTasks,
          SUM(COALESCE(t.actual_hours, 0)) as totalHours,
          AVG(t.star_level) as avgDifficulty,
          SUM(CASE WHEN t.completed_at <= t.due_date THEN 1 ELSE 0 END) as onTimeTasks
        FROM users u
        INNER JOIN bounty_tasks t ON u.id = t.assignee_id
        WHERE ${whereClause}
        GROUP BY u.id, u.username, u.first_name, u.last_name, u.avatar
        ORDER BY specialtyTasks DESC, totalHours DESC
        LIMIT ?
      `;
      
      replacements.push(limit);
      
      const results = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
      });
      
      return results.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        username: row.username,
        fullName: `${row.firstName} ${row.lastName}`,
        avatar: row.avatar,
        score: parseInt(row.specialtyTasks),
        details: {
          specialtyTasks: parseInt(row.specialtyTasks),
          totalHours: parseFloat(row.totalHours) || 0,
          avgDifficulty: parseFloat(row.avgDifficulty) || 0,
          onTimeTasks: parseInt(row.onTimeTasks),
          onTimeRate: row.specialtyTasks > 0 ? ((row.onTimeTasks / row.specialtyTasks) * 100).toFixed(1) : 0
        }
      }));
      
    } catch (error) {
      logger.error(`获取${taskType}专业能力榜单失败:`, error);
      throw error;
    }
  }
  
  /**
   * 获取综合榜单数据
   * @param {Object} options - 查询选项
   * @returns {Object} 包含多个榜单的数据
   */
  static async getComprehensiveLeaderboards(options = {}) {
    try {
      const [
        taskCompletion,
        hoursContribution,
        onTimeDelivery,
        difficultyChallenge,
        devTasks,
        testTasks,
        bugTasks
      ] = await Promise.all([
        this.getTaskCompletionLeaderboard({ ...options, limit: 10 }),
        this.getHoursContributionLeaderboard({ ...options, limit: 10 }),
        this.getOnTimeDeliveryLeaderboard({ ...options, limit: 10 }),
        this.getDifficultyChallengeLeaderboard({ ...options, limit: 10 }),
        this.getSpecialtyLeaderboard('dev_task', { ...options, limit: 10 }),
        this.getSpecialtyLeaderboard('test_task', { ...options, limit: 10 }),
        this.getSpecialtyLeaderboard('bug', { ...options, limit: 10 })
      ]);
      
      return {
        taskCompletion,
        hoursContribution,
        onTimeDelivery,
        difficultyChallenge,
        specialties: {
          development: devTasks,
          testing: testTasks,
          bugFix: bugTasks
        }
      };
      
    } catch (error) {
      logger.error('获取综合榜单失败:', error);
      throw error;
    }
  }
}

module.exports = LeaderboardService;
