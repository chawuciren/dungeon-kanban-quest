const { BountyTask } = require('../models');
const logger = require('../config/logger');

/**
 * 任务工时统计服务
 * 处理父子任务的工时汇总计算
 */
class TaskHoursService {
  
  /**
   * 计算任务的总工时（包含子任务）
   * @param {string} taskId - 任务ID
   * @returns {Object} 工时统计信息
   */
  static async calculateTotalHours(taskId) {
    try {
      const task = await BountyTask.findByPk(taskId);
      if (!task) {
        throw new Error('任务不存在');
      }

      // 获取所有子任务（递归）
      const allSubtasks = await this.getAllSubtasks(taskId);
      
      // 计算本任务工时
      const taskEstimated = parseFloat(task.estimatedHours || 0);
      const taskActual = parseFloat(task.actualHours || 0);
      
      // 计算子任务工时汇总
      let subtaskEstimatedTotal = 0;
      let subtaskActualTotal = 0;
      
      allSubtasks.forEach(subtask => {
        subtaskEstimatedTotal += parseFloat(subtask.estimatedHours || 0);
        subtaskActualTotal += parseFloat(subtask.actualHours || 0);
      });
      
      // 计算总工时
      const totalEstimated = taskEstimated + subtaskEstimatedTotal;
      const totalActual = taskActual + subtaskActualTotal;
      
      // 计算工时效率
      const taskEfficiency = taskEstimated > 0 && taskActual > 0 ? 
        (taskEstimated / taskActual * 100) : 0;
      const totalEfficiency = totalEstimated > 0 && totalActual > 0 ? 
        (totalEstimated / totalActual * 100) : 0;
      
      return {
        // 本任务工时
        task: {
          estimated: taskEstimated,
          actual: taskActual,
          efficiency: taskEfficiency
        },
        // 子任务工时汇总
        subtasks: {
          estimated: subtaskEstimatedTotal,
          actual: subtaskActualTotal,
          count: allSubtasks.length
        },
        // 总计工时
        total: {
          estimated: totalEstimated,
          actual: totalActual,
          efficiency: totalEfficiency
        }
      };
      
    } catch (error) {
      logger.error('计算任务总工时失败:', error);
      throw error;
    }
  }
  
  /**
   * 递归获取所有子任务
   * @param {string} parentId - 父任务ID
   * @returns {Array} 所有子任务列表
   */
  static async getAllSubtasks(parentId) {
    try {
      const directSubtasks = await BountyTask.findAll({
        where: { parentTaskId: parentId },
        attributes: ['id', 'estimatedHours', 'actualHours']
      });
      
      let allSubtasks = [...directSubtasks];
      
      // 递归获取每个子任务的子任务
      for (const subtask of directSubtasks) {
        const nestedSubtasks = await this.getAllSubtasks(subtask.id);
        allSubtasks = allSubtasks.concat(nestedSubtasks);
      }
      
      return allSubtasks;
      
    } catch (error) {
      logger.error('获取子任务失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取任务的工时统计摘要（用于列表显示）
   * @param {Array} tasks - 任务列表
   * @returns {Object} 任务ID到工时统计的映射
   */
  static async getTasksHoursSummary(tasks) {
    try {
      const summaryMap = {};
      
      for (const task of tasks) {
        const hoursInfo = await this.calculateTotalHours(task.id);
        summaryMap[task.id] = {
          hasSubtasks: hoursInfo.subtasks.count > 0,
          totalEstimated: hoursInfo.total.estimated,
          totalActual: hoursInfo.total.actual,
          efficiency: hoursInfo.total.efficiency
        };
      }
      
      return summaryMap;
      
    } catch (error) {
      logger.error('获取任务工时摘要失败:', error);
      throw error;
    }
  }
  
  /**
   * 验证工时记录的合理性
   * @param {Object} hoursData - 工时数据
   * @returns {Object} 验证结果
   */
  static validateHours(hoursData) {
    const warnings = [];
    const errors = [];
    
    const { estimated, actual } = hoursData;
    
    // 基本验证
    if (estimated < 0) {
      errors.push('预估工时不能为负数');
    }
    if (actual < 0) {
      errors.push('实际工时不能为负数');
    }
    
    // 合理性检查
    if (estimated > 0 && actual > 0) {
      const ratio = actual / estimated;
      
      if (ratio > 3) {
        warnings.push('实际工时超出预估工时300%，请检查是否合理');
      } else if (ratio > 2) {
        warnings.push('实际工时超出预估工时200%，建议检查原因');
      }
      
      if (ratio < 0.3) {
        warnings.push('实际工时远低于预估工时，建议调整预估方法');
      }
    }
    
    // 工时上限检查
    if (estimated > 200) {
      warnings.push('预估工时超过200小时，建议拆分任务');
    }
    if (actual > 200) {
      warnings.push('实际工时超过200小时，建议检查记录准确性');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = TaskHoursService;
