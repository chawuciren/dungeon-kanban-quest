const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 项目与组织的关联表
const ProjectOrganization = sequelize.define('ProjectOrganization', {
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
  organizationId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'organization_id',
    references: {
      model: 'organizations',
      key: 'id'
    }
  },
  // 关联类型：primary(主要组织), secondary(协作组织)
  relationshipType: {
    type: DataTypes.ENUM('primary', 'secondary'),
    defaultValue: 'secondary',
    field: 'relationship_type'
  },
  // 关联状态
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  // 关联时间
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'joined_at'
  }
}, {
  tableName: 'project_organizations',
  indexes: [
    {
      unique: true,
      fields: ['project_id', 'organization_id']
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['organization_id']
    },
    {
      fields: ['relationship_type']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = ProjectOrganization;
