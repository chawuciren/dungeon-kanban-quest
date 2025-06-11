const express = require('express');
const router = express.Router();
const { BountyTask, Project, User, Sprint, sequelize } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const { requireProjectSelection, validateProjectAccess } = require('../middleware/projectSelection');
const { getUserSettings, applyUserSettingsToQuery, getPaginationParams, getGanttParams } = require('../utils/userSettings');
const { handleTaskImageUpload } = require('../middleware/upload');

// 认证中间件
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    req.flash('error', '请先登录');
    return res.redirect('/login');
  }
  next();
};

// 获取子任务的辅助方法
async function getSubtasks(parentId, maxLevel = 3) {
  if (maxLevel <= 0) return [];

  const subtasks = await BountyTask.findAll({
    where: { parentTaskId: parentId },
    include: [
      {
        model: User,
        as: 'publisher',
        attributes: ['id', 'username', 'firstName', 'lastName']
      },
      {
        model: User,
        as: 'assignee',
        attributes: ['id', 'username', 'firstName', 'lastName']
      }
    ],
    order: [['createdAt', 'ASC']]
  });

  // 递归加载子任务（限制层级）
  for (let subtask of subtasks) {
    if (maxLevel > 1) {
      subtask.dataValues.subtasks = await getSubtasks(subtask.id, maxLevel - 1);
    } else {
      // 检查是否还有更深层的子任务
      const hasDeepChildren = await BountyTask.count({
        where: { parentTaskId: subtask.id }
      });
      subtask.dataValues.hasDeepChildren = hasDeepChildren > 0;
    }
    subtask.dataValues.hasChildren = subtask.dataValues.subtasks?.length > 0 || subtask.dataValues.hasDeepChildren;
  }

  return subtasks;
}

// 构建通用筛选条件的函数
function buildTaskFilters(query, projectId, userId) {
  const where = {
    projectId: projectId // 只显示当前选中项目的任务
  };

  // 归档状态筛选 - 默认只显示未归档的任务
  if (query.archived === 'true') {
    where.isArchived = true;
  } else if (query.archived === 'false' || !query.archived) {
    where.isArchived = false;
  }
  // 如果 query.archived === 'all'，则不添加归档筛选条件

  // 基础筛选条件
  if (query.starLevel) {
    where.starLevel = query.starLevel;
  }
  if (query.urgencyLevel) {
    where.urgencyLevel = query.urgencyLevel;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.taskType) {
    where.taskType = query.taskType;
  }

  // 我的任务筛选
  if (query.myTasks && userId) {
    switch (query.myTasks) {
      case 'assigned':
        where.assigneeId = userId;
        break;
      case 'created':
        where.publisherId = userId;
        break;
      case 'participated':
        // 参与的任务：负责人、创建人或协助人员
        // 使用SQLite兼容的JSON查询方式
        where[Op.or] = [
          { assigneeId: userId },
          { publisherId: userId },
          sequelize.literal(`json_extract(assistant_ids, '$') LIKE '%"${userId}"%'`)
        ];
        break;
      case 'reviewed':
        // 我审核的任务
        where.reviewerId = userId;
        break;
    }
  }

  // 负责人筛选
  if (query.assigneeId) {
    where.assigneeId = query.assigneeId;
  }

  // 迭代筛选
  if (query.sprintId) {
    if (query.sprintId === 'none') {
      where.sprintId = null; // 未分配迭代的任务
    } else {
      where.sprintId = query.sprintId;
    }
  }

  // 搜索关键词
  if (query.search) {
    // 如果已经有 Op.or 条件（比如 participated），需要合并
    if (where[Op.or]) {
      // 将现有的 Op.or 条件和搜索条件合并
      where[Op.and] = [
        { [Op.or]: where[Op.or] },
        {
          [Op.or]: [
            { title: { [Op.like]: `%${query.search}%` } },
            { description: { [Op.like]: `%${query.search}%` } }
          ]
        }
      ];
      delete where[Op.or];
    } else {
      where[Op.or] = [
        { title: { [Op.like]: `%${query.search}%` } },
        { description: { [Op.like]: `%${query.search}%` } }
      ];
    }
  }

  return where;
}

// 构建排序条件的函数
function buildTaskOrder(sortType, useSimpleOrder = false) {
  let order = [['createdAt', 'DESC']];
  if (sortType === 'deadline') {
    order = [['dueDate', 'ASC']];
  } else if (sortType === 'priority') {
    if (useSimpleOrder) {
      // 简单排序，用于复杂查询
      order = [
        ['urgencyLevel', 'ASC'],
        ['starLevel', 'DESC']
      ];
    } else {
      // 使用 CASE WHEN 来正确排序 urgencyLevel 枚举值
      order = [
        [
          sequelize.literal(`
            CASE urgency_level
              WHEN 'urgent' THEN 1
              WHEN 'important' THEN 2
              WHEN 'normal' THEN 3
              WHEN 'delayed' THEN 4
              WHEN 'frozen' THEN 5
              ELSE 6
            END
          `),
          'ASC'
        ],
        ['starLevel', 'DESC']
      ];
    }
  } else if (sortType === 'created') {
    order = [['createdAt', 'DESC']];
  }
  return order;
}

// 任务首页 - 根据用户设置重定向到对应视图
router.get('/', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    // 获取用户设置
    const userSettings = await getUserSettings(req.session.userId);

    // 根据用户默认视图设置重定向
    const defaultView = userSettings.defaultTaskView || 'list';

    // 构建重定向URL，保留查询参数
    const queryString = new URLSearchParams(req.query).toString();
    const redirectUrl = `/tasks/${defaultView}${queryString ? '?' + queryString : ''}`;

    res.redirect(redirectUrl);

  } catch (error) {
    logger.error('获取用户设置失败:', error);
    // 如果获取设置失败，默认重定向到列表视图
    const queryString = new URLSearchParams(req.query).toString();
    const redirectUrl = `/tasks/list${queryString ? '?' + queryString : ''}`;
    res.redirect(redirectUrl);
  }
});

