const { ActivityLog } = require('../models');

/**
 * 活动记录工具类
 * 用于记录用户在系统中的各种操作
 */
class ActivityLogger {
  
  /**
   * 记录活动
   * @param {Object} data 活动数据
   * @param {string} data.userId 用户ID
   * @param {string} data.actionType 操作类型
   * @param {string} data.description 操作描述
   * @param {string} [data.entityType] 实体类型
   * @param {string} [data.entityId] 实体ID
   * @param {string} [data.projectId] 项目ID
   * @param {Object} [data.oldData] 操作前数据
   * @param {Object} [data.newData] 操作后数据
   * @param {Object} [data.metadata] 额外元数据
   * @param {Object} [req] Express请求对象（用于获取IP和User-Agent）
   */
  static async log(data, req = null) {
    try {
      const activityData = {
        ...data,
        ipAddress: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.get('User-Agent')
      };

      return await ActivityLog.create(activityData);
    } catch (error) {
      console.error('记录活动失败:', error);
      return null;
    }
  }

  /**
   * 记录任务创建活动
   */
  static async logTaskCreated(userId, task, projectId, req = null) {
    return await this.log({
      userId,
      actionType: 'task_created',
      description: `创建了任务"${task.title}"`,
      entityType: 'task',
      entityId: task.id,
      projectId,
      newData: {
        title: task.title,
        taskType: task.taskType,
        starLevel: task.starLevel,
        urgencyLevel: task.urgencyLevel
      }
    }, req);
  }

  /**
   * 记录任务更新活动
   */
  static async logTaskUpdated(userId, task, oldData, newData, req = null) {
    return await this.log({
      userId,
      actionType: 'task_updated',
      description: `更新了任务"${task.title}"`,
      entityType: 'task',
      entityId: task.id,
      projectId: task.projectId,
      oldData,
      newData
    }, req);
  }

  /**
   * 记录任务状态变更活动
   */
  static async logTaskStatusChanged(userId, task, oldStatus, newStatus, req = null) {
    const statusTexts = {
      'draft': '草稿',
      'published': '已发布',
      'in_progress': '进行中',
      'review': '待审核',
      'completed': '已完成',
      'cancelled': '已取消'
    };

    return await this.log({
      userId,
      actionType: 'task_status_changed',
      description: `将任务"${task.title}"状态从"${statusTexts[oldStatus] || oldStatus}"更改为"${statusTexts[newStatus] || newStatus}"`,
      entityType: 'task',
      entityId: task.id,
      projectId: task.projectId,
      oldData: { status: oldStatus },
      newData: { status: newStatus }
    }, req);
  }

  /**
   * 记录任务分配活动
   */
  static async logTaskAssigned(userId, task, assigneeId, assigneeName, req = null) {
    return await this.log({
      userId,
      actionType: 'task_assigned',
      description: `将任务"${task.title}"分配给了${assigneeName}`,
      entityType: 'task',
      entityId: task.id,
      projectId: task.projectId,
      newData: { assigneeId, assigneeName }
    }, req);
  }

  /**
   * 记录任务完成活动
   */
  static async logTaskCompleted(userId, task, req = null) {
    return await this.log({
      userId,
      actionType: 'task_completed',
      description: `完成了任务"${task.title}"`,
      entityType: 'task',
      entityId: task.id,
      projectId: task.projectId,
      newData: { completedAt: new Date() }
    }, req);
  }

  /**
   * 记录项目创建活动
   */
  static async logProjectCreated(userId, project, req = null) {
    return await this.log({
      userId,
      actionType: 'project_created',
      description: `创建了项目"${project.name}"`,
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      newData: {
        name: project.name,
        key: project.key,
        projectType: project.projectType
      }
    }, req);
  }

  /**
   * 记录项目更新活动
   */
  static async logProjectUpdated(userId, project, oldData, newData, req = null) {
    return await this.log({
      userId,
      actionType: 'project_updated',
      description: `更新了项目"${project.name}"`,
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      oldData,
      newData
    }, req);
  }

  /**
   * 记录加入项目活动
   */
  static async logProjectJoined(userId, project, memberName, req = null) {
    return await this.log({
      userId,
      actionType: 'project_joined',
      description: `${memberName}加入了项目"${project.name}"`,
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      newData: { memberName }
    }, req);
  }

  /**
   * 记录迭代创建活动
   */
  static async logSprintCreated(userId, sprint, req = null) {
    return await this.log({
      userId,
      actionType: 'sprint_created',
      description: `创建了迭代"${sprint.name}"`,
      entityType: 'sprint',
      entityId: sprint.id,
      projectId: sprint.projectId,
      newData: {
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate
      }
    }, req);
  }

  /**
   * 记录迭代开始活动
   */
  static async logSprintStarted(userId, sprint, req = null) {
    return await this.log({
      userId,
      actionType: 'sprint_started',
      description: `开始了迭代"${sprint.name}"`,
      entityType: 'sprint',
      entityId: sprint.id,
      projectId: sprint.projectId,
      newData: { status: 'active' }
    }, req);
  }

  /**
   * 记录用户登录活动
   */
  static async logUserLogin(userId, req = null) {
    return await this.log({
      userId,
      actionType: 'user_login',
      description: '登录了系统',
      entityType: 'user',
      entityId: userId
    }, req);
  }

  /**
   * 记录用户登出活动
   */
  static async logUserLogout(userId, req = null) {
    return await this.log({
      userId,
      actionType: 'user_logout',
      description: '退出了系统',
      entityType: 'user',
      entityId: userId
    }, req);
  }

  /**
   * 获取用户最近的活动
   */
  static async getUserRecentActivities(userId, limit = 10) {
    return await ActivityLog.getUserRecentActivities(userId, limit);
  }

  /**
   * 获取项目最近的活动
   */
  static async getProjectRecentActivities(projectId, limit = 10) {
    return await ActivityLog.getProjectRecentActivities(projectId, limit);
  }

  /**
   * 获取用户在特定项目中的活动
   */
  static async getUserProjectActivities(userId, projectId, limit = 10) {
    const { User } = require('../models');
    return await ActivityLog.findAll({
      where: {
        userId,
        projectId
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });
  }
}

module.exports = ActivityLogger;
