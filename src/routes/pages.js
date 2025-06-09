const express = require('express');
const router = express.Router();
const { User, BountyTask, Project } = require('../models');
const { Op } = require('sequelize');
const { loadUserProjects } = require('../middleware/projects');

// 首页
router.get('/', (req, res) => {
  res.render('index', {
    title: '欢迎使用Kanban项目管理系统'
  });
});

// 登录页面
router.get('/login', (req, res) => {
  try {
    // 如果已登录，重定向到仪表板
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }

    res.render('auth/login', {
      title: '用户登录'
    });
  } catch (error) {
    console.error('登录页面渲染错误:', error);
    res.status(500).send('系统出现错误，请刷新页面重试。');
  }
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

    const { User } = require('../models');
    const { Op } = require('sequelize');

    // 查找用户
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username: login },
          { email: login }
        ]
      }
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
      role: user.role
    };

    const logger = require('../config/logger');
    logger.info(`用户登录成功: ${user.username}`, { userId: user.id });

    // 记录登录活动
    const ActivityLogger = require('../utils/activityLogger');
    await ActivityLogger.logUserLogin(user.id, req);

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
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'createdAt']
    });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
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

    // 获取用户最近的活动记录（最多10个）
    const { ActivityLog } = require('../models');
    let recentActivities = [];

    try {
      const { Op } = require('sequelize');

      if (req.session.selectedProjectId) {
        // 如果选择了项目，获取该项目的活动记录 + 用户的非项目相关活动
        recentActivities = await ActivityLog.findAll({
          where: {
            [Op.or]: [
              // 该项目的活动
              { projectId: req.session.selectedProjectId },
              // 用户的非项目相关活动（如登录、登出等）
              {
                userId: req.session.userId,
                projectId: null,
                actionType: {
                  [Op.in]: ['user_login', 'user_logout', 'other']
                }
              }
            ]
          },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'firstName', 'lastName']
            }
          ],
          order: [['createdAt', 'DESC']],
          limit: 10
        });
      } else {
        // 否则获取用户的活动记录
        recentActivities = await ActivityLog.findAll({
          where: { userId: req.session.userId },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'firstName', 'lastName']
            }
          ],
          order: [['createdAt', 'DESC']],
          limit: 10
        });
      }
    } catch (error) {
      console.error('获取活动记录失败:', error);
    }

    // 项目信息已经通过中间件加载到 res.locals.userProjects
    const userProjects = res.locals.userProjects || [];

    res.render('dashboard/index', {
      title: '仪表板',
      user,
      taskStats: {
        total: totalTasks,
        completed: completedTasks
      },
      recentTasks,
      recentActivities,
      userProjects,
      selectedProject: res.locals.selectedProject
    });

  } catch (error) {
    console.error('获取仪表板数据失败:', error);
    res.render('dashboard/index', {
      title: '仪表板',
      user: null,
      taskStats: { total: 0, completed: 0 },
      recentTasks: [],
      recentActivities: [],
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



// 个人资料
router.get('/profile', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const user = await User.findByPk(req.session.userId);

    if (!user) {
      req.flash('error', '用户不存在');
      return res.redirect('/login');
    }

    res.render('profile/index', {
      title: '个人资料',
      user
    });

  } catch (error) {
    console.error('获取个人资料失败:', error);
    req.flash('error', '获取个人资料失败');
    res.redirect('/dashboard');
  }
});

// 个人资料编辑页面
router.get('/profile/edit', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const user = await User.findByPk(req.session.userId);
    if (!user) {
      req.flash('error', '用户不存在');
      return res.redirect('/login');
    }

    const { getAllRoles } = require('../config/roles');

    res.render('profile/edit', {
      title: '编辑个人资料',
      user,
      roles: getAllRoles(),
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });

    // 清除消息
    delete req.session.errorMessage;
    delete req.session.successMessage;

  } catch (error) {
    console.error('获取编辑页面失败:', error);
    req.flash('error', '获取编辑页面失败');
    res.redirect('/profile');
  }
});