// 任务市场（列表视图）
router.get('/list', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    // 获取用户设置
    const userSettings = await getUserSettings(req.session.userId);

    // 应用用户设置到查询参数
    const appliedQuery = applyUserSettingsToQuery(req.query, userSettings);

    // 获取分页参数
    const { page, limit, offset } = getPaginationParams(req.query, userSettings);

    // 构建查询条件
    const where = buildTaskFilters(appliedQuery, req.session.selectedProjectId, req.session.userId);

    // 先单独统计总数，避免include影响count结果
    const count = await BountyTask.count({ where });

    // 对于优先级排序，我们需要特殊处理
    let tasks;
    if (appliedQuery.sort === 'priority') {
      // 先获取所有数据，然后在 JavaScript 中排序
      tasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key'],
            include: [
              {
                model: User,
                as: 'members',
                attributes: ['id', 'firstName', 'lastName', 'username'],
                through: {
                  attributes: ['roles', 'status'],
                  as: 'membership'
                }
              }
            ]
          },
          {
            model: Sprint,
            as: 'sprint',
            attributes: ['id', 'name', 'status'],
            required: false
          }
        ]
      });

      // 在 JavaScript 中进行优先级排序
      const urgencyOrder = { 'urgent': 1, 'important': 2, 'normal': 3, 'delayed': 4, 'frozen': 5 };
      tasks.sort((a, b) => {
        const urgencyA = urgencyOrder[a.urgencyLevel] || 6;
        const urgencyB = urgencyOrder[b.urgencyLevel] || 6;

        if (urgencyA !== urgencyB) {
          return urgencyA - urgencyB;
        }

        // 如果紧急程度相同，按星级降序排序
        return b.starLevel - a.starLevel;
      });

      // 应用分页
      tasks = tasks.slice(offset, offset + limit);
    } else {
      // 其他排序方式使用数据库排序
      const order = buildTaskOrder(appliedQuery.sort);
      tasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key'],
            include: [
              {
                model: User,
                as: 'members',
                attributes: ['id', 'firstName', 'lastName', 'username'],
                through: {
                  attributes: ['roles', 'status'],
                  as: 'membership'
                }
              }
            ]
          },
          {
            model: Sprint,
            as: 'sprint',
            attributes: ['id', 'name', 'status'],
            required: false
          }
        ],
        order,
        limit,
        offset
      });
    }

    // 获取项目成员列表用于筛选器
    const { ProjectMember } = require('../models');
    const projectMembers = await ProjectMember.findAll({
      where: {
        projectId: req.session.selectedProjectId,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ]
    });

    // 转换为简单的用户列表
    const membersList = projectMembers.map(pm => pm.user);

    // 获取项目的迭代列表用于筛选器
    const sprints = await Sprint.findAll({
      where: {
        projectId: req.session.selectedProjectId
      },
      attributes: ['id', 'name', 'status', 'startDate', 'endDate'],
      order: [['startDate', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    res.render('tasks/index', {
      title: '任务市场',
      tasks,
      projectMembers: membersList,
      sprints,
      userSettings,
      pagination: {
        page,
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: appliedQuery
    });

  } catch (error) {
    logger.error('获取任务列表失败:', error);
    req.flash('error', '获取任务列表失败');
    res.redirect('/dashboard');
  }
});

// 树形视图
router.get('/tree', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const projectId = req.session.selectedProjectId;

    // 获取用户设置
    const userSettings = await getUserSettings(req.session.userId);

    // 应用用户设置到查询参数
    const appliedQuery = applyUserSettingsToQuery(req.query, userSettings);

    // 获取分页参数（树形视图使用更大的默认值）
    const { page, limit: userLimit } = getPaginationParams(req.query, userSettings);
    const limit = Math.max(userLimit, 50); // 树形视图至少显示50个

    // 构建查询条件（包含筛选）
    const baseWhere = buildTaskFilters(appliedQuery, projectId, req.session.userId);

    // 只获取根任务（level 0）进行分页
    const where = {
      ...baseWhere,
      parentTaskId: null // 根任务
    };

    // 先单独统计根任务总数，避免include影响count结果
    const count = await BountyTask.count({ where });

    // 对于优先级排序，我们需要特殊处理
    let rootTasks;
    if (appliedQuery.sort === 'priority') {
      // 先获取所有根任务数据，然后在 JavaScript 中排序
      rootTasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key'],
            include: [
              {
                model: User,
                as: 'members',
                attributes: ['id', 'firstName', 'lastName', 'username'],
                through: {
                  attributes: ['roles', 'status'],
                  as: 'membership'
                }
              }
            ]
          },
          {
            model: Sprint,
            as: 'sprint',
            attributes: ['id', 'name', 'status'],
            required: false
          }
        ]
      });

      // 在 JavaScript 中进行优先级排序
      const urgencyOrder = { 'urgent': 1, 'important': 2, 'normal': 3, 'delayed': 4, 'frozen': 5 };
      rootTasks.sort((a, b) => {
        const urgencyA = urgencyOrder[a.urgencyLevel] || 6;
        const urgencyB = urgencyOrder[b.urgencyLevel] || 6;

        if (urgencyA !== urgencyB) {
          return urgencyA - urgencyB;
        }

        // 如果紧急程度相同，按星级降序排序
        return b.starLevel - a.starLevel;
      });

      // 应用分页
      rootTasks = rootTasks.slice((page - 1) * limit, page * limit);
    } else {
      // 其他排序方式使用数据库排序
      const order = buildTaskOrder(appliedQuery.sort);
      rootTasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key'],
            include: [
              {
                model: User,
                as: 'members',
                attributes: ['id', 'firstName', 'lastName', 'username'],
                through: {
                  attributes: ['roles', 'status'],
                  as: 'membership'
                }
              }
            ]
          },
          {
            model: Sprint,
            as: 'sprint',
            attributes: ['id', 'name', 'status'],
            required: false
          }
        ],
        order,
        limit,
        offset: (page - 1) * limit
      });
    }

    // 检查每个根任务是否有子任务（不预加载子任务）
    for (let task of rootTasks) {
      const hasChildren = await BountyTask.count({
        where: { parentTaskId: task.id }
      });
      task.dataValues.hasChildren = hasChildren > 0;
      task.hasChildren = hasChildren > 0; // 同时设置在实例上
    }

    // 获取项目成员列表用于筛选器
    const { ProjectMember } = require('../models');
    const projectMembers = await ProjectMember.findAll({
      where: {
        projectId: projectId,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ]
    });

    // 转换为简单的用户列表
    const membersList = projectMembers.map(pm => pm.user);

    // 获取项目的迭代列表用于筛选器
    const sprints = await Sprint.findAll({
      where: {
        projectId: projectId
      },
      attributes: ['id', 'name', 'status', 'startDate', 'endDate'],
      order: [['startDate', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    res.render('tasks/tree', {
      title: '任务树形视图',
      rootTasks,
      projectId,
      projectMembers: membersList,
      sprints,
      userSettings,
      pagination: {
        page,
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: appliedQuery
    });

  } catch (error) {
    logger.error('获取任务树失败:', error);
    req.flash('error', '获取任务树失败');
    res.redirect('/tasks');
  }
});

// 看板视图
router.get('/kanban', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const projectId = req.session.selectedProjectId;

    // 获取用户设置
    const userSettings = await getUserSettings(req.session.userId);

    // 应用用户设置到查询参数
    const appliedQuery = applyUserSettingsToQuery(req.query, userSettings);

    // 构建查询条件（包含筛选）
    const where = buildTaskFilters(appliedQuery, projectId, req.session.userId);

    // 获取所有任务并按状态分组
    let tasks;
    if (appliedQuery.sort === 'priority') {
      // 对于优先级排序，先获取数据然后在 JavaScript 中排序
      tasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key']
          }
        ]
      });

      // 在 JavaScript 中进行优先级排序
      const urgencyOrder = { 'urgent': 1, 'important': 2, 'normal': 3, 'delayed': 4, 'frozen': 5 };
      tasks.sort((a, b) => {
        const urgencyA = urgencyOrder[a.urgencyLevel] || 6;
        const urgencyB = urgencyOrder[b.urgencyLevel] || 6;

        if (urgencyA !== urgencyB) {
          return urgencyA - urgencyB;
        }

        // 如果紧急程度相同，按星级降序排序
        return b.starLevel - a.starLevel;
      });
    } else {
      // 其他排序方式使用数据库排序
      const order = buildTaskOrder(appliedQuery.sort);
      tasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key']
          }
        ],
        order
      });
    }

    // 按状态分组任务
    const kanbanColumns = {
      draft: { title: '草稿', tasks: [], color: 'secondary' },
      published: { title: '已发布', tasks: [], color: 'primary' },
      in_progress: { title: '进行中', tasks: [], color: 'warning' },
      review: { title: '待审核', tasks: [], color: 'info' },
      completed: { title: '已完成', tasks: [], color: 'success' },
      cancelled: { title: '已取消', tasks: [], color: 'danger' }
    };

    tasks.forEach(task => {
      if (kanbanColumns[task.status]) {
        kanbanColumns[task.status].tasks.push(task);
      }
    });

    // 获取项目成员列表用于筛选器
    const { ProjectMember } = require('../models');
    const projectMembers = await ProjectMember.findAll({
      where: {
        projectId: projectId,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ]
    });

    // 转换为简单的用户列表
    const membersList = projectMembers.map(pm => pm.user);

    res.render('tasks/kanban', {
      title: '任务看板',
      kanbanColumns,
      projectId,
      projectMembers: membersList,
      userSettings,
      filters: appliedQuery
    });

  } catch (error) {
    logger.error('获取看板数据失败:', error);
    req.flash('error', '获取看板数据失败');
    res.redirect('/tasks');
  }
});

