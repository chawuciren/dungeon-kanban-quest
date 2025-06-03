const express = require('express');
const router = express.Router();
const { User, UserWallet, BountyTask, Project, CurrencyTransaction } = require('../models');
const { Op } = require('sequelize');
const TransactionService = require('../services/TransactionService');
const CheckinService = require('../services/CheckinService');
const ExchangeService = require('../services/ExchangeService');

// 首页
router.get('/', (req, res) => {
  res.render('index', {
    title: '欢迎使用Kanban项目管理系统'
  });
});

// 登录页面
router.get('/login', (req, res) => {
  // 如果已登录，重定向到仪表板
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }

  res.render('auth/login', {
    title: '用户登录'
  });
});

// 登录处理
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    // 验证输入
    if (!login || !password) {
      req.flash('error', '请输入用户名和密码');
      return res.redirect('/login');
    }

    const { User, UserWallet } = require('../models');
    const { Op } = require('sequelize');

    // 查找用户
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username: login },
          { email: login }
        ]
      },
      include: [{
        model: UserWallet,
        as: 'wallet'
      }]
    });

    if (!user) {
      req.flash('error', '用户名或密码错误');
      return res.redirect('/login');
    }

    // 验证密码
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      req.flash('error', '用户名或密码错误');
      return res.redirect('/login');
    }

    // 检查用户状态
    if (user.status !== 'active') {
      req.flash('error', '账户已被禁用，请联系管理员');
      return res.redirect('/login');
    }

    // 更新最后登录时间
    await user.update({ lastLoginAt: new Date() });

    // 设置会话
    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      skillLevel: user.skillLevel
    };

    const logger = require('../config/logger');
    logger.info(`用户登录成功: ${user.username}`, { userId: user.id });

    req.flash('success', '登录成功！');
    res.redirect('/dashboard');

  } catch (error) {
    const logger = require('../config/logger');
    logger.error('登录失败:', error);
    req.flash('error', '登录失败，请稍后重试');
    res.redirect('/login');
  }
});

// 注册页面
router.get('/register', (req, res) => {
  // 如果已登录，重定向到仪表板
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }

  res.render('auth/register', {
    title: '用户注册'
  });
});

// 退出登录
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('退出登录失败:', err);
    }
    res.redirect('/');
  });
});

