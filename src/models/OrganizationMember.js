const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 组织成员表 - 管理用户在组织中的成员关系
const OrganizationMember = sequelize.define('OrganizationMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  organizationId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'organization_id',
    references: {
      model: 'organizations',
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
  // 用户在此组织中的角色（可以有多个）
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
  // 加入组织时间
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
  // 组织内的权限设置
  permissions: {
    type: DataTypes.JSON,
    defaultValue: {
      canManageOrganization: false,
      canManageMembers: false,
      canCreateProjects: true,
      canManageProjects: false,
      canViewReports: true,
      canManageBudget: false
    }
  },
  // 备注信息
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'organization_members',
  indexes: [
    {
      unique: true,
      fields: ['organization_id', 'user_id']
    },
    {
      fields: ['organization_id']
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
OrganizationMember.prototype.hasRole = function(role) {
  return this.roles.includes(role);
};

OrganizationMember.prototype.addRole = function(role) {
  if (!this.hasRole(role)) {
    this.roles.push(role);
    this.changed('roles', true);
  }
  return this;
};

OrganizationMember.prototype.removeRole = function(role) {
  const index = this.roles.indexOf(role);
  if (index > -1) {
    this.roles.splice(index, 1);
    this.changed('roles', true);
  }
  return this;
};

OrganizationMember.prototype.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

OrganizationMember.prototype.updatePermissions = function(newPermissions) {
  this.permissions = { ...this.permissions, ...newPermissions };
  this.changed('permissions', true);
  return this;
};

module.exports = OrganizationMember;