// 甘特视图
router.get('/gantt', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const projectId = req.session.selectedProjectId;

    // 获取用户设置
    const userSettings = await getUserSettings(req.session.userId);

    // 应用用户设置到查询参数
    const appliedQuery = applyUserSettingsToQuery(req.query, userSettings);

    // 获取甘特图参数
    const ganttParams = getGanttParams(req.query, userSettings);

    // 构建查询条件（包含筛选）
    const where = buildTaskFilters(appliedQuery, projectId, req.session.userId);

    // 获取所有任务
    let tasks;
    if (appliedQuery.sort === 'priority') {
      // 对于优先级排序，先获取数据然后在 JavaScript 中排序
      tasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key'],
            include: [
              {
                model: User,
                as: 'members',
                attributes: ['id', 'firstName', 'lastName', 'username'],
                through: {
                  attributes: ['roles', 'status'],
                  as: 'membership'
                }
              }
            ]
          },
          {
            model: Sprint,
            as: 'sprint',
            attributes: ['id', 'name', 'status'],
            required: false
          }
        ]
      });

      // 在 JavaScript 中进行优先级排序
      const urgencyOrder = { 'urgent': 1, 'important': 2, 'normal': 3, 'delayed': 4, 'frozen': 5 };
      tasks.sort((a, b) => {
        const urgencyA = urgencyOrder[a.urgencyLevel] || 6;
        const urgencyB = urgencyOrder[b.urgencyLevel] || 6;

        if (urgencyA !== urgencyB) {
          return urgencyA - urgencyB;
        }

        // 如果紧急程度相同，按星级降序排序
        return b.starLevel - a.starLevel;
      });
    } else {
      // 其他排序方式使用数据库排序（甘特图默认按创建时间排序）
      const order = appliedQuery.sort ? buildTaskOrder(appliedQuery.sort) : [['createdAt', 'ASC']];
      tasks = await BountyTask.findAll({
        where,
        include: [
          {
            model: User,
            as: 'publisher',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'key'],
            include: [
              {
                model: User,
                as: 'members',
                attributes: ['id', 'firstName', 'lastName', 'username'],
                through: {
                  attributes: ['roles', 'status'],
                  as: 'membership'
                }
              }
            ]
          },
          {
            model: Sprint,
            as: 'sprint',
            attributes: ['id', 'name', 'status'],
            required: false
          }
        ],
        order
      });
    }

    // 格式化任务数据为甘特图格式
    const ganttTasks = tasks.map((task, index) => {
      // 计算开始和结束时间
      let startDate = task.startDate || task.createdAt;
      let endDate = task.dueDate;

      // 调试信息（可选）
      // console.log(`任务 ${task.title} 原始日期:`, {
      //   originalStartDate: task.startDate,
      //   originalDueDate: task.dueDate,
      //   createdAt: task.createdAt
      // });

      // 确保startDate是Date对象，处理时区问题
      if (typeof startDate === 'string') {
        // 如果是YYYY-MM-DD格式，添加时间部分避免时区问题
        if (startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          startDate = new Date(startDate + 'T00:00:00');
        } else {
          startDate = new Date(startDate);
        }
      }

      // 如果没有截止时间，默认设置为开始时间后的估算工时天数
      if (!endDate && task.estimatedHours) {
        const estimatedDays = Math.ceil(task.estimatedHours / 8); // 假设每天8小时
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + estimatedDays);
      } else if (!endDate) {
        // 如果都没有，默认设置为7天后
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
      } else if (typeof endDate === 'string') {
        // 如果是YYYY-MM-DD格式，添加时间部分避免时区问题
        if (endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          endDate = new Date(endDate + 'T23:59:59');
        } else {
          endDate = new Date(endDate);
        }
      }

      // 确保结束时间不早于开始时间
      if (endDate <= startDate) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }

      const formattedStart = startDate.toISOString().split('T')[0];
      const formattedEnd = endDate.toISOString().split('T')[0];

      // 调试信息（可选）
      // console.log(`任务 ${task.title} 格式化后日期:`, {
      //   formattedStart,
      //   formattedEnd,
      //   startDateObj: startDate,
      //   endDateObj: endDate
      // });

      return {
        id: task.id,
        name: task.title || `任务 ${index + 1}`,
        start: formattedStart,
        end: formattedEnd,
        progress: task.status === 'completed' ? 100 :
                 task.status === 'review' ? 80 :
                 task.status === 'assigned' || task.status === 'in_progress' ? 50 : 0,
        custom_class: `task-${task.status}`,
        task: task // 保存完整任务信息用于显示
      };
    });

    // 获取项目成员列表用于筛选器
    const { ProjectMember } = require('../models');
    const projectMembers = await ProjectMember.findAll({
      where: {
        projectId: projectId,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ]
    });

    // 转换为简单的用户列表
    const membersList = projectMembers.map(pm => pm.user);

    // 获取项目的迭代列表用于筛选器
    const sprints = await Sprint.findAll({
      where: {
        projectId: projectId
      },
      attributes: ['id', 'name', 'status', 'startDate', 'endDate'],
      order: [['startDate', 'DESC']]
    });

    res.render('tasks/gantt', {
      title: '任务甘特图',
      ganttTasks,
      projectId,
      projectMembers: membersList,
      sprints,
      userSettings,
      ganttParams,
      filters: appliedQuery
    });

  } catch (error) {
    logger.error('获取甘特图数据失败:', error);
    req.flash('error', '获取甘特图数据失败');
    res.redirect('/tasks');
  }
});