// 仪表板
router.get('/dashboard', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    // 获取用户信息
    const user = await User.findByPk(req.session.userId, {
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'skillLevel', 'createdAt']
    });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    // 获取用户钱包信息
    let wallet = await UserWallet.findOne({
      where: { userId: req.session.userId }
    });

    // 如果钱包不存在，创建一个
    if (!wallet) {
      wallet = await UserWallet.create({
        userId: req.session.userId,
        diamondBalance: 0,
        goldBalance: 0,
        silverBalance: 0,
        copperBalance: 0
      });
    }

    // 构建任务查询条件 - 显示用户的所有任务，不限制项目
    const taskWhere = {
      [Op.or]: [
        { publisherId: req.session.userId },
        { assigneeId: req.session.userId }
      ]
    };

    // 获取用户的任务统计
    const taskStats = await BountyTask.findAll({
      where: taskWhere,
      attributes: ['status'],
      raw: true
    });

    // 统计任务数量
    const totalTasks = taskStats.filter(task =>
      ['in_progress', 'pending_review'].includes(task.status)
    ).length;

    const completedTasks = taskStats.filter(task =>
      task.status === 'completed'
    ).length;

    // 获取用户最近的任务（最多5个）
    const recentTasks = await BountyTask.findAll({
      where: taskWhere,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['name', 'key']
        }
      ],
      order: [['updatedAt', 'DESC']],
      limit: 5
    });

    // 获取用户参与的所有项目
    let userProjects = [];
    if (req.session.user?.role === 'admin') {
      // 管理员可以看到所有项目
      userProjects = await Project.findAll({
        attributes: ['id', 'name', 'key', 'description', 'projectType', 'starLevel', 'status', 'color'],
        include: [
          {
            model: User,
            as: 'owner',
            attributes: ['id', 'firstName', 'lastName']
          }
        ],
        where: { status: 'active' },
        order: [['name', 'ASC']]
      });
    } else {
      // 普通用户只能看到自己参与的项目
      const { Op } = require('sequelize');

      // 查询用户作为owner或leader的项目
      const ownedProjects = await Project.findAll({
        attributes: ['id', 'name', 'key', 'description', 'projectType', 'starLevel', 'status', 'color'],
        include: [
          {
            model: User,
            as: 'owner',
            attributes: ['id', 'firstName', 'lastName']
          }
        ],
        where: {
          [Op.and]: [
            { status: 'active' },
            {
              [Op.or]: [
                { ownerId: req.session.userId },
                { leaderId: req.session.userId }
              ]
            }
          ]
        }
      });

      // 查询用户作为成员的项目
      const memberProjects = await Project.findAll({
        attributes: ['id', 'name', 'key', 'description', 'projectType', 'starLevel', 'status', 'color'],
        include: [
          {
            model: User,
            as: 'owner',
            attributes: ['id', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'members',
            where: { id: req.session.userId },
            attributes: [],
            through: {
              where: { status: 'active' },
              attributes: []
            }
          }
        ],
        where: { status: 'active' }
      });

      // 合并并去重
      const allProjects = [...ownedProjects, ...memberProjects];
      const uniqueProjects = allProjects.filter((project, index, self) =>
        index === self.findIndex(p => p.id === project.id)
      );

      userProjects = uniqueProjects.sort((a, b) => a.name.localeCompare(b.name));
    }

    // 技能等级配置
    const skillConfig = {
      novice: { icon: '🔰', name: '新手', progress: 20 },
      bronze: { icon: '🥉', name: '铜牌', progress: 40 },
      silver: { icon: '🥈', name: '银牌', progress: 60 },
      gold: { icon: '🥇', name: '金牌', progress: 80 },
      diamond: { icon: '💎', name: '钻石', progress: 100 }
    };

    const userSkill = skillConfig[user.skillLevel] || skillConfig.novice;

    res.render('dashboard/index', {
      title: '仪表板',
      user,
      wallet,
      taskStats: {
        total: totalTasks,
        completed: completedTasks
      },
      recentTasks,
      userSkill,
      userProjects,
      selectedProject: req.session.selectedProjectId ? userProjects.find(p => p.id === req.session.selectedProjectId) : null
    });

  } catch (error) {
    console.error('获取仪表板数据失败:', error);
    res.render('dashboard/index', {
      title: '仪表板',
      user: null,
      wallet: null,
      taskStats: { total: 0, completed: 0 },
      recentTasks: [],
      userSkill: { icon: '🔰', name: '新手', progress: 20 },
      userProjects: [],
      selectedProject: null
    });
  }
});

// 项目路由已移到 /routes/projects.js

// 任务市场路由已移到 /routes/tasks.js

// 排行榜
router.get('/leaderboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  res.render('leaderboard/index', {
    title: '排行榜'
  });
});

// 钱包
router.get('/wallet', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    // 获取用户信息
    const user = await User.findByPk(req.session.userId, {
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
    });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    // 获取用户钱包信息
    let wallet = await UserWallet.findOne({
      where: { userId: req.session.userId }
    });

    // 如果钱包不存在，创建一个
    if (!wallet) {
      wallet = await UserWallet.create({
        userId: req.session.userId,
        diamondBalance: 0,
        goldBalance: 0,
        silverBalance: 0,
        copperBalance: 0,
        frozenDiamond: 0,
        frozenGold: 0,
        frozenSilver: 0,
        frozenCopper: 0,
        totalEarned: 0,
        totalSpent: 0
      });
    }

    // 计算总资产（以铜币为单位）
    const config = require('../config');
    const rates = config.gamification.currencyRates;
    const totalAssets =
      wallet.diamondBalance * rates.diamond * rates.gold * rates.silver +
      wallet.goldBalance * rates.gold * rates.silver +
      wallet.silverBalance * rates.silver +
      wallet.copperBalance;

    // 检查是否可以签到
    const canCheckin = await CheckinService.canCheckin(req.session.userId);

    // 获取签到奖励预览
    const rewardPreview = CheckinService.getRewardPreview(user);



    // 获取分页参数
    const page = parseInt(req.query.page) || 1;
    const pageSize = 8;

    // 获取用户的交易记录
    const transactionData = await TransactionService.getUserTransactions(req.session.userId, {
      page,
      limit: pageSize
    });

    res.render('wallet/index', {
      title: '我的钱包',
      user,
      wallet,
      canCheckin,
      rewardPreview,
      currentPage: page,
      pageSize,
      transactions: transactionData.transactions,
      pagination: transactionData.pagination,
      successMessage: req.session.successMessage,
      errorMessage: req.session.errorMessage
    });

    // 清除消息
    delete req.session.successMessage;
    delete req.session.errorMessage;

  } catch (error) {
    console.error('获取钱包数据失败:', error);
    const page = parseInt(req.query.page) || 1;
    const pageSize = 8;

    res.render('wallet/index', {
      title: '我的钱包',
      user: null,
      wallet: null,
      canCheckin: false,
      rewardPreview: null,
      currentPage: page,
      pageSize,
      transactions: [],
      pagination: { page, limit: pageSize, total: 0, totalPages: 0 }
    });
  }
});

