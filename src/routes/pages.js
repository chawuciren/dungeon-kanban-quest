const express = require('express');
const router = express.Router();
const { User, UserWallet, BountyTask, Project } = require('../models');
const { Op } = require('sequelize');

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
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'defaultRole', 'skillLevel', 'createdAt']
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

    // 获取用户的任务统计
    const taskStats = await BountyTask.findAll({
      where: {
        [Op.or]: [
          { publisherId: req.session.userId },
          { assigneeId: req.session.userId }
        ]
      },
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
      where: {
        [Op.or]: [
          { publisherId: req.session.userId },
          { assigneeId: req.session.userId }
        ]
      },
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
      userSkill
    });

  } catch (error) {
    console.error('获取仪表板数据失败:', error);
    res.render('dashboard/index', {
      title: '仪表板',
      user: null,
      wallet: null,
      taskStats: { total: 0, completed: 0 },
      recentTasks: [],
      userSkill: { icon: '🔰', name: '新手', progress: 20 }
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
router.get('/wallet', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  res.render('wallet/index', {
    title: '我的钱包'
  });
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

module.exports = router;