// 创建任务页面
router.get('/create', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const parentId = req.query.parent;
    let parentTask = null;

    // 获取用户设置
    const userSettings = await getUserSettings(req.session.userId);

    if (parentId) {
      parentTask = await BountyTask.findByPk(parentId, {
        attributes: ['id', 'title', 'projectId']
      });
    }

    // 获取用户的项目列表（如果有选中的项目，优先使用）
    let projects = [];
    if (req.session.selectedProjectId) {
      const selectedProject = await Project.findByPk(req.session.selectedProjectId, {
        attributes: ['id', 'name', 'key']
      });
      if (selectedProject) {
        projects = [selectedProject];
      }
    } else {
      // 管理员可以看到所有项目
      projects = await Project.findAll({
        where: {
          [Op.or]: [
            { ownerId: req.session.userId },
            { leaderId: req.session.userId }
          ]
        },
        attributes: ['id', 'name', 'key']
      });
    }

    // 获取当前项目的成员列表
    let projectMembers = [];
    if (req.session.selectedProjectId) {
      const { ProjectMember } = require('../models');
      projectMembers = await ProjectMember.findAll({
        where: {
          projectId: req.session.selectedProjectId,
          status: 'active'
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'firstName', 'lastName', 'role']
          }
        ]
      });
    }

    // 获取当前项目的任务列表（用于父任务选择）
    let projectTasks = [];
    if (req.session.selectedProjectId && !parentTask) {
      projectTasks = await BountyTask.findAll({
        where: {
          projectId: req.session.selectedProjectId,
          parentTaskId: null // 只显示根任务作为父任务选项
        },
        attributes: ['id', 'title', 'taskType'],
        order: [['createdAt', 'DESC']],
        limit: 50
      });
    }

    // 获取当前项目的迭代列表
    let sprints = [];
    if (req.session.selectedProjectId) {
      sprints = await Sprint.findAll({
        where: {
          projectId: req.session.selectedProjectId,
          status: ['planning', 'active'] // 只显示计划中和进行中的迭代
        },
        attributes: ['id', 'name', 'status', 'startDate', 'endDate'],
        order: [['startDate', 'DESC']]
      });
    }

    // 获取保存的表单数据（如果有）
    const formData = req.session.formData;
    delete req.session.formData; // 使用后删除

    // 使用edit模板，但传入创建模式的参数
    res.render('tasks/edit', {
      title: parentTask ? '创建子任务' : '创建任务',
      task: null, // 创建模式时task为null
      parentTask,
      projects,
      projectMembers,
      projectTasks,
      sprints,
      userSettings,
      defaultProjectId: req.session.selectedProjectId,
      user: req.session.user, // 传递用户信息用于权限检查
      formData // 传递表单数据用于恢复
    });

  } catch (error) {
    logger.error('获取创建任务页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/tasks');
  }
});

// 任务详情
router.get('/:id', async (req, res) => {
  try {
    const taskId = req.params.id;

    const task = await BountyTask.findByPk(taskId, {
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key', 'description']
        },
        {
          model: BountyTask,
          as: 'parentTask',
          attributes: ['id', 'title', 'status']
        }
      ]
    });

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 获取子任务
    const subtasks = await getSubtasks(task.id, 2);

    // 获取同级任务（如果有父任务）
    let siblingTasks = [];
    if (task.parentTaskId) {
      siblingTasks = await BountyTask.findAll({
        where: {
          parentTaskId: task.parentTaskId,
          id: { [Op.ne]: task.id } // 排除当前任务
        },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'username', 'firstName', 'lastName']
          }
        ],
        attributes: ['id', 'title', 'status', 'starLevel'],
        order: [['createdAt', 'ASC']],
        limit: 10 // 限制显示数量
      });
    }

    // 获取协助人员信息
    let assistants = [];
    if (task.assistantIds && task.assistantIds.length > 0) {
      assistants = await User.findAll({
        where: {
          id: task.assistantIds
        },
        attributes: ['id', 'username', 'firstName', 'lastName']
      });
    }

    // 检查当前用户是否可以接单
    const canBid = task.status === 'published' &&
                  (!req.session.userId || task.publisherId !== req.session.userId) &&
                  !task.assigneeId;

    res.render('tasks/detail', {
      title: task.title,
      task,
      subtasks,
      siblingTasks,
      assistants,
      canBid
    });

  } catch (error) {
    logger.error('获取任务详情失败:', error);
    req.flash('error', '获取任务详情失败');
    res.redirect('/tasks');
  }
});