// 个人资料编辑处理
const { handleAvatarUpload, deleteOldAvatar } = require('../middleware/upload');
router.post('/profile/edit', handleAvatarUpload, async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const user = await User.findByPk(req.session.userId);
    if (!user) {
      req.session.errorMessage = '用户不存在';
      return res.redirect('/profile/edit');
    }

    const {
      email,
      firstName,
      lastName,
      phone,
      timezone,
      language,
      currentPassword,
      newPassword,
      confirmPassword,
      removeAvatar
    } = req.body;

    // 验证必填字段
    if (!email || !firstName || !lastName) {
      req.session.errorMessage = '请填写所有必填字段';
      return res.redirect('/profile/edit');
    }

    // 检查邮箱是否被其他用户使用
    if (email !== user.email) {
      const existingUser = await User.findOne({
        where: {
          email,
          id: { [Op.ne]: req.session.userId }
        }
      });

      if (existingUser) {
        req.session.errorMessage = '邮箱已被其他用户使用';
        return res.redirect('/profile/edit');
      }
    }

    // 密码修改验证
    if (currentPassword || newPassword || confirmPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        req.session.errorMessage = '修改密码时，请填写完整的密码信息';
        return res.redirect('/profile/edit');
      }

      // 验证当前密码
      const isValidPassword = await user.validatePassword(currentPassword);
      if (!isValidPassword) {
        req.session.errorMessage = '当前密码不正确';
        return res.redirect('/profile/edit');
      }

      // 验证新密码
      if (newPassword.length < 6) {
        req.session.errorMessage = '新密码长度至少6个字符';
        return res.redirect('/profile/edit');
      }

      if (newPassword !== confirmPassword) {
        req.session.errorMessage = '新密码和确认密码不匹配';
        return res.redirect('/profile/edit');
      }
    }

    // 准备更新数据
    const updateData = {
      email,
      firstName,
      lastName,
      phone: phone || null,
      timezone,
      language
    };

    // 如果有新密码，添加到更新数据中
    if (newPassword) {
      updateData.password = newPassword;
    }

    // 处理头像
    if (removeAvatar === '1') {
      // 删除旧头像文件
      if (user.avatar) {
        deleteOldAvatar(user.avatar);
      }
      updateData.avatar = null;
    } else if (req.file) {
      // 上传了新头像
      // 删除旧头像文件
      if (user.avatar) {
        deleteOldAvatar(user.avatar);
      }
      // 设置新头像路径
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
    }

    // 更新用户信息
    await user.update(updateData);

    // 更新会话中的用户信息
    req.session.user = {
      ...req.session.user,
      email: updateData.email,
      firstName: updateData.firstName,
      lastName: updateData.lastName
    };

    req.session.successMessage = '个人资料更新成功';
    res.redirect('/profile');

  } catch (error) {
    console.error('更新个人资料失败:', error);
    req.session.errorMessage = '更新个人资料失败，请稍后重试';
    res.redirect('/profile/edit');
  }
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
      req.flash('success', '项目选择成功');
    } else {
      req.flash('error', '您没有权限访问此项目');
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
    req.flash('error', '选择项目失败');
    res.redirect('/dashboard');
  }
});

// 清除项目选择
router.get('/clear-project', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  req.session.selectedProjectId = null;
  req.flash('info', '已清除项目选择');

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
    title: '选择项目'
  });
});

// 用户设置页面
router.get('/settings', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const { User, UserSettings } = require('../models');
    const { getAllTaskTypes } = require('../config/taskTypes');

    const user = await User.findByPk(req.session.userId, {
      include: [
        {
          model: UserSettings,
          as: 'settings',
          required: false
        }
      ]
    });

    if (!user) {
      req.flash('error', '用户不存在');
      return res.redirect('/login');
    }

    // 如果用户没有设置记录，创建默认设置
    let userSettings = user.settings;
    if (!userSettings) {
      userSettings = await UserSettings.create({
        userId: user.id
      });
    }

    res.render('settings/index', {
      title: '用户设置',
      user,
      userSettings,
      taskTypes: getAllTaskTypes(),
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });

    // 清除消息
    delete req.session.errorMessage;
    delete req.session.successMessage;

  } catch (error) {
    console.error('获取用户设置失败:', error);
    req.flash('error', '获取用户设置失败');
    res.redirect('/profile');
  }
});

// 用户设置更新处理
router.post('/settings', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const { UserSettings } = require('../models');
    const {
      defaultTaskView,
      tasksPerPage,
      defaultTaskSort,
      ganttDefaultGranularity,
      defaultTaskType
    } = req.body;

    // 验证必填字段
    if (!defaultTaskView || !tasksPerPage || !defaultTaskSort || !ganttDefaultGranularity || !defaultTaskType) {
      req.session.errorMessage = '请填写所有必填字段';
      return res.redirect('/settings');
    }

    // 验证数值范围
    const tasksPerPageNum = parseInt(tasksPerPage);
    if (isNaN(tasksPerPageNum) || tasksPerPageNum < 10 || tasksPerPageNum > 100) {
      req.session.errorMessage = '每页显示任务数量必须在10-100之间';
      return res.redirect('/settings');
    }

    // 查找或创建用户设置
    let userSettings = await UserSettings.findOne({
      where: { userId: req.session.userId }
    });

    const updateData = {
      defaultTaskView,
      tasksPerPage: tasksPerPageNum,
      defaultTaskSort,
      ganttDefaultGranularity,
      defaultTaskType
    };

    if (userSettings) {
      // 更新现有设置
      await userSettings.update(updateData);
    } else {
      // 创建新设置
      await UserSettings.create({
        userId: req.session.userId,
        ...updateData
      });
    }

    req.session.successMessage = '设置保存成功';
    res.redirect('/settings');

  } catch (error) {
    console.error('更新用户设置失败:', error);
    req.session.errorMessage = '更新设置失败，请稍后重试';
    res.redirect('/settings');
  }
});

module.exports = router;