// 货币兑换页面
router.get('/wallet/exchange', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    // 获取用户信息
    const user = await User.findByPk(req.session.userId, {
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
    });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    // 获取用户钱包信息
    let wallet = await UserWallet.findOne({
      where: { userId: req.session.userId }
    });

    // 如果钱包不存在，创建一个
    if (!wallet) {
      wallet = await UserWallet.create({
        userId: req.session.userId,
        diamondBalance: 0,
        goldBalance: 0,
        silverBalance: 0,
        copperBalance: 0,
        frozenDiamond: 0,
        frozenGold: 0,
        frozenSilver: 0,
        frozenCopper: 0,
        totalEarned: 0,
        totalSpent: 0
      });
    }

    // 获取支持的货币类型
    const currencies = ExchangeService.getSupportedCurrencies();

    res.render('wallet/exchange', {
      title: '货币兑换',
      user,
      wallet,
      currencies,
      errorMessage: req.session.errorMessage
    });

    // 清除错误消息
    delete req.session.errorMessage;

  } catch (error) {
    console.error('获取兑换页面数据失败:', error);
    res.render('wallet/exchange', {
      title: '货币兑换',
      user: null,
      wallet: null,
      currencies: []
    });
  }
});

// 个人资料
router.get('/profile', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  res.render('profile/index', {
    title: '个人资料'
  });
});

// 选择项目
router.get('/select-project/:id', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const projectId = req.params.id;
    const { Project, User } = require('../models');

    // 验证项目是否存在且用户有权限访问
    let hasAccess = false;

    if (req.session.user?.role === 'admin') {
      // 管理员可以访问所有项目
      const project = await Project.findByPk(projectId);
      hasAccess = !!project;
    } else {
      // 普通用户只能访问自己参与的项目（owner、leader或member）
      const { Op } = require('sequelize');

      // 检查是否为owner或leader
      const ownedProject = await Project.findOne({
        where: {
          id: projectId,
          [Op.or]: [
            { ownerId: req.session.userId },
            { leaderId: req.session.userId }
          ]
        }
      });

      if (ownedProject) {
        hasAccess = true;
      } else {
        // 检查是否为成员
        const memberProject = await Project.findOne({
          where: { id: projectId },
          include: [{
            model: User,
            as: 'members',
            where: { id: req.session.userId },
            attributes: [],
            through: {
              where: { status: 'active' },
              attributes: []
            }
          }]
        });
        hasAccess = !!memberProject;
      }
    }

    if (hasAccess) {
      req.session.selectedProjectId = projectId;
      req.flash('success', '大陆选择成功');
    } else {
      req.flash('error', '您没有权限访问此大陆');
    }

    // 重定向到来源页面或仪表盘
    const referer = req.get('Referer');
    if (referer && referer.includes(req.get('Host'))) {
      res.redirect(referer);
    } else {
      res.redirect('/dashboard');
    }

  } catch (error) {
    console.error('选择项目失败:', error);
    req.flash('error', '选择大陆失败');
    res.redirect('/dashboard');
  }
});

// 清除项目选择
router.get('/clear-project', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  req.session.selectedProjectId = null;
  req.flash('info', '已清除大陆选择');

  // 重定向到来源页面或仪表盘
  const referer = req.get('Referer');
  if (referer && referer.includes(req.get('Host'))) {
    res.redirect(referer);
  } else {
    res.redirect('/dashboard');
  }
});

// 项目选择页面
router.get('/select-project', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  res.render('project-selection', {
    title: '选择探险大陆'
  });
});

module.exports = router;