// 获取子任务（AJAX接口）
router.get('/:id/subtasks', async (req, res) => {
  try {
    const parentId = req.params.id;

    // 直接获取子任务，不递归加载
    const subtasks = await BountyTask.findAll({
      where: { parentTaskId: parentId },
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key'],
          include: [
            {
              model: User,
              as: 'members',
              attributes: ['id', 'firstName', 'lastName', 'username'],
              through: {
                attributes: ['roles', 'status'],
                as: 'membership'
              }
            }
          ]
        },
        {
          model: Sprint,
          as: 'sprint',
          attributes: ['id', 'name', 'status'],
          required: false
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    // 检查每个子任务是否还有子任务
    for (let subtask of subtasks) {
      const hasChildren = await BountyTask.count({
        where: { parentTaskId: subtask.id }
      });
      subtask.dataValues.hasChildren = hasChildren > 0;
      subtask.hasChildren = hasChildren > 0; // 同时设置在实例上
    }

    // 获取项目的迭代列表
    let sprints = [];
    if (subtasks.length > 0) {
      const projectId = subtasks[0].projectId;
      sprints = await Sprint.findAll({
        where: {
          projectId: projectId
        },
        attributes: ['id', 'name', 'status', 'startDate', 'endDate'],
        order: [['startDate', 'DESC']]
      });
    }

    res.json({
      success: true,
      data: subtasks,
      sprints: sprints
    });

  } catch (error) {
    logger.error('获取子任务失败:', error);
    res.status(500).json({
      success: false,
      message: '获取子任务失败'
    });
  }
});

// 创建任务处理
router.post('/create', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const {
      title,
      description,
      taskType,
      starLevel,
      urgencyLevel,
      parentTaskId,
      estimatedHours,
      startDate,
      dueDate,
      sprintId,
      assigneeId,
      assistantIds,
      reviewerId
    } = req.body;

    // 使用当前选中的项目ID
    const projectId = req.session.selectedProjectId;

    // 验证必填字段
    if (!title || !description || !projectId || !taskType || !starLevel || !urgencyLevel ||
        !estimatedHours || !startDate || !dueDate || !assigneeId || !reviewerId) {
      req.flash('error', '请填写所有必填字段');
      return res.redirect('back');
    }

    // 检查用户是否有权限创建指定类型的任务
    const { canCreateTaskType } = require('../config/taskTypes');
    const userRole = req.session.user?.role;

    if (!canCreateTaskType(userRole, taskType)) {
      req.flash('error', `您没有权限创建${taskType}类型的任务`);
      return res.redirect('back');
    }

    // 计算任务层级
    let level = 0;
    if (parentTaskId) {
      const parentTask = await BountyTask.findByPk(parentTaskId);
      if (!parentTask) {
        req.flash('error', '父任务不存在');
        return res.redirect('back');
      }
      level = (parentTask.level || 0) + 1;

      // 检查层级限制
      if (level > 3) {
        req.flash('error', '任务层级不能超过4级');
        return res.redirect('back');
      }
    }



    // 处理协助人员ID数组
    let processedAssistantIds = [];
    if (assistantIds) {
      if (Array.isArray(assistantIds)) {
        processedAssistantIds = assistantIds.filter(id => id && id.trim() !== '');
      } else if (typeof assistantIds === 'string' && assistantIds.trim() !== '') {
        processedAssistantIds = [assistantIds.trim()];
      }
    }

    // 创建任务
    const task = await BountyTask.create({
      title,
      description,
      taskType: taskType || 'task',
      starLevel: parseInt(starLevel),
      urgencyLevel,
      status: 'draft',
      projectId,
      publisherId: req.session.userId,
      assigneeId: assigneeId && assigneeId.trim() !== '' ? assigneeId : null,
      assistantIds: processedAssistantIds,
      reviewerId: reviewerId && reviewerId.trim() !== '' ? reviewerId : null,
      parentTaskId: parentTaskId || null,
      sprintId: sprintId && sprintId.trim() !== '' ? sprintId : null,

      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      progress: 0, // 新创建的任务进度默认为0
      level
    });

    // 记录活动
    const ActivityLogger = require('../utils/activityLogger');
    await ActivityLogger.logTaskCreated(req.session.userId, task, projectId, req);

    logger.info(`任务创建成功: ${title}`, {
      taskId: task.id,
      userId: req.session.userId
    });

    req.flash('success', '任务创建成功！');
    res.redirect(`/tasks/${task.id}`);

  } catch (error) {
    logger.error('创建任务失败:', error);

    // 处理验证错误
    if (error.name === 'SequelizeValidationError') {
      // 从req.body中重新获取数据，确保变量在作用域内
      const {
        title: formTitle,
        description: formDescription,
        taskType: formTaskType,
        starLevel: formStarLevel,
        urgencyLevel: formUrgencyLevel,
        parentTaskId: formParentTaskId,
        estimatedHours: formEstimatedHours,
        startDate: formStartDate,
        dueDate: formDueDate,
        sprintId: formSprintId,
        assigneeId: formAssigneeId,
        assistantIds: formAssistantIds,
        reviewerId: formReviewerId
      } = req.body;

      // 保存表单数据到session
      req.session.formData = {
        title: formTitle,
        description: formDescription,
        taskType: formTaskType,
        starLevel: formStarLevel,
        urgencyLevel: formUrgencyLevel,
        parentTaskId: formParentTaskId,
        estimatedHours: formEstimatedHours,
        startDate: formStartDate,
        dueDate: formDueDate,
        sprintId: formSprintId,
        assigneeId: formAssigneeId,
        assistantIds: formAssistantIds,
        reviewerId: formReviewerId
      };

      // 处理验证错误信息
      const errors = error.errors ? error.errors.map(err => {
        const fieldMap = {
          'title': '任务标题',
          'description': '任务描述',
          'taskType': '任务类型',
          'starLevel': '星级难度',
          'urgencyLevel': '紧急程度',
          'estimatedHours': '预估工时',
          'startDate': '开始日期',
          'dueDate': '截止日期',
          'assigneeId': '负责人',
          'reviewerId': '审核人'
        };

        const fieldLabel = fieldMap[err.path] || err.path;
        let message;

        switch (err.validatorKey || err.type) {
          case 'len':
            message = `${fieldLabel}长度必须在${err.validatorArgs[0]}-${err.validatorArgs[1]}个字符之间`;
            break;
          case 'min':
          case 'max':
            message = `${fieldLabel}数值超出允许范围`;
            break;
          case 'notNull':
          case 'notEmpty':
            message = `${fieldLabel}不能为空`;
            break;
          default:
            message = `${fieldLabel}: ${err.message}`;
        }

        return { field: err.path, message };
      }) : [{ field: 'general', message: '创建任务时发生错误，请检查输入信息' }];

      return res.render('error', {
        title: '任务创建失败',
        errorContext: '任务',
        errors,
        formData: req.session.formData,
        redirectUrl: '/tasks/create' + (req.query.parent ? `?parent=${req.query.parent}` : ''),
        redirectDelay: 8,
        error: { status: 400, message: '请修正表单中的错误信息' }
      });
    }

    // 处理其他错误
    req.flash('error', '创建任务失败，请稍后重试');
    res.redirect('back');
  }
});

