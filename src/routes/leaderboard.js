const express = require('express');
const router = express.Router();
const LeaderboardService = require('../services/leaderboardService');
const logger = require('../config/logger');

// 认证中间件
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    req.flash('error', '请先登录');
    return res.redirect('/login');
  }
  next();
};

/**
 * 榜单路由
 * 提供各种类型的团队表现统计和排行榜
 */

// 榜单首页 - 综合榜单展示
router.get('/', requireAuth, async (req, res) => {
  try {
    const { period = 'all_time', project } = req.query;
    
    // 构建查询选项
    const options = {
      projectId: project || null,
      limit: 10
    };
    
    // 根据时间周期设置时间范围
    if (period !== 'all_time') {
      const { periodStart, periodEnd } = getTimePeriod(period);
      options.periodStart = periodStart;
      options.periodEnd = periodEnd;
    }
    
    // 获取综合榜单数据
    const leaderboards = await LeaderboardService.getComprehensiveLeaderboards(options);
    
    // 获取项目列表（用于筛选）
    const { Project } = require('../models');
    const projects = await Project.findAll({
      attributes: ['id', 'name', 'key'],
      where: { status: 'active' },
      order: [['name', 'ASC']]
    });
    
    res.render('leaderboard/index', {
      title: '团队表现统计',
      leaderboards,
      projects,
      currentPeriod: period,
      currentProject: project,
      periodOptions: [
        { value: 'all_time', label: '全部时间' },
        { value: 'this_week', label: '本周' },
        { value: 'this_month', label: '本月' },
        { value: 'this_quarter', label: '本季度' },
        { value: 'this_year', label: '今年' }
      ]
    });
    
  } catch (error) {
    logger.error('获取榜单首页失败:', error);
    req.flash('error', '获取榜单数据失败');
    res.render('leaderboard/index', {
      title: '团队表现统计',
      leaderboards: {},
      projects: [],
      currentPeriod: 'all_time',
      currentProject: null,
      periodOptions: []
    });
  }
});

// 任务完成榜单
router.get('/task-completion', requireAuth, async (req, res) => {
  try {
    const { period = 'all_time', project, limit = 50 } = req.query;
    
    const options = {
      projectId: project || null,
      limit: parseInt(limit)
    };
    
    if (period !== 'all_time') {
      const { periodStart, periodEnd } = getTimePeriod(period);
      options.periodStart = periodStart;
      options.periodEnd = periodEnd;
    }
    
    const leaderboard = await LeaderboardService.getTaskCompletionLeaderboard(options);
    
    res.render('leaderboard/detail', {
      title: '任务完成排行榜',
      leaderboard,
      leaderboardType: 'task-completion',
      leaderboardName: '任务完成数量',
      scoreLabel: '完成任务数',
      currentPeriod: period,
      currentProject: project
    });
    
  } catch (error) {
    logger.error('获取任务完成榜单失败:', error);
    req.flash('error', '获取榜单数据失败');
    res.redirect('/leaderboard');
  }
});

// 工时贡献榜单
router.get('/hours-contribution', requireAuth, async (req, res) => {
  try {
    const { period = 'all_time', project, limit = 50 } = req.query;
    
    const options = {
      projectId: project || null,
      limit: parseInt(limit)
    };
    
    if (period !== 'all_time') {
      const { periodStart, periodEnd } = getTimePeriod(period);
      options.periodStart = periodStart;
      options.periodEnd = periodEnd;
    }
    
    const leaderboard = await LeaderboardService.getHoursContributionLeaderboard(options);
    
    res.render('leaderboard/detail', {
      title: '工时贡献排行榜',
      leaderboard,
      leaderboardType: 'hours-contribution',
      leaderboardName: '工时贡献',
      scoreLabel: '总工时',
      currentPeriod: period,
      currentProject: project
    });
    
  } catch (error) {
    logger.error('获取工时贡献榜单失败:', error);
    req.flash('error', '获取榜单数据失败');
    res.redirect('/leaderboard');
  }
});

