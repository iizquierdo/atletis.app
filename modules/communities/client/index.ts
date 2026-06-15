import React from 'react';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';
import CommunityModule from './CommunityModule';
import { COMMUNITY_TRANSLATIONS } from './translations';

const moduleDefinition: ModuleClientDefinition = {
  code: 'COMMUNITIES',
  mainNav: {
    id: 'communities',
    icon: 'fa-users-rectangle'
  },
  views: {
    Communities: ({ setView, currentUser, companyId, onSubTitleChange }) =>
      React.createElement(CommunityModule, { view: 'list', setView, currentUser, companyId, onSubTitleChange }),
    CommunityDetails: ({ setView, currentUser, companyId, onSubTitleChange }) =>
      React.createElement(CommunityModule, { view: 'details', setView, currentUser, companyId, onSubTitleChange })
  },
  sidebarSections: [
    {
      label: 'communities.title',
      items: [{ name: 'communities.list', view: 'Communities', icon: 'fa-users-rectangle' }]
    }
  ],
  breadcrumbs: {
    Communities: { main: 'communities.title', sub: 'communities.list' },
    CommunityDetails: { main: 'communities.title', sub: 'communities.details', listTarget: 'Communities' }
  },
  translations: COMMUNITY_TRANSLATIONS
};

export default moduleDefinition;
