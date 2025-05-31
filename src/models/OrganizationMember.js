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



OrganizationMember.prototype.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

OrganizationMember.prototype.updatePermissions = function(newPermissions) {
  this.permissions = { ...this.permissions, ...newPermissions };
  this.changed('permissions', true);
  return this;
};

module.exports = OrganizationMember;
