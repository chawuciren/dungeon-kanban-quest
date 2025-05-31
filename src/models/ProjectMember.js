const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 项目成员表 - 管理用户在项目中的角色和权限
const ProjectMember = sequelize.define('ProjectMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // 用户在此项目中的角色（可以有多个）
  roles: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['developer'], // 默认为开发者角色，实际创建时会使用用户的role
    validate: {
      isValidRoles(value) {
        const validRoles = ['admin', 'product_manager', 'developer', 'tester', 'ui_designer', 'devops', 'client'];
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error('角色必须是非空数组');
        }
        for (const role of value) {
          if (!validRoles.includes(role)) {
            throw new Error(`无效的角色: ${role}`);
          }
        }
      }
    }
  },
  // 成员状态
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending'),
    defaultValue: 'active'
  },
  // 加入项目时间
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'joined_at'
  },
  // 邀请者
  invitedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invited_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // 项目内的权限设置
  permissions: {
    type: DataTypes.JSON,
    defaultValue: {
      canManageProject: false,
      canManageMembers: false,
      canCreateTasks: true,
      canAssignTasks: false,
      canDeleteTasks: false,
      canManageBudget: false,
      canViewReports: true
    }
  },
  // 备注信息
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'project_members',
  indexes: [
    {
      unique: true,
      fields: ['project_id', 'user_id']
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['invited_by']
    }
  ]
});

// 实例方法
ProjectMember.prototype.hasRole = function(role) {
  return this.roles.includes(role);
};

ProjectMember.prototype.addRole = function(role) {
  if (!this.hasRole(role)) {
    this.roles.push(role);
    this.changed('roles', true);
  }
  return this;
};

ProjectMember.prototype.removeRole = function(role) {
  const index = this.roles.indexOf(role);
  if (index > -1) {
    this.roles.splice(index, 1);
    this.changed('roles', true);
  }
  return this;
};

ProjectMember.prototype.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

ProjectMember.prototype.updatePermissions = function(newPermissions) {
  this.permissions = { ...this.permissions, ...newPermissions };
  this.changed('permissions', true);
  return this;
};

module.exports = ProjectMember;
