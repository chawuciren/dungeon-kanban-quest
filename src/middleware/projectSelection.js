const logger = require('../config/logger');

/**
 * 项目选择中间件
 * 确保非管理员用户在访问项目相关功能前已选择项目
 */
const requireProjectSelection = (req, res, next) => {
  // 如果用户未登录，跳过检查（由其他认证中间件处理）
  if (!req.session?.userId) {
    return next();
  }

  // 管理员可以跳过项目选择要求
  if (req.session.user?.role === 'admin') {
    return next();
  }

  // 检查是否已选择项目
  if (!req.session.selectedProjectId) {
    // 如果是AJAX请求，返回JSON错误
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.status(400).json({
        success: false,
        message: '请先选择项目',
        requireProjectSelection: true
      });
    }

    // 普通请求重定向到项目选择页面
    req.flash('warning', '请先选择项目');
    return res.redirect('/select-project');
  }

  next();
};

/**
 * 检查用户是否有权限访问当前选中的项目
 */
const validateProjectAccess = async (req, res, next) => {
  try {
    // 如果用户未登录或未选择项目，跳过检查
    if (!req.session?.userId || !req.session.selectedProjectId) {
      return next();
    }

    const { Project, User } = require('../models');

    // 管理员可以访问所有项目
    if (req.session.user?.role === 'admin') {
      return next();
    }

    // 检查普通用户是否有权限访问选中的项目
    const project = await Project.findByPk(req.session.selectedProjectId);

    if (!project) {
      // 项目不存在，清除选择
      req.session.selectedProjectId = null;
      req.flash('error', '选中的项目不存在，请重新选择');
      return res.redirect('/dashboard');
    }

    // 检查用户权限：owner、leader 或 active member
    const hasAccess = project.ownerId === req.session.userId ||
                     project.leaderId === req.session.userId;

    if (!hasAccess) {
      // 检查是否是项目成员
      const { ProjectMember } = require('../models');
      const membership = await ProjectMember.findOne({
        where: {
          projectId: req.session.selectedProjectId,
          userId: req.session.userId,
          status: 'active'
        }
      });

      if (!membership) {
        // 用户无权限访问当前选中的项目，清除选择
        req.session.selectedProjectId = null;
        req.flash('error', '您已失去对当前项目的访问权限，请重新选择');

        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
          return res.status(403).json({
            success: false,
            message: '您已失去对当前项目的访问权限',
            requireProjectSelection: true
          });
        }

        return res.redirect('/dashboard');
      }
    }

    next();
  } catch (error) {
    logger.error('验证项目访问权限失败:', error);
    next(); // 出错时继续执行，避免阻塞正常流程
  }
};

/**
 * 获取当前选中项目的详细信息
 */
const getCurrentProject = async (req, res, next) => {
  try {
    if (!req.session?.selectedProjectId) {
      res.locals.currentProject = null;
      return next();
    }

    const { Project } = require('../models');

    const project = await Project.findByPk(req.session.selectedProjectId, {
      attributes: ['id', 'name', 'key', 'description', 'projectType', 'starLevel', 'status']
    });

    res.locals.currentProject = project;
    next();
  } catch (error) {
    logger.error('获取当前项目信息失败:', error);
    res.locals.currentProject = null;
    next();
  }
};

module.exports = {
  requireProjectSelection,
  validateProjectAccess,
  getCurrentProject
};