// 按时交付率榜单
router.get('/on-time-delivery', requireAuth, async (req, res) => {
  try {
    const { period = 'all_time', project, limit = 50 } = req.query;
    
    const options = {
      projectId: project || null,
      limit: parseInt(limit),
      minTasks: 3 // 最少完成3个任务才能上榜
    };
    
    if (period !== 'all_time') {
      const { periodStart, periodEnd } = getTimePeriod(period);
      options.periodStart = periodStart;
      options.periodEnd = periodEnd;
    }
    
    const leaderboard = await LeaderboardService.getOnTimeDeliveryLeaderboard(options);
    
    res.render('leaderboard/detail', {
      title: '按时交付率排行榜',
      leaderboard,
      leaderboardType: 'on-time-delivery',
      leaderboardName: '按时交付率',
      scoreLabel: '按时率 (%)',
      currentPeriod: period,
      currentProject: project
    });
    
  } catch (error) {
    logger.error('获取按时交付率榜单失败:', error);
    req.flash('error', '获取榜单数据失败');
    res.redirect('/leaderboard');
  }
});

// 高难度任务挑战榜单
router.get('/difficulty-challenge', requireAuth, async (req, res) => {
  try {
    const { period = 'all_time', project, limit = 50 } = req.query;
    
    const options = {
      projectId: project || null,
      limit: parseInt(limit)
    };
    
    if (period !== 'all_time') {
      const { periodStart, periodEnd } = getTimePeriod(period);
      options.periodStart = periodStart;
      options.periodEnd = periodEnd;
    }
    
    const leaderboard = await LeaderboardService.getDifficultyChallengeLeaderboard(options);
    
    res.render('leaderboard/detail', {
      title: '高难度任务挑战榜',
      leaderboard,
      leaderboardType: 'difficulty-challenge',
      leaderboardName: '高难度任务挑战',
      scoreLabel: '高难度任务数',
      currentPeriod: period,
      currentProject: project
    });
    
  } catch (error) {
    logger.error('获取高难度任务挑战榜单失败:', error);
    req.flash('error', '获取榜单数据失败');
    res.redirect('/leaderboard');
  }
});

// 专业能力榜单
router.get('/specialty/:taskType', requireAuth, async (req, res) => {
  try {
    const { taskType } = req.params;
    const { period = 'all_time', project, limit = 50 } = req.query;
    
    // 验证任务类型
    const validTaskTypes = {
      'dev_task': '开发能力',
      'test_task': '测试能力',
      'design_task': '设计能力',
      'devops_task': '运维能力',
      'bug': 'Bug处理能力',
      'requirement': '需求分析能力'
    };
    
    if (!validTaskTypes[taskType]) {
      req.flash('error', '无效的专业能力类型');
      return res.redirect('/leaderboard');
    }
    
    const options = {
      projectId: project || null,
      limit: parseInt(limit)
    };
    
    if (period !== 'all_time') {
      const { periodStart, periodEnd } = getTimePeriod(period);
      options.periodStart = periodStart;
      options.periodEnd = periodEnd;
    }
    
    const leaderboard = await LeaderboardService.getSpecialtyLeaderboard(taskType, options);
    
    res.render('leaderboard/detail', {
      title: `${validTaskTypes[taskType]}排行榜`,
      leaderboard,
      leaderboardType: `specialty-${taskType}`,
      leaderboardName: validTaskTypes[taskType],
      scoreLabel: '专业任务数',
      currentPeriod: period,
      currentProject: project
    });
    
  } catch (error) {
    logger.error('获取专业能力榜单失败:', error);
    req.flash('error', '获取榜单数据失败');
    res.redirect('/leaderboard');
  }
});

/**
 * 根据时间周期获取开始和结束时间
 * @param {string} period - 时间周期
 * @returns {Object} 包含开始和结束时间的对象
 */
function getTimePeriod(period) {
  const now = new Date();
  let periodStart, periodEnd;
  
  switch (period) {
    case 'this_week':
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      periodStart = startOfWeek;
      periodEnd = new Date(now);
      break;
      
    case 'this_month':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now);
      break;
      
    case 'this_quarter':
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      periodStart = new Date(now.getFullYear(), quarterStart, 1);
      periodEnd = new Date(now);
      break;
      
    case 'this_year':
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now);
      break;
      
    default:
      periodStart = null;
      periodEnd = null;
  }
  
  return { periodStart, periodEnd };
}

module.exports = router;