// 编辑任务页面
router.get('/:id/edit', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;

    const task = await BountyTask.findByPk(taskId, {
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        }
      ]
    });

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限：管理员、任务发布者、负责人或审核人可以编辑
    const hasPermission = req.session.user?.role === 'admin' ||
                         task.publisherId === req.session.userId ||
                         task.assigneeId === req.session.userId ||
                         task.reviewerId === req.session.userId;

    if (!hasPermission) {
      req.flash('error', '您没有权限编辑此任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 获取项目成员列表
    let projectMembers = [];
    if (task.projectId) {
      const { ProjectMember } = require('../models');
      projectMembers = await ProjectMember.findAll({
        where: {
          projectId: task.projectId,
          status: 'active'
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'firstName', 'lastName', 'role']
          }
        ]
      });
    }

    // 获取项目的迭代列表
    let sprints = [];
    if (task.projectId) {
      sprints = await Sprint.findAll({
        where: {
          projectId: task.projectId
        },
        attributes: ['id', 'name', 'status', 'startDate', 'endDate'],
        order: [['startDate', 'DESC']]
      });
    }

    // 获取当前项目的任务列表（用于父任务选择）
    let projectTasks = [];
    if (task.projectId) {
      projectTasks = await BountyTask.findAll({
        where: {
          projectId: task.projectId,
          parentTaskId: null, // 只显示根任务作为父任务选项
          id: { [Op.ne]: task.id } // 排除当前任务本身
        },
        attributes: ['id', 'title', 'taskType'],
        order: [['createdAt', 'DESC']],
        limit: 50
      });
    }

    // 获取保存的表单数据（如果有）
    const formData = req.session.formData;
    delete req.session.formData; // 使用后删除

    res.render('tasks/edit', {
      title: '编辑任务',
      task,
      projectMembers,
      projectTasks,
      sprints,
      user: req.session.user, // 传递用户信息用于权限检查
      formData // 传递表单数据用于恢复
    });

  } catch (error) {
    logger.error('获取编辑任务页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/tasks');
  }
});

// 更新任务处理
router.post('/:id/edit', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const {
      title,
      description,
      taskType,
      starLevel,
      urgencyLevel,
      status,
      parentTaskId,
      estimatedHours,
      actualHours,
      progress,
      startDate,
      dueDate,
      sprintId,
      assigneeId,
      assistantIds,
      reviewerId,
      isArchived
    } = req.body;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限：管理员、任务发布者、负责人或审核人可以编辑
    const hasPermission = req.session.user?.role === 'admin' ||
                         task.publisherId === req.session.userId ||
                         task.assigneeId === req.session.userId ||
                         task.reviewerId === req.session.userId;

    if (!hasPermission) {
      req.flash('error', '您没有权限编辑此任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 验证必填字段
    if (!title || !description || !taskType || !starLevel || !urgencyLevel ||
        !estimatedHours || !startDate || !dueDate || !assigneeId || !reviewerId) {
      req.flash('error', '请填写所有必填字段');
      return res.redirect('back');
    }

    // 检查用户是否有权限编辑为指定类型的任务（如果任务类型发生变化）
    if (taskType !== task.taskType) {
      const { canCreateTaskType } = require('../config/taskTypes');
      const userRole = req.session.user?.role;

      if (!canCreateTaskType(userRole, taskType)) {
        req.flash('error', `您没有权限将任务修改为${taskType}类型`);
        return res.redirect('back');
      }
    }

    // 处理协助人员ID数组
    let processedAssistantIds = [];
    if (assistantIds) {
      if (Array.isArray(assistantIds)) {
        processedAssistantIds = assistantIds.filter(id => id && id.trim() !== '');
      } else if (typeof assistantIds === 'string' && assistantIds.trim() !== '') {
        processedAssistantIds = [assistantIds.trim()];
      }
    }



    // 处理状态变更的特殊逻辑
    const oldStatus = task.status;
    const newStatus = status || task.status;

    // 状态变更时的自动字段更新
    let updateData = {
      title,
      description,
      taskType: taskType || 'task',
      starLevel: parseInt(starLevel),
      urgencyLevel,
      status: newStatus,
      parentTaskId: parentTaskId && parentTaskId.trim() !== '' ? parentTaskId : null,
      assigneeId: assigneeId && assigneeId.trim() !== '' ? assigneeId : null,
      assistantIds: processedAssistantIds,
      reviewerId: reviewerId && reviewerId.trim() !== '' ? reviewerId : null,
      sprintId: sprintId && sprintId.trim() !== '' ? sprintId : null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      actualHours: actualHours ? parseFloat(actualHours) : null,
      progress: progress !== undefined ? parseInt(progress) : task.progress,
      startDate: startDate || null,
      dueDate: dueDate || null,
      isArchived: isArchived === 'true' || isArchived === true
    };

    // 根据状态变更自动设置时间字段
    if (oldStatus !== newStatus) {
      if (newStatus === 'in_progress' && !task.startDate && !startDate) {
        updateData.startDate = new Date();
      } else if (newStatus === 'completed' && !task.completedAt) {
        updateData.completedAt = new Date();
      }
    }

    // 保存更新前的数据用于活动记录
    const oldData = {
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      starLevel: task.starLevel,
      urgencyLevel: task.urgencyLevel,
      status: task.status,
      parentTaskId: task.parentTaskId,
      assigneeId: task.assigneeId,
      reviewerId: task.reviewerId,
      sprintId: task.sprintId,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      progress: task.progress,
      startDate: task.startDate,
      dueDate: task.dueDate
    };

    // 更新任务
    await task.update(updateData);

    // 记录活动
    const ActivityLogger = require('../utils/activityLogger');

    // 如果状态发生变化，记录状态变更活动
    if (oldStatus !== newStatus) {
      await ActivityLogger.logTaskStatusChanged(req.session.userId, task, oldStatus, newStatus, req);
    }

    // 记录任务更新活动
    await ActivityLogger.logTaskUpdated(req.session.userId, task, oldData, updateData, req);

    logger.info(`任务更新成功: ${title}`, {
      taskId: task.id,
      userId: req.session.userId
    });

    req.flash('success', '任务更新成功！');
    res.redirect(`/tasks/${task.id}`);

  } catch (error) {
    logger.error('更新任务失败:', error);

    // 处理验证错误
    if (error.name === 'SequelizeValidationError') {
      // 保存表单数据到session
      req.session.formData = {
        title,
        description,
        taskType,
        starLevel,
        urgencyLevel,
        status,
        parentTaskId,
        estimatedHours,
        actualHours,
        progress,
        startDate,
        dueDate,
        sprintId,
        assigneeId,
        assistantIds,
        reviewerId
      };

      // 处理验证错误信息
      const errors = error.errors ? error.errors.map(err => {
        const fieldMap = {
          'title': '任务标题',
          'description': '任务描述',
          'taskType': '任务类型',
          'starLevel': '星级难度',
          'urgencyLevel': '紧急程度',
          'status': '任务状态',
          'estimatedHours': '预估工时',
          'startDate': '开始日期',
          'dueDate': '截止日期',
          'assigneeId': '负责人',
          'reviewerId': '审核人'
        };

        const fieldLabel = fieldMap[err.path] || err.path;
        let message;

        switch (err.validatorKey || err.type) {
          case 'len':
            message = `${fieldLabel}长度必须在${err.validatorArgs[0]}-${err.validatorArgs[1]}个字符之间`;
            break;
          case 'min':
          case 'max':
            message = `${fieldLabel}数值超出允许范围`;
            break;
          case 'notNull':
          case 'notEmpty':
            message = `${fieldLabel}不能为空`;
            break;
          default:
            message = `${fieldLabel}: ${err.message}`;
        }

        return { field: err.path, message };
      }) : [{ field: 'general', message: '更新任务时发生错误，请检查输入信息' }];

      return res.render('error', {
        title: '任务编辑失败',
        errorContext: '任务',
        errors,
        formData: req.session.formData,
        redirectUrl: `/tasks/${req.params.id}/edit`,
        redirectDelay: 8,
        error: { status: 400, message: '请修正表单中的错误信息' }
      });
    }

    // 处理其他错误
    req.flash('error', '更新任务失败，请稍后重试');
    res.redirect('back');
  }
});

