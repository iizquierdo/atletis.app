import React from 'react';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';
import DisciplineModule from './DisciplineModule';
import { DISCIPLINE_TRANSLATIONS } from './translations';

const moduleDefinition: ModuleClientDefinition = {
  code: 'DISCIPLINES',
  mainNav: {
    id: 'disciplines',
    icon: 'fa-dumbbell'
  },
  views: {
    Disciplines: ({ setView, currentUser, companyId, onSubTitleChange }) =>
      React.createElement(DisciplineModule, { view: 'list', setView, currentUser, companyId, onSubTitleChange }),
    DisciplineDetails: ({ setView, currentUser, companyId, onSubTitleChange }) =>
      React.createElement(DisciplineModule, { view: 'details', setView, currentUser, companyId, onSubTitleChange })
  },
  sidebarSections: [
    {
      label: 'disciplines.title',
      items: [{ name: 'disciplines.list', view: 'Disciplines', icon: 'fa-dumbbell' }]
    }
  ],
  breadcrumbs: {
    Disciplines: { main: 'disciplines.title', sub: 'disciplines.list' },
    DisciplineDetails: { main: 'disciplines.title', sub: 'disciplines.details', listTarget: 'Disciplines' }
  },
  translations: DISCIPLINE_TRANSLATIONS
};

export default moduleDefinition;
