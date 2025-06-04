const logger = require('../config/logger');

/**
 * 项目查询中间件
 * 用于获取用户可访问的项目列表和当前选中的项目
 */
const loadUserProjects = async (req, res, next) => {
  try {
    // 只有登录用户才需要查询项目
    if (!req.session?.userId) {
      res.locals.userProjects = [];
      res.locals.selectedProject = null;
      return next();
    }

    const { Project, User } = require('../models');
    const { Op } = require('sequelize');

    // 获取用户可访问的项目列表
    let userProjects = [];

    if (req.session.user?.role === 'admin') {
      // 管理员可以看到所有项目
      userProjects = await Project.findAll({
        attributes: ['id', 'name', 'key'],
        order: [['name', 'ASC']]
      });
    } else {
      // 普通用户只能看到自己参与的项目
      userProjects = await Project.findAll({
        attributes: ['id', 'name', 'key'],
        include: [{
          model: User,
          as: 'members',
          where: { id: req.session.userId },
          attributes: [],
          through: {
            where: { status: 'active' },
            attributes: []
          }
        }],
        order: [['name', 'ASC']]
      });
    }

    res.locals.userProjects = userProjects;

    // 处理当前选中的项目
    let selectedProject = null;
    if (req.session.selectedProjectId) {
      selectedProject = userProjects.find(p => p.id === req.session.selectedProjectId);

      // 如果选中的项目不在用户可访问列表中，清除选择
      if (!selectedProject) {
        req.session.selectedProjectId = null;
      }
    }

    res.locals.selectedProject = selectedProject;

    next();
  } catch (error) {
    logger.error('获取用户项目列表失败:', error);
    res.locals.userProjects = [];
    res.locals.selectedProject = null;
    next();
  }
};

/**
 * 检查用户是否有项目访问权限
 */
const requireProjectAccess = async (req, res, next) => {
  try {
    if (!req.session?.userId) {
      return res.redirect('/login');
    }

    const projectId = req.params.projectId || req.session.selectedProjectId;
    if (!projectId) {
      req.flash('error', '请先选择项目');
      return res.redirect('/dashboard');
    }

    const { Project, User } = require('../models');
    const { Op } = require('sequelize');

    let hasAccess = false;

    if (req.session.user?.role === 'admin') {
      // 管理员可以访问所有项目
      const project = await Project.findByPk(projectId);
      hasAccess = !!project;
    } else {
      // 普通用户只能访问自己参与的项目
      const project = await Project.findOne({
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
      hasAccess = !!project;
    }

    if (!hasAccess) {
      req.flash('error', '您没有权限访问此项目');
      return res.redirect('/dashboard');
    }

    next();
  } catch (error) {
    logger.error('检查项目访问权限失败:', error);
    req.flash('error', '检查权限失败');
    res.redirect('/dashboard');
  }
};

/**
 * 要求用户必须选择项目
 */
const requireProjectSelection = (req, res, next) => {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }

  if (!req.session.selectedProjectId && req.session.user?.role !== 'admin') {
    req.flash('error', '请先选择项目');
    return res.redirect('/dashboard');
  }

  next();
};

module.exports = {
  loadUserProjects,
  requireProjectAccess,
  requireProjectSelection
};