// 删除任务处理
router.post('/:id/delete', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;

    const task = await BountyTask.findByPk(taskId, {
      include: [
        {
          model: BountyTask,
          as: 'subtasks'
        }
      ]
    });

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限：只有管理员或任务发布者可以删除
    if (req.session.user?.role !== 'admin' && task.publisherId !== req.session.userId) {
      req.flash('error', '您没有权限删除此任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查是否有子任务
    if (task.subtasks && task.subtasks.length > 0) {
      req.flash('error', '该任务包含子任务，请先删除所有子任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查任务状态
    if (task.status === 'assigned' || task.status === 'in_progress') {
      req.flash('error', '进行中的任务无法删除');
      return res.redirect(`/tasks/${taskId}`);
    }

    const taskTitle = task.title;

    // 删除任务
    await task.destroy();

    logger.info(`任务删除成功: ${taskTitle}`, {
      taskId: task.id,
      userId: req.session.userId
    });

    req.flash('success', `任务"${taskTitle}"删除成功！`);
    res.redirect('/tasks');

  } catch (error) {
    logger.error('删除任务失败:', error);
    req.flash('error', '删除任务失败：' + error.message);
    res.redirect('back');
  }
});

// 快速字段更新API
router.post('/:id/quick-update', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { field, value } = req.body;

    logger.info('快速更新请求:', { taskId, field, value, userId: req.session.userId });

    const task = await BountyTask.findByPk(taskId, {
      include: [
        {
          model: Project,
          as: 'project',
          include: [
            {
              model: User,
              as: 'members',
              attributes: ['id', 'firstName', 'lastName', 'username'],
              through: {
                attributes: ['roles', 'status'],
                as: 'membership'
              }
            }
          ]
        }
      ]
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    // 检查权限：管理员、任务发布者、负责人或审核人可以更改
    const hasPermission = req.session.user?.role === 'admin' ||
                         task.publisherId === req.session.userId ||
                         task.assigneeId === req.session.userId ||
                         task.reviewerId === req.session.userId;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '您没有权限更改此任务'
      });
    }

    // 验证字段和值
    const allowedFields = ['status', 'assigneeId', 'urgencyLevel', 'sprintId'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({
        success: false,
        message: '不支持的字段'
      });
    }

    // 如果是分配负责人，验证用户是否为项目成员
    if (field === 'assigneeId' && value) {
      const projectMembers = task.project.members;
      // 确保ID比较时类型一致
      const isMember = projectMembers.some(member => member.id.toString() === value.toString());
      if (!isMember) {
        return res.status(400).json({
          success: false,
          message: '只能分配给项目成员'
        });
      }
    }

    // 如果是分配迭代，验证迭代是否属于当前项目
    if (field === 'sprintId' && value) {
      const sprint = await Sprint.findOne({
        where: {
          id: value,
          projectId: task.projectId
        }
      });
      if (!sprint) {
        return res.status(400).json({
          success: false,
          message: '只能分配给当前项目的迭代'
        });
      }
    }

    // 保存旧值用于活动记录
    const oldValue = task[field];

    // 更新字段
    await task.update({ [field]: value || null });

    // 记录活动
    const ActivityLogger = require('../utils/activityLogger');
    const oldData = { [field]: oldValue };
    const newData = { [field]: value || null };
    await ActivityLogger.logTaskUpdated(req.session.userId, task, oldData, newData, req);

    logger.info('任务字段更新成功:', { taskId, field, oldValue, newValue: value });

    // 获取更新后的显示值
    let displayValue = value;
    if (field === 'assigneeId' && value) {
      const assignee = task.project.members.find(member => member.id.toString() === value.toString());
      if (assignee) {
        displayValue = `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim() || assignee.username;
      }
    } else if (field === 'status') {
      const statusConfig = {
        'draft': '草稿',
        'published': '已发布',
        'in_progress': '进行中',
        'review': '待审核',
        'completed': '已完成',
        'cancelled': '已取消'
      };
      displayValue = statusConfig[value] || value;
    } else if (field === 'sprintId' && value) {
      const sprint = await Sprint.findByPk(value, {
        attributes: ['name']
      });
      if (sprint) {
        displayValue = sprint.name;
      }
    } else if (field === 'urgencyLevel') {
      const urgencyConfig = {
        'urgent': '紧急',
        'important': '重要',
        'normal': '普通',
        'delayed': '延期',
        'frozen': '冻结'
      };
      displayValue = urgencyConfig[value] || value;
    } else if (field === 'taskType') {
      const taskTypeConfig = {
        'requirement': '📋 需求',
        'task': '📝 通用任务',
        'bug': '🐛 缺陷',
        'epic': '🏰 史诗',
        'story': '📖 用户故事',
        'dev_task': '⚔️ 开发任务',
        'design_task': '🎨 设计任务',
        'test_task': '🏹 测试任务',
        'devops_task': '⚙️ 运维任务'
      };
      displayValue = taskTypeConfig[value] || value;
    }

    res.json({
      success: true,
      message: '更新成功',
      displayValue: displayValue
    });

  } catch (error) {
    logger.error('快速更新任务失败:', error);
    res.status(500).json({
      success: false,
      message: '更新失败'
    });
  }
});

// 快速状态变更API（保留兼容性）
router.post('/:id/status', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { status } = req.body;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    // 检查权限：管理员、任务发布者、负责人或审核人可以更改状态
    const hasPermission = req.session.user?.role === 'admin' ||
                         task.publisherId === req.session.userId ||
                         task.assigneeId === req.session.userId ||
                         task.reviewerId === req.session.userId;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '您没有权限更改此任务状态'
      });
    }

    // 验证状态值
    const validStatuses = ['draft', 'published', 'in_progress', 'review', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的状态值'
      });
    }

    const oldStatus = task.status;
    let updateData = { status };

    // 根据状态变更自动设置时间字段
    if (oldStatus !== status) {
      if (status === 'in_progress' && !task.startDate) {
        updateData.startDate = new Date();
      } else if (status === 'completed' && !task.completedAt) {
        updateData.completedAt = new Date();
      }
    }

    await task.update(updateData);

    // 记录活动
    const ActivityLogger = require('../utils/activityLogger');
    await ActivityLogger.logTaskStatusChanged(req.session.userId, task, oldStatus, status, req);

    logger.info(`任务状态更新: ${task.title} (${oldStatus} -> ${status})`, {
      taskId: task.id,
      userId: req.session.userId,
      oldStatus,
      newStatus: status
    });

    res.json({
      success: true,
      message: '任务状态更新成功',
      data: {
        taskId: task.id,
        oldStatus,
        newStatus: status,
        startDate: task.startDate,
        completedAt: task.completedAt
      }
    });

  } catch (error) {
    logger.error('更新任务状态失败:', error);
    res.status(500).json({
      success: false,
      message: '更新任务状态失败：' + error.message
    });
  }
});

// 接单功能
router.post('/:id/bid', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.userId;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查任务状态
    if (task.status !== 'published') {
      req.flash('error', '该任务当前不可接单');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查是否已有负责人
    if (task.assigneeId) {
      req.flash('error', '该任务已被接单');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查是否是任务发布者
    if (task.publisherId === userId) {
      req.flash('error', '不能接自己发布的任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 更新任务状态和负责人
    await task.update({
      assigneeId: userId,
      status: 'assigned',
      startDate: new Date()
    });

    logger.info(`任务接单成功: ${task.title}`, {
      taskId: task.id,
      assigneeId: userId
    });

    req.flash('success', '接单成功！任务已分配给您');
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('接单失败:', error);
    req.flash('error', '接单失败：' + error.message);
    res.redirect('back');
  }
});

// 开始任务
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.userId;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限
    if (task.assigneeId !== userId && req.session.user?.role !== 'admin') {
      req.flash('error', '只有任务负责人可以开始任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查任务状态
    if (task.status !== 'assigned') {
      req.flash('error', '任务当前状态不允许开始');
      return res.redirect(`/tasks/${taskId}`);
    }

    await task.update({
      status: 'in_progress',
      startDate: task.startDate || new Date()
    });

    req.flash('success', '任务已开始！');
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('开始任务失败:', error);
    req.flash('error', '开始任务失败：' + error.message);
    res.redirect('back');
  }
});

// 完成任务
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.userId;
    const { actualHours } = req.body;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限
    if (task.assigneeId !== userId && req.session.user?.role !== 'admin') {
      req.flash('error', '只有任务负责人可以完成任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查任务状态
    if (!['assigned', 'in_progress'].includes(task.status)) {
      req.flash('error', '任务当前状态不允许完成');
      return res.redirect(`/tasks/${taskId}`);
    }

    let updateData = {
      status: task.reviewerId ? 'review' : 'completed',
      completedAt: new Date()
    };

    if (actualHours) {
      updateData.actualHours = parseFloat(actualHours);
    }

    await task.update(updateData);

    const message = task.reviewerId ? '任务已提交审核！' : '任务已完成！';
    req.flash('success', message);
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('完成任务失败:', error);
    req.flash('error', '完成任务失败：' + error.message);
    res.redirect('back');
  }
});

// 归档任务
router.post('/:id/archive', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    // 检查权限：只有管理员、任务发布者可以归档
    const hasPermission = req.session.user?.role === 'admin' ||
                         task.publisherId === req.session.userId;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '您没有权限归档此任务'
      });
    }

    await task.update({ isArchived: true });

    // 如果是AJAX请求，返回JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        message: '任务已归档'
      });
    }

    req.flash('success', '任务已归档');
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('归档任务失败:', error);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({
        success: false,
        message: '归档任务失败'
      });
    }

    req.flash('error', '归档任务失败');
    res.redirect('/tasks');
  }
});

// 取消归档任务
router.post('/:id/unarchive', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    // 检查权限：只有管理员、任务发布者可以取消归档
    const hasPermission = req.session.user?.role === 'admin' ||
                         task.publisherId === req.session.userId;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '您没有权限取消归档此任务'
      });
    }

    await task.update({ isArchived: false });

    // 如果是AJAX请求，返回JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        message: '任务已取消归档'
      });
    }

    req.flash('success', '任务已取消归档');
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('取消归档任务失败:', error);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({
        success: false,
        message: '取消归档任务失败'
      });
    }

    req.flash('error', '取消归档任务失败');
    res.redirect('/tasks');
  }
});

// 任务图片上传接口
router.post('/upload-image', requireAuth, handleTaskImageUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    // 返回图片URL
    const imageUrl = `/uploads/task-images/${req.file.filename}`;

    res.json({
      success: true,
      location: imageUrl // TinyMCE需要location字段
    });

  } catch (error) {
    logger.error('任务图片上传失败:', error);
    res.status(500).json({ error: '图片上传失败' });
  }
});

module.exports = router;
