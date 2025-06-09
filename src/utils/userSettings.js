const { UserSettings } = require('../models');

/**
 * 获取用户设置，如果不存在则创建默认设置
 * @param {string} userId - 用户ID
 * @returns {Promise<UserSettings>} 用户设置对象
 */
async function getUserSettings(userId) {
  if (!userId) {
    // 返回默认设置
    return {
      defaultTaskView: 'list',
      tasksPerPage: 20,
      defaultTaskSort: 'created',
      ganttDefaultGranularity: 'day',
      defaultTaskType: 'task'
    };
  }

  let userSettings = await UserSettings.findOne({
    where: { userId }
  });

  // 如果用户没有设置记录，创建默认设置
  if (!userSettings) {
    userSettings = await UserSettings.create({
      userId
    });
  }

  return userSettings;
}

/**
 * 应用用户设置到查询参数
 * @param {Object} query - 原始查询参数
 * @param {UserSettings} userSettings - 用户设置
 * @returns {Object} 应用设置后的查询参数
 */
function applyUserSettingsToQuery(query, userSettings) {
  const appliedQuery = { ...query };

  // 如果没有指定排序方式，使用用户默认设置
  if (!appliedQuery.sort) {
    appliedQuery.sort = userSettings.defaultTaskSort;
  }

  return appliedQuery;
}

/**
 * 获取分页参数，应用用户设置
 * @param {Object} query - 查询参数
 * @param {UserSettings} userSettings - 用户设置
 * @returns {Object} 分页参数 { page, limit, offset }
 */
function getPaginationParams(query, userSettings) {
  const page = parseInt(query.page) || 1;
  const limit = userSettings.tasksPerPage || 20;
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * 获取甘特图视图参数，应用用户设置
 * @param {Object} query - 查询参数
 * @param {UserSettings} userSettings - 用户设置
 * @returns {Object} 甘特图参数
 */
function getGanttParams(query, userSettings) {
  return {
    granularity: query.granularity || userSettings.ganttDefaultGranularity || 'day'
  };
}

module.exports = {
  getUserSettings,
  applyUserSettingsToQuery,
  getPaginationParams,
  getGanttParams
};
